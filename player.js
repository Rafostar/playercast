const fs = require('fs');
const path = require('path');
const PlayerController = require('media-player-controller');
const ioClient = require('socket.io-client');
const cecClient = require('./cec');
const terminal = require('./terminal');
const keymap = require('./keymap');

var websocket;
var controller;
var cec;
var opts;
var isControlled = false;
var isLive = false;

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

			if(!opts.quiet)
				terminal.writeLine(`Connecting to ${opts.websocket}...`);

			websocket.on('connect', () => onPlayerConnect());
			websocket.on('disconnect', () => onPlayerDisconnect());
			websocket.on('remote-signal', (msg) => keymap.gnomeRemote(msg, player));
			websocket.on('playercast', (msg) => onPlayerCast(msg));
			websocket.on('invalid', (msg) => onPlayerInvalid(msg));
		}

		var onCecInit = (client) =>
		{
			if(client)
			{
				if(!opts.quiet)
					process.stdout.write(' OK');

				cec = client;
				if(opts['cec-alt-remote'])
					cec.events.on('keypress', (keyName) => keymap.cecRemoteAlt(keyName, player));
				else
					cec.events.on('keypress', (keyName) => keymap.cecRemote(keyName, player));
			}
			else
			{
				if(!opts.quiet)
					terminal.writeLine('HDMI CEC is not supported');
			}

			if(opts.quiet) createWebSocket();
			else setTimeout(createWebSocket, 2000);
		}

		if(opts['disable-cec'] || !fs.existsSync('/usr/bin/cec-client'))
		{
			createWebSocket();
		}
		else
		{
			if(!opts.quiet)
				terminal.writeLine('Checking HDMI CEC support...');

			cecClient().then(onCecInit);
		}
	},

	closePlayercast: (err) =>
	{
		if(!opts.quiet)
			terminal.writeLine('Playercast closing...');

		if(controller && controller.process)
			controller.quit();

		if(isControlled && websocket)
			websocket.emit('show-remote', false);

		if(cec) cec.events.closeClient();

		if(err)
		{
			console.error(err);
			process.exit(1);
		}
		else
		{
			if(!opts.quiet)
				terminal.writeLine('Playercast closed');

			process.stdout.write('\n');
			process.exit(0);
		}
	},

	action: (fnc, value) =>
	{
		if(!controller || !isControlled) return;

		var onActionError = (err) =>
		{
			if(err) terminal.writeError(err.message, opts.quiet);
		};

		if(fnc === 'quit')
			controller[fnc](onActionError);
		else if(typeof value !== 'undefined')
			controller.player[fnc](value, onActionError);
		else
			controller.player[fnc](onActionError);
	},

	setVolume: (volume) =>
	{
		if(!controller || !isControlled) return;

		player.action('setVolume', volume * 100);
	},

	increaseVolume: (value) =>
	{
		if(!controller || !isControlled) return;

		var volume = status.volume + value;
		if(volume > 1) volume = 1;

		player.setVolume(volume);
	},

	decreaseVolume: (value) =>
	{
		if(!controller || !isControlled) return;

		var volume = status.volume - value;
		if(volume < 0) volume = 0;

		player.setVolume(volume);
	},

	seekPercent: (value) =>
	{
		if(!controller || !isControlled) return;

		var position = value * status.media.duration;
		player.action('seek', position);
	},

	seekBackward: (seekTime) =>
	{
		if(!controller || !isControlled) return;

		var position = status.currentTime - seekTime;
		if(position < 0) position = 0;
			player.action('seek', position);
	},

	seekForward: (seekTime) =>
	{
		if(!controller || !isControlled) return;

		var position = status.currentTime + seekTime;
		if(position < status.media.duration)
			player.action('seek', position);
	},

	previousTrack: () =>
	{
		if(!controller || !isControlled) return;

		websocket.emit('playercast-ctl', 'previous-track');
	},

	nextTrack: () =>
	{
		if(!controller || !isControlled) return;

		websocket.emit('playercast-ctl', 'next-track');
	}
}

function onPlayerCast(msg)
{
	if(opts.name === msg.name)
		isControlled = true;
	else
		return isControlled = false;

	if(!controller)
		return terminal.writeError('Controller not initialized!', opts.quiet);

	isLive = (msg.streamType && msg.streamType.startsWith('VIDEO_')) ? true : false;

	var launchPlayer = async(isRestart) =>
	{
		if(cec && !isRestart)
		{
			if(!opts.quiet)
				terminal.writeLine('Sending HDMI CEC signals...');

			await cec.ctl.dev0.turnOn();
			cec.ctl.setActive();
		}

		controller.opts.playerArgs = getPlayerArgs(msg);

		if(!opts.quiet)
			terminal.writeLine(`Starting ${opts.player}...`);

		controller.launch((err) =>
		{
			if(err) return terminal.writeError(err.message, opts.quiet);
			onPlayerLaunch();
		});
	}

	if(controller.process && controller.player)
	{
		if(!opts.quiet)
			terminal.writeLine('Loading new media...');

		setPlayerProperties(msg);

		controller.player.load(opts.media, (err) =>
		{
			if(!err)
			{
				if(!opts.quiet)
					terminal.writeLine('File loaded');

				controller.player.play();
				return websocket.emit('show-remote', true);
			}

			if(!opts.quiet)
				terminal.writeLine('Restarting media player...');

			controller.process.once('close', () => launchPlayer(true));

			controller.quit((err) =>
			{
				if(err) terminal.writeError(err.message, opts.quiet);
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
	if(!opts.quiet) terminal.writeLine(`Connected to ${opts.websocket}`);
	if(opts.name) websocket.emit('playercast-connect', opts.name);
}

function onPlayerDisconnect()
{
	isControlled = false;
	if(!opts.quiet) terminal.writeLine('WebSocket disconnected');
}

function onPlayerLaunch()
{
	controller.process.stdout.once('data', () =>
	{
		if(controller.player.socket)
			controller.player.socket.on('data', (data) => updateStatus(data));

		if(!opts.quiet)
			terminal.writeLine('Player started');

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

		if(code) terminal.writeError(`Player exited with status code: ${code}`, opts.quiet);
		if(!opts.quiet) terminal.writeLine(`${opts.name} waiting for media cast...`);
	});

	controller.process.once('error', (err) => terminal.writeError(err.message, opts.quiet));
}

function onPlayerInvalid(msg)
{
	switch(msg)
	{
		case 'name':
			terminal.writeError(`Playercast name "${opts.name}" is already used on another device!`, opts.quiet);
			process.exit(1);
			break;
		case false:
			if(!opts.quiet) terminal.writeLine(`${opts.name} waiting for media cast...`);
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
					if(!opts.quiet) terminal.writePlayerStatus(status, isLive);
					break;
				case 'time-pos':
					var floorCurr = Math.floor(status.currentTime);
					var floorData = Math.floor(msg.data);
					status.currentTime = msg.data;
					if(Math.abs(floorCurr - floorData) >= 1)
					{
						if(!opts.quiet)
							terminal.writePlayerStatus(status, isLive);

						websocket.emit('status-update', status);
					}
					break;
				case 'duration':
					status.media.duration = msg.data;
					break;
				case 'pause':
					status.playerState = (msg.data === true) ? 'PAUSED' : 'PLAYING';
					if(!opts.quiet) terminal.writePlayerStatus(status, isLive);
					break;
				case 'eof-reached':
					if(msg.data === true)
						websocket.emit('playercast-ctl', 'track-ended');
					break;
				default:
					terminal.writeError(`Unhandled property: ${msg}`, opts.quiet);
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
				'--keep-open=yes', '--image-display-duration=inf', '--vid=1',
				`--external-file=${opts.cover}`, `--sub-file=${opts.subtitles}`,
				`--force-media-title=${getMediaTitle(selection)}`];
			const mpvVideo = ['--loop=no', '--osc=yes', '--cache=auto'];
			const mpvPicture = ['--loop=inf', '--osc=no', '--cache=auto'];
			const mpvDesktop = ['--loop=no', '--osc=yes', '--cache=no'];

			if(selection.streamType === 'PICTURE')
				args = [...mpvUniversal, ...mpvPicture];
			else if(selection.addon === 'DESKTOP')
				args = [...mpvUniversal, ...mpvDesktop];
			else
				args = [...mpvUniversal, ...mpvVideo];
			break;
		default:
			terminal.writeError(`Cannot get args for unsupported media player: ${opts.player}`, opts.quiet);
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
			terminal.writeError(`Cannot set properties of unsupported media player: ${opts.player}`, opts.quiet);
			break;
	}
}

function getMediaTitle(selection)
{
	if(selection.title) return selection.title;
	else
	{
		var title = path.parse(selection.filePath).name;

		if(title) return title;
		else return "Playercast";
	}
}

module.exports = player;
