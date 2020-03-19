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

			terminal.writeLine(`Casting ${castType}...`);
			terminal.writeLine(`Searching for ${opts.name || 'Playercast'}...`);

			mdns.find(opts.name, (err, device) =>
			{
				if(err) return this.closeSender(err);

				if(!opts.name)
					opts.name = device.friendlyName;

				terminal.writeLine(`Found ${opts.name}`);
				terminal.device = opts.name;

				this.createServer(opts, device);
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

	createServer: function(opts, device)
	{
		const serverOpts = {
			filePath: helper.playlist[0],
			fullPath: opts.fullPath,
			isUrl: opts.isUrl,
			subsPath: opts.subs,
			port: opts.port || 9880
		};

		server.transmitter(serverOpts, (err) =>
		{
			if(err) return this.closeSender(err);

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
					port: serverOpts.port
				};

				terminal.writeLine(`Connecting to ${opts.name}...`);

				helper.httpRequest(reqOpts, reqData, (err) =>
				{
					if(err) return this.closeSender(err);

					terminal.writeLine('Send connection request');
				});
			});
		});
	}
}
