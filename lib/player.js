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
var changingTrack = false;
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
			terminal.enableKeyInput(this);

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
				terminal.writeLine('HDMI-CEC is not supported');
			}

			if(terminal.quiet)
				finishInit();
			else
				setTimeout(() => finishInit(), 2000);
		}

		if(
			opts['disable-cec']
			|| !fs.existsSync('/usr/bin/cec-client')
		)
			return finishInit();

		terminal.writeLine('Checking HDMI-CEC support...');
		cecClient().then(client => onCecInit(client));
	},

	createWs: function(url)
	{
		if(!opts || websocket) return;

		websocket = new WSClient(url || opts.websocket);

		websocket.on('connect', onSenderConnect);
		websocket.on('disconnect', onSenderDisconnect);
		websocket.on('playercast', onMediaCast);
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
		if(position >= status.media.duration)
			position = status.media.duration - 1;

		this.action('seek', position);
	},

	previousTrack: function()
	{
		if(
			!controller
			|| !isControlled
			|| changingTrack
			|| status.playlist.index === 1
		)
			return;

		changingTrack = true;
		terminal.writeLine('Loading new media...');

		websocket.emitEvent('playercast-ctl', 'previous-track');
	},

	nextTrack: function()
	{
		if(
			!controller
			|| !isControlled
			|| changingTrack
			|| status.playlist.index >= status.playlist.length
		)
			return;

		changingTrack = true;
		terminal.writeLine('Loading new media...');

		websocket.emitEvent('playercast-ctl', 'next-track');
	},

	changeHost: function(data)
	{
		if(websocket)
			return websocket._changeHost(data);

		var url = helper.convToUrl(data);
		if(url) this.createWs(url);
	},

	getServerAddress: function()
	{
		if(!controller || !isControlled || !websocket)
			return null;

		return websocket.io.uri;
	}
}

function onMediaCast(msg)
{
	isControlled = (opts.name === msg.name);

	if(!isControlled)
		return;

	if(!controller)
		return terminal.writeError('Controller not initialized!');

	if(!changingTrack)
		terminal.writeLine('Received media cast');

	newStatus(msg);
	isLive = (msg.streamType && msg.streamType.startsWith('VIDEO_'));

	var isUrl = helper.getIsUrl(msg.filePath);

	controller.opts.media = (isUrl) ? msg.filePath : `${websocket.io.uri}/cast`;
	opts.subtitles = `${websocket.io.uri}/subs`;
	opts.cover = `${websocket.io.uri}/cover`;

	const launchPlayer = async(isRestart) =>
	{
		if(cec && !isRestart)
		{
			terminal.writeLine('Sending HDMI-CEC signals...');

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
			if(err)
			{
				if(isControlled && websocket)
					websocket.emitEvent('playercast-error', err.message);

				return terminal.writeError(err.message);
			}

			changingTrack = false;
			setPlayerProperties(msg);
			handlePlayerLaunch();
		});
	}

	if(!controller.process)
	{
		debug('No open media player process found');
		return launchPlayer(false);
	}

	setPlayerProperties(msg);

	debug(`Loading new media: ${controller.opts.media}`);
	controller.load(err =>
	{
		if(!err) return afterMediaLoad();

		debug('Error on media load');
		debug(err);

		/* Retry loading on fail */
		debug('Retrying media load...');
		controller.load(err =>
		{
			if(!err) return afterMediaLoad();

			debug('Error on media load retry');
			debug(err);

			terminal.writeLine('Restarting media player...');
			controller.once('app-exit', () => launchPlayer(true));

			controller.quit(err =>
			{
				if(err) terminal.writeError(err.message);
			});
		});
	});
}

function afterMediaLoad()
{
	terminal.writeLine('File loaded');
	changingTrack = false;

	websocket.emitEvent('show-remote', true);
	writeStatus();
	websocket.emitEvent('status-update', status);

	controller.play();
}

function onSenderConnect()
{
	terminal.writeLine(`Connected to ${websocket.io.uri}`);

	if(opts.name)
		websocket.emitEvent('playercast-connect', opts.name);
}

function onSenderDisconnect()
{
	if(controller && controller.process)
		controller.quit();

	isControlled = false;
	debug('Media server disconnected');

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

	controller.on('playback', updateStatus);
	controller.on('playback-started', onPlaybackStarted);
	process.stdout.on('resize', terminal.restoreText);
	websocket.emitEvent('show-remote', true);

	controller.once('app-exit', (code) =>
	{
		isControlled = false;
		controller.removeListener('playback', updateStatus);
		controller.removeListener('playback-started', onPlaybackStarted);
		process.stdout.removeListener('resize', terminal.restoreText);
		websocket.emitEvent('show-remote', false);
		debug('Player exited');

		if(cec)
		{
			cec.ctl.setInactive().then(() =>
			{
				var hdmiPort = opts['cec-end-hdmi'];

				if(!isNaN(hdmiPort))
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
			writeStatus();
			break;
		case 'time-pos':
			status.currentTime = event.value;
			writeStatus();
			break;
		case 'duration':
			status.media.duration = event.value;
			writeStatus();
			break;
		case 'pause':
			status.playerState = (event.value === true) ? 'PAUSED' : 'PLAYING';
			writeStatus();
			break;
		case 'eof-reached':
			if(event.value === true)
				return websocket.emitEvent('playercast-ctl', 'track-ended');
			break;
		default:
			terminal.writeError(`Unhandled event: ${event}`);
			break;
	}

	if(!changingTrack)
		websocket.emitEvent('status-update', status);
}

function writeStatus()
{
	if(!changingTrack)
		terminal.writePlayerStatus(status, isLive);
}

function newStatus(msg)
{
	status = {
		title: getMediaTitle(msg),
		playerState: (status && status.playerState) || 'PAUSED',
		currentTime: 0,
		media: { duration: 0 },
		volume: (status && status.volume) || 0,
		streamType: msg.streamType || 'VIDEO',
		subtitles: (msg.subsPath) ? true : false,
		playlist : {
			index: (msg.playlist && msg.playlist.index) ? msg.playlist.index : 1,
			length: (msg.playlist && msg.playlist.length) ? msg.playlist.length : 1
		}
	};

	if(!debug.enabled) return;

	debug('Generated new status:');
	debug(status);
}

function getPlayerArgs(selection, isUrl)
{
	debug(`Launching ${opts.app} with properties for ${selection.streamType} cast...`);

	var args = [];

	switch(opts.app)
	{
		case 'mpv':
			args = [
				'--fullscreen', '--volume-max=100',
				'--keep-open=yes', '--image-display-duration=inf', '--vid=1',
				`--external-file=${opts.cover}`, `--sub-file=${opts.subtitles}`
			];
			if(!isUrl)
				args.unshift('--no-ytdl');
			break;
		case 'vlc':
		case 'cvlc':
		case 'vlc-rpc':
			args = ['--fullscreen'];
			if(process.platform === 'win32')
				args.push('--video-on-top');
			break;
		default:
			break;
	}

	return args;
}

function setPlayerProperties(selection)
{
	debug(`Setting ${opts.app} properties for ${selection.streamType} cast...`);

	switch(opts.app)
	{
		case 'mpv':
			controller.command([
				'set_property', 'force-media-title', status.title
			]);
			if(selection.streamType === 'PICTURE')
				controller.command(['set_property', 'osc', 'no']);
			else
				controller.command(['set_property', 'osc', 'yes']);

			if(selection.addon === 'DESKTOP')
				controller.command(['set_property', 'cache', 'no']);
			else
				controller.command(['set_property', 'cache', 'auto']);
			break;
		default:
			break;
	}

	controller.setRepeat(false);
}

function onPlaybackStarted(isLoaded)
{
	if(!isLoaded) return;

	switch(opts.app)
	{
		case 'vlc':
		case 'cvlc':
			if(
				status.streamType.startsWith('VIDEO')
				&& status.subtitles
			) {
				helper.downloadSubs(opts.subtitles, (err, subsPath) =>
				{
					if(err) return;

					debug('Adding subtitles to VLC...');
					controller.addSubs(subsPath, (err) =>
					{
						if(err) return debug(err);

						debug('Subtitles added');
					});
				});
			}
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
