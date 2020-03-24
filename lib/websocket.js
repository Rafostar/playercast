const ioServer = require('socket.io');
const ioClient = require('socket.io-client');
const debug = require('debug')('playercast:websocket');
const helper = require('./helper');
const terminal = require('./terminal');

var clients = [];
var currStatus;
var remoteShown;

class WSServer extends ioServer
{
	constructor(server, opts)
	{
		super(server, opts);

		this.castData = {};
		this.on('connection', this._handleMessages.bind(this));
	}

	emitRemote(action, value)
	{
		if(this.eio.clientsCount < 1) return;

		var msg = { action, value };
		this.emit('remote-signal', msg);

		if(!debug.enabled) return;

		debug(`Emited: remote-signal, msg: ${JSON.stringify(msg)}`);
	}

	emitAttach(type, data)
	{
		/* Receiver + Attached = 2 clients min */
		if(this.eio.clientsCount < 2) return;

		this.emit(`attach-${type}`, data);
	}

	action(text)
	{
		this.emitRemote(text.toUpperCase());
	}

	increaseVolume(value)
	{
		this.emitRemote('VOLUME+', value);
	}

	decreaseVolume(value)
	{
		this.emitRemote('VOLUME-', value);
	}

	seekForward(value)
	{
		this.emitRemote('SEEK+', value);
	}

	seekBackward(value)
	{
		this.emitRemote('SEEK-', value);
	}

	previousTrack()
	{
		const itemIndex = helper.playlist.indexOf(this.castData.filePath) + 1;
		if(itemIndex === 1) return;

		this.emitRemote('SKIP-');
	}

	nextTrack()
	{
		const itemIndex = helper.playlist.indexOf(this.castData.filePath) + 1;
		if(itemIndex >= helper.playlist.length) return;

		this.emitRemote('SKIP+');
	}

	closePlayercast()
	{
		this.emitRemote('STOP');
	}

	_handleMessages(socket)
	{
		debug('Established websocket connection');

		socket.on('playercast-connect', (msg) =>
		{
			this._onPlayercastConnect(socket, msg);
		});

		socket.on('disconnect', () =>
		{
			this._onPlayercastDisconnect(socket);
		});

		socket.on('playercast-ctl', (msg) =>
		{
			this._onPlayercastControl(socket, msg);
		});

		socket.on('status-update', (msg) =>
		{
			currStatus = msg;
			this._onStatusUpdate(msg);
		});

		socket.on('show-remote', (msg) =>
		{
			this.emitAttach('show', msg);
			this._onShowRemote(socket, msg);
		});

		socket.on('playercast-error', (msg) =>
		{
			terminal.writeError(`Receiver error: ${msg}`, true);
			process.stdout.removeListener('resize', terminal.restoreText);

			process.exit(1);
		});

		socket.on('attach-request', () =>
		{
			socket.playercastAttach = true;
			this.emitAttach('connect', { name: terminal.device, ...currStatus });
		});

		socket.on('attach-remote', (msg) =>
		{
			this.emitRemote(msg.action, msg.value);
		});
	}

	_onPlayercastConnect(socket, msg)
	{
		socket.playercastName = msg;
		debug('New Playercast connect request');

		if(clients.includes(socket.playercastName))
		{
			socket.playercastInvalid = true;
			debug('Connect request rejected');

			return socket.emit('invalid', 'name');
		}

		clients.push(socket.playercastName);
		terminal.device = socket.playercastName;
		socket.emit('invalid', false);
		debug('Connect request accepted');

		this._castMedia(socket);
		terminal.writeLine('Starting media player...');
	}

	_onPlayercastDisconnect(socket)
	{
		if(socket.playercastAttach)
			debug('Disconnected attached controller');

		if(!socket.playercastName) return;

		if(
			socket.playercastInvalid
			|| !clients.includes(socket.playercastName)
		)
			return;

		var index = clients.indexOf(socket.playercastName);
		clients.splice(index, 1);
		debug(`Disconnected: ${socket.playercastName}`);

		if(terminal.device !== socket.playercastName) return;

		terminal.writeLine('Receiver disconnected');

		process.stdout.write('\n');
		process.exit(0);
	}

	_onPlayercastControl(socket, msg)
	{
		debug(`Playercast control msg: ${msg}`);
		const lastId = helper.playlist.length - 1;
		var trackId = helper.playlist.indexOf(this.castData.filePath);

		switch(msg)
		{
			case 'track-ended':
				if(trackId === lastId)
					return this.closePlayercast();
			case 'next-track':
				if(lastId === 0)
					return debug('Playlist has only one item');
				else if(trackId < lastId)
					trackId += 1;
				else
					return debug('End of playlist');
				break;
			case 'previous-track':
				if(lastId === 0)
					return debug('Playlist has only one item');
				else if(trackId === 0)
					return debug('Beginning of playlist');
				else
					trackId -= 1;
				break;
			default:
				return;
		}

		terminal.writeLine('Loading new media...');
		this.emitAttach('track-change');

		helper.checkPlaylistItem(trackId, (err, isUrl, fullPath) =>
		{
			if(err)
			{
				debug(err);

				if(msg === 'track-ended')
					return this.closePlayercast();

				trackId = 0;
			}

			var nextTrackPath = helper.playlist[trackId];

			if(isUrl)
			{
				debug('Playlist item is a link');

				this.castData.filePath = nextTrackPath;
				this.castData.fullPath = nextTrackPath;
				this.castData.subsPath = null;
				this.castData.coverPath = null;
				this.castData.mediaData = {};

				return this._castMedia(socket);
			}

			/* Checks for metadata/subs/cover should be done from here */
			helper.findSubsOrCover(nextTrackPath, (err, result) =>
			{
				this.castData.filePath = nextTrackPath;
				this.castData.fullPath = fullPath;

				if(err)
				{
					debug(err);

					this.castData.subsPath = null;
					this.castData.coverPath = null;
					this.castData.mediaData = {};

					terminal.writeLine('Changing item without media data...');
					return this._castMedia(socket);
				}

				this.castData.subsPath = (result.subsPath) ? result.subsPath : null;
				this.castData.coverPath = (result.coverPath) ? result.coverPath : null;
				this.castData.mediaData = result;

				this._castMedia(socket);
			});
		});
	}

	_onStatusUpdate(msg)
	{
		terminal.writePlayerStatus(msg);
		this.emitAttach('status', msg);
	}

	_onShowRemote(socket, msg)
	{
		process.stdout.removeListener('resize', terminal.restoreText);

		if(msg)
		{
			process.stdout.on('resize', terminal.restoreText);

			if(remoteShown)
				return terminal.writeLine('File loaded');
			else
			{
				remoteShown = true;

				if(!debug.enabled)
					socket.once('status-update', () => terminal.clear());

				if(!terminal.controlEnabled)
					terminal.enableKeyInput(this);

				return terminal.writeLine('Player started');
			}
		}

		terminal.writeLine('Cast finished');
		remoteShown = false;

		process.stdout.write('\n');
		process.exit(0);
	}

	_castMedia(socket)
	{
		var castMsg = {
			name: socket.playercastName,
			streamType: this.castData.mediaData.streamType || 'VIDEO',
			filePath: this.castData.fullPath,
			subsPath: this.castData.mediaData.subsPath || null,
			mediaData: this.castData.mediaData,
			playlist: {
				index: helper.playlist.indexOf(this.castData.filePath) + 1,
				length: helper.playlist.length
			}
		};

		socket.emit('playercast', castMsg);

		if(debug.enabled)
			debug(`Send msg: ${JSON.stringify(castMsg)}`);
	}
}

class WSClient extends ioClient.Socket
{
	constructor(url, opts)
	{
		super(new ioClient.Manager(url, opts), '/');
	}

	emitEvent(name, value)
	{
		if(!this.connected) return;

		this.emit(name, value);

		if(!debug.enabled) return;

		var val = (typeof value === 'object') ?
			JSON.stringify(value) : value;

		debug(`Emited: ${name}, msg: ${val}`);
	}

	_changeHost(opts)
	{
		if(
			opts.hostname == this.io.opts.hostname
			&& opts.port == this.io.opts.port
		) {
			if(this.io._reconnection) return;

			this.io.reconnection(true);

			return (this.disconnected) ?
				this.connect() : null;
		}

		var url = helper.convToUrl(opts);

		if(!url) return;

		this.io.uri = url;
		debug(`Changing server to: ${url}`);

		if(this.disconnected)
			return this.connect();

		this.disconnect();
		/* Socket.io does not have 'disconnected' event */
		setTimeout(() => this.connect(), 100);
	}
}

class WSAttach extends WSClient
{
	constructor(url, opts)
	{
		super(url, opts);

		this.on('disconnect', this._onAttachDisconnect);
	}

	emitRemote(action, value)
	{
		this.emitEvent('attach-remote', { action, value });
	}

	action(text)
	{
		this.emitRemote(text.toUpperCase());
	}

	increaseVolume(value)
	{
		this.emitRemote('VOLUME+', value);
	}

	decreaseVolume(value)
	{
		this.emitRemote('VOLUME-', value);
	}

	seekForward(value)
	{
		this.emitRemote('SEEK+', value);
	}

	seekBackward(value)
	{
		this.emitRemote('SEEK-', value);
	}

	previousTrack()
	{
		this.emitRemote('SKIP-');
	}

	nextTrack()
	{
		this.emitRemote('SKIP+');
	}

	closePlayercast()
	{
		this.emitRemote('STOP');
	}

	detachPlayercast()
	{
		if(this.connected)
			this.disconnect();

		terminal.writeLine('Playercast detached');

		process.stdout.write('\n');
		process.exit(0);
	}

	_onAttachDisconnect()
	{
		terminal.writeLine('Playercast disconnected');

		process.stdout.write('\n');
		process.exit(0);
	}
}

module.exports = { WSServer, WSClient, WSAttach };
