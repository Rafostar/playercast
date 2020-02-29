const ioServer = require('socket.io');
const ioClient = require('socket.io-client');
const debug = require('debug')('playercast:websocket');
const helper = require('./helper');
const terminal = require('./terminal');

var clients = [];

class WSServer extends ioServer
{
	constructor(server, opts)
	{
		super(server, opts);

		this.filePath = null;
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

	closePlayercast()
	{
		this.emitRemote('STOP');
	}

	_handleMessages(socket)
	{
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
		socket.on('show-remote', this._onShowRemote);
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
		socket.emit('invalid', false);
		debug('Connect request accepted');

		socket.emit('playercast', {
			name: socket.playercastName,
			streamType: 'VIDEO',
			filePath: this.filePath
		});
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
	}

	_onPlayercastControl(socket, msg)
	{
		debug(`Playercast control msg: ${msg}`);

		switch(msg)
		{
			case 'track-ended':
				//socket.closePlayercast();
				break;
			case 'previous-track':
			case 'next-track':
				break;
			default:
				break;
		}
	}

	_onStatusUpdate(msg)
	{
		terminal.writePlayerStatus(msg);
	}

	_onShowRemote(msg)
	{
		if(msg) return;

		terminal.writeLine('Cast finished');

		process.stdout.write('\n');
		process.exit(0);
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

	changeHost(opts)
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
