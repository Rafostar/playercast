const ioServer = require('socket.io');
const ioClient = require('socket.io-client');
const debug = require('debug')('playercast');
const helper = require('./helper');

class WSServer extends ioServer
{
	constructor(server, opts)
	{
		super(server, opts);
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
}

class WSClient extends ioClient.Socket
{
	constructor(url, opts)
	{
		super(new ioClient.Manager(url, opts), '/');
	}

	emitEvent(name, value)
	{
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
