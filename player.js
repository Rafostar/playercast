const PlayerController = require('media-player-controller');
const CecController = require('cec-controller');
const ioClient = require('socket.io-client');
const fs = require('fs');
const cecClient = require('./cec');

var websocket;
var controller;
var cec;
var opts;
var isControlled = false;

var status = {
	playerState: 'PAUSED',
	currentTime: 0,
	media: { duration: 0 },
	volume: 0
};

var player =
{
	listen: (config) =>
	{
		opts = config;
		controller = new PlayerController(opts);

		var createWebSocket = () =>
		{
			websocket = ioClient(opts.websocket);
			writeLine(`Connecting to ${opts.websocket}...`);

			websocket.on('connect', () => onPlayerConnect());
			websocket.on('disconnect', () => onPlayerDisconnect());
			websocket.on('remote-signal', (msg) => onRemoteSignal(msg));
			websocket.on('playercast', (msg) => onPlayerCast(msg));
			websocket.on('invalid', (msg) => onPlayerInvalid(msg));
		}

		var onCecInit = (client) =>
		{
			if(client)
			{
				writeLine('HDMI CEC is supported');

				cec = client;
				if(!config['cec-alt-remote'])
					cec.events.on('keypress', onCecKeyPress);
				else
					cec.events.on('keypress', onCecKeyPressAlt);
			}
			else
			{
				writeLine('HDMI CEC is not supported');
			}

			setTimeout(createWebSocket, 2000);
		}

		if(config['disable-cec'] || !fs.existsSync('/usr/bin/cec-client'))
		{
			createWebSocket();
		}
		else
		{
			writeLine('Checking HDMI CEC support...');
			cecClient().then(onCecInit);
		}
	},

	close: (err) =>
	{
		writeLine('Playercast closing...');

		if(controller.process)
			controller.quit();

		if(isControlled && websocket)
			websocket.emit('show-remote', false);

		if(err)
		{
			writeError(err.message);
			process.exit(1);
		}
		else
		{
			writeLine('Playercast closed');
			process.stdout.write('\n');
			process.exit(0);
		}
	}
}

function onPlayerCast(msg)
{
	if(opts.name === msg.name)
		isControlled = true;
	else
		return isControlled = false;

	if(!controller)
		return writeError('Controller not initialized!');

	var launchPlayer = async(isRestart) =>
	{
		if(cec && !isRestart)
		{
			writeLine('Sending HDMI CEC signals...');

			await cec.ctl.dev0.turnOn();
			cec.ctl.setActive();
		}

		controller.opts.playerArgs = getPlayerArgs(msg);

		writeLine(`Starting ${opts.player}...`);
		controller.launch((err) =>
		{
			if(err) return writeError(err.message);
			onPlayerLaunch();
		});
	}

	if(controller.process && controller.player)
	{
		setPlayerProperties(msg);

		controller.player.load(opts.media, (err) =>
		{
			if(!err)
			{
				controller.player.play();
				return websocket.emit('show-remote', true);
			}

			controller.process.once('close', () => launchPlayer(true));

			controller.quit((err) =>
			{
				if(err) writeError(err.message);
			});
		});
	}
	else
	{
		launchPlayer(false);
	}
}

function onPlayerConnect()
{
	writeLine(`Connected to ${opts.websocket}`);
	if(opts.name) websocket.emit('playercast-connect', opts.name);
}

function onPlayerDisconnect()
{
	isControlled = false;
	writeLine('WebSocket disconnected');
}

function onPlayerLaunch()
{
	controller.process.stdout.once('data', () =>
	{
		if(controller.player.socket)
			controller.player.socket.on('data', (data) => updateStatus(data));

		writeLine('Player started');
		websocket.emit('show-remote', true);
	});

	controller.process.once('close', (code) =>
	{
		isControlled = false;
		websocket.emit('show-remote', false);

		if(cec)
		{
			cec.ctl.setInactive().then(() =>
			{
				var hdmiPort = opts['cec-end-hdmi'];

				if(hdmiPort > 0 && hdmiPort < 10)
					cec.ctl.dev0.changeSource(hdmiPort);
			});
		}

		if(code) writeError(`Player exited with status code: ${code}`);

		writeLine(`${opts.name} waiting for media cast...`);
	});

	controller.process.once('error', (err) => writeError(err.message));
}

function onRemoteSignal(msg)
{
	if(!controller || !isControlled) return;

	var position;

	switch(msg.action)
	{
		case 'PLAY':
			controller.player.play((err) =>
			{
				if(err) writeError(err.message);
			});
			break;
		case 'PAUSE':
			controller.player.pause((err) =>
			{
				if(err) writeError(err.message);
			});
			break;
		case 'SEEK':
			position = msg.value * status.media.duration;
			controller.player.seek(position, (err) =>
			{
				if(err) writeError(err.message);
			});
			break;
		case 'SEEK+':
			position = status.currentTime + msg.value;
			if(position < status.media.duration)
			{
				controller.player.seek(position, (err) =>
				{
					if(err) writeError(err.message);
				});
			}
			break;
		case 'SEEK-':
			position = status.currentTime - msg.value;
			if(position < 0) position = 0;
			controller.player.seek(position, (err) =>
			{
				if(err) writeError(err.message);
			});
			break;
		case 'VOLUME':
			controller.player.setVolume(msg.value * 100, (err) =>
			{
				if(err) writeError(err.message);
			});
			break;
		case 'STOP':
			controller.quit((err) =>
			{
				if(err) writeError(err.message);
			});
			break;
		default:
			break;
	}
}

function onCecKeyPress(keyName)
{
	if(!controller || !isControlled) return;

	var value;
	var seekTime = 10;

	switch(keyName)
	{
		case 'select':
			controller.player.cycleFullscreen();
			break;
		case 'up':
			controller.player.cycleVideo();
			break;
		case 'down':
			controller.player.cycleAudio();
			break;
		case 'left':
			websocket.emit('playercast-ctl', 'previous-track');
			break;
		case 'right':
			websocket.emit('playercast-ctl', 'next-track');
			break;
		case 'play':
			onRemoteSignal({ action: 'PLAY' });
			break;
		case 'pause':
			onRemoteSignal({ action: 'PAUSE' });
			break;
		case 'rewind':
			onRemoteSignal({ action: 'SEEK-', value: seekTime });
			break;
		case 'fast-forward':
			onRemoteSignal({ action: 'SEEK+', value: seekTime });
			break;
		case 'subtitle':
			controller.player.cycleSubs();
			break;
		case 'exit':
		case 'stop':
			onRemoteSignal({ action: 'STOP' });
			break;
		default:
			break;
	}
}

function onCecKeyPressAlt(keyName)
{
	if(!controller || !isControlled) return;

	var value;
	var seekTime = 10;

	switch(keyName)
	{
		case 'select':
			controller.player.cyclePause();
			break;
		case 'up':
			websocket.emit('playercast-ctl', 'next-track');
			break;
		case 'down':
			websocket.emit('playercast-ctl', 'previous-track');
			break;
		case 'left':
		case 'rewind':
			onRemoteSignal({ action: 'SEEK-', value: seekTime });
			break;
		case 'right':
		case 'fast-forward':
			onRemoteSignal({ action: 'SEEK+', value: seekTime });
			break;
		case 'red':
			controller.player.cycleVideo();
			break;
		case 'green':
			controller.player.cycleAudio();
			break;
		case 'yellow':
		case 'subtitle':
			controller.player.cycleSubs();
			break;
		case 'blue':
			controller.player.cycleFullscreen();
			break;
		case 'play':
			onRemoteSignal({ action: 'PLAY' });
			break;
		case 'pause':
			onRemoteSignal({ action: 'PAUSE' });
			break;
		case 'exit':
		case 'stop':
			onRemoteSignal({ action: 'STOP' });
			break;
		default:
			break;
	}
}

function onPlayerInvalid(msg)
{
	switch(msg)
	{
		case 'name':
			writeError(`Playercast name "${opts.name}" is already used on another device!`);
			process.exit(1);
			break;
		case false:
			writeLine(`${opts.name} waiting for media cast...`);
			break;
		default:
			break;
	}
}

function updateStatus(data)
{
	const msgArray = data.split('\n');

	for(var i = 0; i < msgArray.length - 1; i++)
	{
		var msg = JSON.parse(msgArray[i]);
		if(msg.event === 'property-change')
		{
			switch(msg.name)
			{
				case 'volume':
					var volume = msg.data / 100;
					if(volume > 1) volume = 1;
					status.volume = volume;
					writePlayerStatus();
					break;
				case 'time-pos':
					var floorCurr = Math.floor(status.currentTime);
					var floorData = Math.floor(msg.data);
					status.currentTime = msg.data;
					if(Math.abs(floorCurr - floorData) >= 1)
					{
						writePlayerStatus();
						websocket.emit('status-update', status);
					}
					break;
				case 'duration':
					status.media.duration = msg.data;
					break;
				case 'pause':
					status.playerState = (msg.data === true) ? 'PAUSED' : 'PLAYING';
					writePlayerStatus();
					break;
				case 'eof-reached':
					if(msg.data === true)
						websocket.emit('playercast-ctl', 'track-ended');
					break;
				default:
					writeError(`Unhandled property: ${msg}`);
					break;
			}

			if(msg.name !== 'time-pos')
				websocket.emit('status-update', status);
		}
	}
}

function getPlayerArgs(selection)
{
	var args = [''];

	switch(opts.player)
	{
		case 'mpv':
			const mpvUniversal = ['--no-ytdl', '--fullscreen', '--volume-max=100',
				'--keep-open=yes', `--sub-file=${opts.subtitles}`, '--image-display-duration=inf',
				`--force-media-title=${getMediaTitle(selection)}`];
			const mpvVideo = ['--loop=no', '--osc=yes', '--cache=auto'];
			const mpvPicture = ['--loop=inf', '--osc=no', '--cache=auto'];
			const mpvDesktop = ['--loop=no', '--osc=yes', '--cache=no'];

			if(selection.streamType === 'PICTURE')
				args = [ ...mpvUniversal, ...mpvPicture];
			else if(selection.addon === 'DESKTOP')
				args = [ ...mpvUniversal, ...mpvDesktop];
			else
				args = [ ...mpvUniversal, ...mpvVideo];
			break;
		default:
			writeError(`Cannot get args for unsupported media player: ${opts.player}`);
			break;
	}

	return args;
}

function setPlayerProperties(selection)
{
	switch(opts.player)
	{
		case 'mpv':
			controller.player.command(['set_property', 'force-media-title', getMediaTitle(selection)]);
			if(selection.streamType === 'PICTURE')
			{
				controller.player.setRepeat(true);
				controller.player.command(['set_property', 'osc', 'no']);
				controller.player.command(['set_property', 'cache', 'auto']);
				break;
			}
			controller.player.setRepeat(false);
			controller.player.command(['set_property', 'osc', 'yes']);
			if(selection.addon === 'DESKTOP')
				controller.player.command(['set_property', 'cache', 'no']);
			else
				controller.player.command(['set_property', 'cache', 'auto']);
			break;
		default:
			writeError(`Cannot set properties of unsupported media player: ${opts.player}`);
			break;
	}
}

function getMediaTitle(selection)
{
	if(selection.title) return selection.title;
	else
	{
		var filename = selection.filePath;
		var title = filename.substring(filename.lastIndexOf('/') + 1, filename.lastIndexOf('.'));

		if(title) return title;
		else return "Playercast";
	}
}

function convertTime(time)
{
	var hours = ('0' + Math.floor(time / 3600)).slice(-2);
	time -= hours * 3600;
	var minutes = ('0' + Math.floor(time / 60)).slice(-2);
	time -= minutes * 60;
	var seconds = ('0' + Math.floor(time)).slice(-2);

	return `${hours}:${minutes}:${seconds}`;
}

function writePlayerStatus()
{
	if(	opts.quiet
		|| !(status.currentTime > 0)
		|| !(status.media.duration > 0)
	) {
		return;
	}

	var text = status.playerState;
	while(text.length < 8) text += ' ';

	var current = convertTime(status.currentTime);
	var total = convertTime(status.media.duration);
	var volume = Math.floor(status.volume * 100);

	text += `${current}/${total} VOLUME:${volume}`;

	while(text.length < 36) text += ' ';

	process.stdout.cursorTo(0);
	process.stdout.write(text);
}

function writeLine(text)
{
	if(opts.quiet) return;

	process.stdout.cursorTo(0);
	process.stdout.clearLine(0);
	process.stdout.write(text);
}

function writeError(text)
{
	if(opts.quiet) console.error(text);
	else console.error('\n' + text);
}

module.exports = player;
