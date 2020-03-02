const fs = require('fs');
const path = require('path');
const PlayerController = require('media-player-controller');
const { WSClient } = require('./websocket');
const debug = require('debug')('playercast:player');
const cecClient = require('./cec');
const helper = require('./helper');
const keymap = require('./keymap');
const mdns = require('./mdns');
const terminal = require('./terminal');

var websocket;
var controller;
var cec;
var opts;
var isControlled = false;
var isLive = false;
var status;

module.exports =
{
	init: function(config)
	{
		opts = config;
		controller = new PlayerController(opts);

		if(!controller._getSupportedPlayers().includes(opts.app))
		{
			terminal.writeError(`Unsupported media player: ${opts.app}`);
			return this.closePlayercast();
		}

		const finishInit = () =>
		{
			if(opts.connectWs)
				this.createWs();
			else
				this.createMdns();
		}

		const onCecInit = (client) =>
		{
			if(client)
			{
				if(!terminal.quiet)
					process.stdout.write(' OK');

				cec = client;
				if(opts['cec-alt-remote'])
				{
					cec.events.on('keypress', (keyName) =>
						keymap.cecRemoteAlt(keyName, this)
					);
				}
				else
				{
					cec.events.on('keypress', (keyName) =>
						keymap.cecRemote(keyName, this)
					);
				}
			}
			else
			{
				terminal.writeLine('HDMI CEC is not supported');
			}

			if(terminal.quiet)
				finishInit();
			else
				setTimeout(() => finishInit(), 2000);
		}

		if(
			opts['disable-cec']
			|| !fs.existsSync('/usr/bin/cec-client')
		) {
			if(!opts.connectWs)
				return this.createMdns();
			else(opts.connectWs)
				return this.createWs();
		}

		terminal.writeLine('Checking HDMI CEC support...');
		cecClient().then(onCecInit);
	},

	createWs: function(url)
	{
		if(!opts || websocket) return;

		websocket = new WSClient(url || opts.websocket);

		websocket.on('connect', onPlayerConnect);
		websocket.on('disconnect', onPlayerDisconnect);
		websocket.on('playercast', onPlayerCast);
		websocket.on('invalid', onPlayerInvalid);
		websocket.on('remote-signal', onRemoteSignal);

		terminal.writeLine(`Connecting to ${websocket.io.uri}...`);
	},

	createMdns: function()
	{
		mdns.listen(opts.name, opts.port);
		terminal.writeLine(`${opts.name} waiting for connection...`);
	},

	closePlayercast: function(err)
	{
		const shutdown = () =>
		{
			if(isControlled && websocket)
				websocket.emitEvent('show-remote', false);

			if(cec) cec.events.closeClient();

			if(err)
			{
				console.error(err);
				return process.exit(1);
			}

			terminal.writeLine('Playercast closed');

			process.stdout.write('\n');
			process.exit(0);
		}

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
			if(err) terminal.writeError(err.message);
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

		websocket.emitEvent('playercast-ctl', 'previous-track');
	},

	nextTrack: function()
	{
		if(!controller || !isControlled) return;

		websocket.emitEvent('playercast-ctl', 'next-track');
	},

	_changeHost: function(data)
	{
		if(websocket)
			return websocket.changeHost(data);

		var url = helper.convToUrl(data);
		if(url) this.createWs(url);
	}
}

function onPlayerCast(msg)
{
	isControlled = (opts.name === msg.name);

	if(!isControlled)
		return;

	if(!controller)
		return terminal.writeError('Controller not initialized!');

	isLive = (msg.streamType && msg.streamType.startsWith('VIDEO_'));

	var isUrl = helper.getIsUrl(msg.filePath);

	controller.opts.media = (isUrl) ? msg.filePath : `${websocket.io.uri}/cast`;
	opts.subtitles = `${websocket.io.uri}/subs`;
	opts.cover = `${websocket.io.uri}/cover`;

	const launchPlayer = async(isRestart) =>
	{
		if(cec && !isRestart)
		{
			terminal.writeLine('Sending HDMI CEC signals...');

			await cec.ctl.dev0.turnOn();

			cec.ctl.setActive().then(() =>
			{
				if(opts['cec-force-switch'] && cec.hdmi)
					cec.ctl.dev0.changeSource(cec.hdmi);
			});
		}

		controller.opts.args = getPlayerArgs(msg, isUrl);

		if(debug.enabled)
		{
			debug(`Media source: ${controller.opts.media}`);
			debug(`Player args: ${JSON.stringify(controller.opts.args)}`);
		}

		terminal.writeLine(`Starting ${opts.app}...`);

		controller.launch(err =>
		{
			if(err) return terminal.writeError(err.message);

			handlePlayerLaunch();
		});
	}

	if(controller.process && controller.connected)
	{
		terminal.writeLine('Loading new media...');

		setPlayerProperties(msg);

		controller.load(opts.media, (err) =>
		{
			if(!err)
			{
				terminal.writeLine('File loaded');

				controller.play();
				return websocket.emitEvent('show-remote', true);
			}

			terminal.writeLine('Restarting media player...');
			controller.once('app-exit', () => launchPlayer(true));

			controller.quit(err =>
			{
				if(err) terminal.writeError(err.message);
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
	terminal.writeLine(`Connected to ${websocket.io.uri}`);

	if(opts.name)
		websocket.emitEvent('playercast-connect', opts.name);
}

function onPlayerDisconnect()
{
	isControlled = false;
	debug('Media player disconnected');

	if(opts.connectWs)
		return terminal.writeLine(`Connecting to ${websocket.io.uri}...`);

	websocket.io.reconnection(false);
	terminal.writeLine(`${opts.name} waiting for connection...`);
}

function onPlayerInvalid(msg)
{
	switch(msg)
	{
		case 'name':
			terminal.writeError(
				`Playercast name "${opts.name}" is already used on another device!`
			);
			process.exit(1);
			break;
		case false:
			terminal.writeLine(`${opts.name} waiting for media cast...`);
			break;
		default:
			break;
	}
}

function onRemoteSignal(msg)
{
	keymap.extRemote(msg, module.exports);
}

function handlePlayerLaunch()
{
	terminal.writeLine('Player started');

	resetStatus();
	controller.on('playback', updateStatus);
	websocket.emitEvent('show-remote', true);

	controller.once('app-exit', (code) =>
	{
		isControlled = false;
		controller.removeListener('playback', updateStatus);
		websocket.emitEvent('show-remote', false);
		debug('Player exited');

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
			terminal.writeError(`Player exited with status code: ${code}`);

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
			terminal.writePlayerStatus(status, isLive);
			break;
		case 'time-pos':
			status.currentTime = event.value;
			terminal.writePlayerStatus(status, isLive);
			break;
		case 'duration':
			status.media.duration = event.value;
			break;
		case 'pause':
			status.playerState = (event.value === true) ? 'PAUSED' : 'PLAYING';
			terminal.writePlayerStatus(status, isLive);
			break;
		case 'eof-reached':
			if(event.value === true)
				websocket.emitEvent('playercast-ctl', 'track-ended');
			break;
		default:
			terminal.writeError(`Unhandled event: ${event}`);
			break;
	}

	websocket.emitEvent('status-update', status);
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

function getPlayerArgs(selection, isUrl)
{
	var args = [];

	switch(opts.app)
	{
		case 'mpv':
			var mpvUniversal = ['--fullscreen', '--volume-max=100',
				'--keep-open=yes', '--image-display-duration=inf', '--vid=1',
				`--external-file=${opts.cover}`, `--sub-file=${opts.subtitles}`,
				`--force-media-title=${getMediaTitle(selection)}`];
			const mpvVideo = ['--loop=no', '--osc=yes', '--cache=auto'];
			const mpvPicture = ['--loop=inf', '--osc=no', '--cache=auto'];
			const mpvDesktop = ['--loop=no', '--osc=yes', '--cache=no'];

			if(!isUrl) mpvUniversal.unshift('--no-ytdl');

			if(selection.streamType === 'PICTURE')
				args = [...mpvUniversal, ...mpvPicture];
			else if(selection.addon === 'DESKTOP')
				args = [...mpvUniversal, ...mpvDesktop];
			else
				args = [...mpvUniversal, ...mpvVideo];
			break;
		case 'vlc':
		case 'cvlc':
		case 'vlc-rpc':
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
	if(selection.mediaData && selection.mediaData.title)
		return selection.mediaData.title;

	var title = path.parse(selection.filePath).name;

	return (title) ? title : 'Playercast';
}
