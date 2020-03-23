const ip = require('internal-ip').v4;
const debug = require('debug')('playercast:sender');
const helper = require('./helper');
const mdns = require('./mdns');
const server = require('./server');
const terminal = require('./terminal');

module.exports =
{
	init: function(opts)
	{
		helper.checkPlaylistItem(0, (err, isUrl, fullPath) =>
		{
			if(err) return this.closeSender(err);

			const castType = (isUrl) ? 'link' : 'file';
			opts.isUrl = isUrl;
			opts.fullPath = fullPath;
			opts.port = opts.port || 9880;

			terminal.writeLine(`Casting ${castType}...`);

			this.createServer(opts, (err) =>
			{
				if(err) return this.closeSender(err);

				if(opts['disable-scan'])
					return terminal.writeLine(`Waitning for receiver on port: ${opts.port}`);

				terminal.writeLine(`Searching for ${opts.name || 'Playercast'}...`);

				mdns.find(opts.name, (err, device) =>
				{
					if(server.ws.eio.clientsCount > 0)
						return debug('Receiver connected, ignoring MDNS scan results');

					if(err) return this.closeSender(err);

					if(!opts.name)
						opts.name = device.friendlyName;

					terminal.writeLine(`Found ${opts.name}`);
					this._connectClient(opts, device);
				});
			});
		});
	},

	closeSender: function(err, sameLine)
	{
		if(err)
		{
			terminal.writeError(err, true);

			return process.exit(1);
		}

		terminal.writeLine('Playercast closed');

		process.stdout.write('\n');
		process.exit(0);
	},

	createServer: function(opts, cb)
	{
		const serverOpts = {
			filePath: helper.playlist[0],
			fullPath: opts.fullPath,
			isUrl: opts.isUrl,
			subsPath: opts.subs,
			port: opts.port
		};

		server.transmitter(serverOpts, cb);
	},

	_connectClient: function(opts, device)
	{
		const reqOpts = {
			hostname: device.ip,
			port: device.port || 9881
		};

		debug('Checking sender IP...');

		ip().then(address =>
		{
			if(!address)
			{
				return this.closeSender(
					new Error('Could not obtain sender IP')
				);
			}

			debug(`Sender IP: ${address}`);

			const reqData = {
				hostname: address,
				port: opts.port
			};

			terminal.writeLine(`Connecting to ${opts.name}...`);

			helper.httpRequest(reqOpts, reqData, (err) =>
			{
				if(err) return this.closeSender(err);

				terminal.writeLine('Send connection request');
			});
		});
	}
}
