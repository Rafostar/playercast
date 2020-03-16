const ioServer = require('socket.io');
const ioClient = require('socket.io-client');
const debug = require('debug')('playercast:websocket');
const helper = require('./helper');
const terminal = require('./terminal');

var clients = [];
var currReceiver;

class WSServer extends ioServer
{
	constructor(server, opts)
	{
		super(server, opts);

		this.castData = null;
		this.on('connection', this._handleMessages.bind(this));
	}

	emitRemote(action, value)
	{
		if(this.eio.clientsCount < 1) return;

		this.emit('remote-signal', { action, value });
	}

	action(text)
	{
		switch(text)
		{
			case 'cyclePause':
				this.emitRemote('CYCLEPAUSE');
				break;
			case 'cycleVideo':
				this.emitRemote('CYCLEVIDEO');
				break;
			default:
				break;
		}
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

		socket.on('status-update', this._onStatusUpdate);

		socket.on('show-remote', (msg) =>
		{
			this._onShowRemote(socket, msg);
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
		currReceiver = socket.playercastName;
		socket.emit('invalid', false);
		debug('Connect request accepted');

		this._castMedia(socket);
		terminal.writeLine('Starting media player...');
	}

	_onPlayercastDisconnect(socket)
	{
		if(!socket.playercastName) return;

		if(
			socket.playercastInvalid
			|| !clients.includes(socket.playercastName)
		)
			return;

		var index = clients.indexOf(socket.playercastName);
		clients.splice(index, 1);
		debug(`Disconnected: ${socket.playercastName}`);

		if(currReceiver !== socket.playercastName) return;

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
				if(lastId === 0)
					return this.closePlayercast();
			case 'next-track':
				if(lastId === 0)
					return;
				else if(trackId < lastId)
					trackId += 1;
				else
					trackId = 0;
				break;
			case 'previous-track':
				if(lastId === 0)
					return;
				else if(trackId === 0)
					trackId = lastId;
				else
					trackId -= 1;
				break;
			default:
				return;
		}

		helper.checkPlaylistItem(trackId, (err, isUrl, fullPath) =>
		{
			if(err)
			{
				if(msg === 'track-ended')
					return this.closePlayercast();

				trackId = 0;
			}

			/* Checks for metadata/subs/cover should be done from here */
			this.castData.filePath = helper.playlist[trackId];
			this.castData.fullPath = fullPath;

			this._castMedia(socket);
			terminal.writeLine('Changing track...');
		});
	}

	_onStatusUpdate(msg)
	{
		terminal.writePlayerStatus(msg);
	}

	_onShowRemote(socket, msg)
	{
		if(msg)
		{
			if(!debug.enabled)
				socket.once('status-update', () => terminal.clear());

			process.stdout.on('resize', terminal.restoreText);
			return terminal.writeLine('Player started');
		}

		process.stdout.removeListener('resize', terminal.restoreText);
		terminal.writeLine('Cast finished');

		process.stdout.write('\n');
		process.exit(0);
	}

	_castMedia(socket)
	{
		var castMsg = {
			name: socket.playercastName,
			streamType: 'VIDEO',
			filePath: this.castData.fullPath,
			mediaData: this.castData.mediaData
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

		debug(`Emited: ${name}, value: ${val}`);
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

module.exports = { WSServer, WSClient };
