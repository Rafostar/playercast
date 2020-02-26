const fs = require('fs');
const path = require('path');
const PlayerController = require('media-player-controller');
const ioClient = require('socket.io-client');
const debug = require('debug')('playercast');
const cecClient = require('./cec');
const terminal = require('./terminal');
const keymap = require('./keymap');

var websocket;
var controller;
var cec;
var opts;
var isControlled = false;
var isLive = false;
var status;

var player =
{
	listen: function(config)
	{
		opts = config;

		if(debug.enabled)
			opts.quiet = true;

		controller = new PlayerController(opts);

		if(!controller._getSupportedPlayers().includes(opts.app))
		{
			terminal.writeError(`Unsupported media player: ${opts.app}`, opts.quiet);
			return this.closePlayercast();
		}

		var createWebSocket = () =>
		{
			websocket = ioClient(opts.websocket);

			if(!opts.quiet)
				terminal.writeLine(`Connecting to ${opts.websocket}...`);

			websocket.on('connect', onPlayerConnect);
			websocket.on('disconnect', onPlayerDisconnect);
			websocket.on('playercast', onPlayerCast);
			websocket.on('invalid', onPlayerInvalid);
			websocket.on('remote-signal', onRemoteSignal);
		}

		var onCecInit = (client) =>
		{
			if(client)
			{
				if(!opts.quiet)
					process.stdout.write(' OK');

				cec = client;
				if(opts['cec-alt-remote'])
				{
					cec.events.on('keypress', (keyName) =>
						keymap.cecRemoteAlt(keyName, player)
					);
				}
				else
				{
					cec.events.on('keypress', (keyName) =>
						keymap.cecRemote(keyName, player)
					);
				}
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

	closePlayercast: function(err)
	{
		const shutdown = () =>
		{
			if(isControlled && websocket)
				emitEvent('show-remote', false);

			if(cec) cec.events.closeClient();

			if(err)
			{
				console.error(err);
				return process.exit(1);
			}

			if(!opts.quiet)
				terminal.writeLine('Playercast closed');

			process.stdout.write('\n');
			process.exit(0);
		}

		if(!opts.quiet)
			terminal.writeLine('Playercast closing...');

		if(controller && controller.process)
			controller.quit(() => shutdown());
		else
			shutdown();
	},

	action: function(fnc, value)
	{
		if(!controller || !isControlled) return;

		const onActionError = (err) =>
		{
			if(err) terminal.writeError(err.message, opts.quiet);
		}

		if(typeof value !== 'undefined')
			controller[fnc](value, onActionError);
		else
			controller[fnc](onActionError);
	},

	setVolume: function(volume)
	{
		if(!controller || !isControlled) return;

		if(volume > 1) volume = 1;
		else if(volume < 0) volume = 0;

		this.action('setVolume', volume);
	},

	increaseVolume: function(value)
	{
		if(!controller || !isControlled) return;

		var volume = status.volume + value;
		this.setVolume(volume);
	},

	decreaseVolume: function(value)
	{
		if(!controller || !isControlled) return;

		var volume = status.volume - value;
		this.setVolume(volume);
	},

	seekPercent: function(value)
	{
		if(!controller || !isControlled) return;

		var position = value * status.media.duration;
		this.action('seek', position);
	},

	seekBackward: function(seekTime)
	{
		if(!controller || !isControlled) return;

		var position = status.currentTime - seekTime;
		if(position < 0) position = 0;
			this.action('seek', position);
	},

	seekForward: function(seekTime)
	{
		if(!controller || !isControlled) return;

		var position = status.currentTime + seekTime;
		if(position < status.media.duration)
			this.action('seek', position);
	},

	previousTrack: function()
	{
		if(!controller || !isControlled) return;

		emitEvent('playercast-ctl', 'previous-track');
	},

	nextTrack: function()
	{
		if(!controller || !isControlled) return;

		emitEvent('playercast-ctl', 'next-track');
	}
}

function onPlayerCast(msg)
{
	isControlled = (opts.name === msg.name);

	if(!isControlled)
		return isControlled;

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

			cec.ctl.setActive().then(() =>
			{
				if(opts['cec-force-switch'] && cec.hdmi)
					cec.ctl.dev0.changeSource(cec.hdmi);
			});
		}

		controller.opts.args = getPlayerArgs(msg);

		if(!opts.quiet)
			terminal.writeLine(`Starting ${opts.app}...`);

		controller.launch(err =>
		{
			if(err) return terminal.writeError(err.message, opts.quiet);
			handlePlayerLaunch();
		});
	}

	if(controller.process && controller.connected)
	{
		if(!opts.quiet)
			terminal.writeLine('Loading new media...');

		setPlayerProperties(msg);

		controller.load(opts.media, (err) =>
		{
			if(!err)
			{
				if(!opts.quiet)
					terminal.writeLine('File loaded');

				controller.play();
				return emitEvent('show-remote', true);
			}

			if(!opts.quiet)
				terminal.writeLine('Restarting media player...');

			controller.once('app-exit', () => launchPlayer(true));

			controller.quit(err =>
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
	if(!opts.quiet)
		terminal.writeLine(`Connected to ${opts.websocket}`);

	if(opts.name)
		emitEvent('playercast-connect', opts.name);
}

function onPlayerDisconnect()
{
	isControlled = false;

	if(!opts.quiet)
		terminal.writeLine('WebSocket disconnected');
}

function onPlayerInvalid(msg)
{
	switch(msg)
	{
		case 'name':
			terminal.writeError(
				`Playercast name "${opts.name}" is already used on another device!`,
				opts.quiet
			);
			process.exit(1);
			break;
		case false:
			if(!opts.quiet)
				terminal.writeLine(`${opts.name} waiting for media cast...`);
			break;
		default:
			break;
	}
}

function onRemoteSignal(msg)
{
	keymap.gnomeRemote(msg, player);
}

function handlePlayerLaunch()
{
	if(!opts.quiet)
		terminal.writeLine('Player started');

	resetStatus();
	controller.on('playback', updateStatus);
	emitEvent('show-remote', true);

	controller.once('app-exit', (code) =>
	{
		isControlled = false;
		controller.removeListener('playback', updateStatus);
		emitEvent('show-remote', false);

		if(cec)
		{
			cec.ctl.setInactive().then(() =>
			{
				var hdmiPort = opts['cec-end-hdmi'];

				if(hdmiPort > 0 && hdmiPort < 10)
					cec.ctl.dev0.changeSource(hdmiPort);
			});
		}

		if(code)
			terminal.writeError(`Player exited with status code: ${code}`, opts.quiet);

		if(!opts.quiet)
			terminal.writeLine(`${opts.name} waiting for media cast...`);
	});
}

function updateStatus(event)
{
	switch(event.name)
	{
		case 'volume':
			if(event.value > 1) event.value = 1;
			status.volume = event.value;
			if(!opts.quiet) terminal.writePlayerStatus(status, isLive);
			break;
		case 'time-pos':
			status.currentTime = event.value;
			if(!opts.quiet) terminal.writePlayerStatus(status, isLive);
			break;
		case 'duration':
			status.media.duration = event.value;
			break;
		case 'pause':
			status.playerState = (event.value === true) ? 'PAUSED' : 'PLAYING';
			if(!opts.quiet) terminal.writePlayerStatus(status, isLive);
			break;
		case 'eof-reached':
			if(event.value === true)
				emitEvent('playercast-ctl', 'track-ended');
			break;
		default:
			terminal.writeError(`Unhandled event: ${event}`, opts.quiet);
			break;
	}

	emitEvent('status-update', status);
}

function resetStatus()
{
	status = {
		playerState: 'PAUSED',
		currentTime: 0,
		media: { duration: 0 },
		volume: 0
	};
}

function getPlayerArgs(selection)
{
	var args = [''];

	switch(opts.app)
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
		case 'vlc':
		case 'cvlc':
			args = ['--fullscreen'];
			break;
		default:
			break;
	}

	return args;
}

function setPlayerProperties(selection)
{
	switch(opts.app)
	{
		case 'mpv':
			controller.command([
				'set_property', 'force-media-title', getMediaTitle(selection)
			]);
			if(selection.streamType === 'PICTURE')
			{
				controller.setRepeat(true);
				controller.command(['set_property', 'osc', 'no']);
				controller.command(['set_property', 'cache', 'auto']);
				break;
			}
			controller.setRepeat(false);
			controller.command(['set_property', 'osc', 'yes']);
			if(selection.addon === 'DESKTOP')
				controller.command(['set_property', 'cache', 'no']);
			else
				controller.command(['set_property', 'cache', 'auto']);
			break;
		case 'vlc':
		case 'cvlc':
			controller.setRepeat(false);
			break;
		default:
			break;
	}
}

function getMediaTitle(selection)
{
	if(selection.title)
		return selection.title;

	var title = path.parse(selection.filePath).name;

	return (title) ? title : 'Playercast';
}

function emitEvent(name, value)
{
	websocket.emit(name, value);

	if(!debug.enabled) return;

	var val = (typeof value === 'object') ?
		JSON.stringify(value) : value;

	debug(`Emited: ${name}, value: ${val}`);
}

module.exports = player;
