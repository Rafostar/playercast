const PlayerController = require('media-player-controller');
const ioClient = require('socket.io-client');
const cecClient = require('./cec');

var websocket;
var controller;
var cec;
var opts;

var updateInterval;
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

		writeLine('Checking HDMI CEC support...');
		cec = cecClient();

		websocket = ioClient(opts.websocket);
		writeLine(`Connecting to ${opts.websocket}...`);

		websocket.on('connect', () => onPlayerConnect());
		websocket.on('disconnect', () => onPlayerDisconnect());
		websocket.on('remote-signal', (msg) => onRemoteSignal(msg));
		websocket.on('playercast', (msg) => onPlayerCast(msg));
		websocket.on('invalid', (msg) => onPlayerInvalid(msg));
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

			var tvStatus = await cec.tv.getStatus();
			if(tvStatus === 'standby')
			{
				await cec.tv.turnOn();

				while(tvStatus !== 'on')
				{
					tvStatus = await cec.tv.getStatus();
				}
			}

			cec.setActive();
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
	updateInterval = setInterval(() => websocket.emit('status-update', status), 500);

	controller.process.stdout.once('data', () =>
	{
		if(controller.player.socket)
			controller.player.socket.on('data', (data) => updateStatus(data));

		writeLine('Player started');
		websocket.emit('show-remote', true);
	});

	controller.process.once('close', (code) =>
	{
		websocket.emit('show-remote', false);

		if(updateInterval)
		{
			clearInterval(updateInterval);
			updateInterval = null;
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
				if(err) return;
				status.playerState = 'PLAYING';
				websocket.emit('status-update', status);
			});
			break;
		case 'PAUSE':
			controller.player.pause((err) =>
			{
				if(err) return;
				status.playerState = 'PAUSED';
				websocket.emit('status-update', status);
			});
			break;
		case 'SEEK':
			position = msg.value * status.media.duration;
			controller.player.seek(position, (err) =>
			{
				if(err) return;
				status.currentTime = position;
				websocket.emit('status-update', status);
			});
			break;
		case 'SEEK+':
			position = status.currentTime + msg.value;
			if(position < status.media.duration)
			{
				controller.player.seek(position, (err) =>
				{
					if(err) return;
					status.currentTime = position;
					websocket.emit('status-update', status);
				});
			}
			break;
		case 'SEEK-':
			position = status.currentTime - msg.value;
			if(position < 0) position = 0;
			controller.player.seek(position, (err) =>
			{
				if(err) return;
				status.currentTime = position;
				websocket.emit('status-update', status);
			});
			break;
		case 'VOLUME':
			controller.player.setVolume(msg.value * 100, (err) =>
			{
				if(err) return;
				status.volume = msg.value;
				websocket.emit('status-update', status);
			});
			break;
		case 'STOP':
			controller.quit();
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
					break;
				case 'time-pos':
					status.currentTime = msg.data;
					break;
				case 'duration':
					status.media.duration = msg.data;
					break;
				case 'pause':
					status.playerState = (msg.data === true) ? 'PAUSED' : 'PLAYING';
					break;
				default:
					writeError(`Unhandled property: ${msg}`);
					break;
			}
		}
	}
}

function getPlayerArgs(selection)
{
	var args = [''];

	switch(opts.player)
	{
		case 'mpv':
			const mpvUniversal = ['--no-ytdl', '--fullscreen', `--sub-file=${opts.subtitles}`, '--image-display-duration=inf'];
			const mpvVideo = ['--loop=no', '--osc=yes'];
			const mpvPicture = ['--loop=inf', '--osc=no'];

			if(selection.streamType === 'PICTURE')
				args = [ ...mpvUniversal, ...mpvPicture];
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
			if(selection.streamType === 'PICTURE')
			{
				controller.player.setRepeat(true);
				controller.player.command(['set_property', 'osc', 'no']);
			}
			else
			{
				controller.player.setRepeat(false);
				controller.player.command(['set_property', 'osc', 'yes']);
			}
			break;
		default:
			writeError(`Cannot set properties of unsupported media player: ${opts.player}`);
			break;
	}
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
