const helper = require('./helper');
const mdns = require('./mdns');
const server = require('./server');
const terminal = require('./terminal');

module.exports =
{
	init: function(opts)
	{
		var searchName = opts.name || 'Playercast';

		terminal.disableWriting();
		terminal.writeLine(`Searching for ${searchName}...`);

		mdns.find(opts.name, (err, device) =>
		{
			if(err) return this.closeSender(err);

			terminal.writeLine(`Found ${searchName}`);

			const serverOpts = {
				filePath: opts._[0],
				subsPath: opts.subs,
				port: opts.port || 9880
			};

			server.transmitter(serverOpts, (err) =>
			{
				if(err) return this.closeSender(err);

				terminal.writeLine(`Connecting to ${searchName}...`);

				const reqOpts = {
					hostname: device.ip,
					port: device.port || 9881
				};

				const reqData = {
					hostname: device.ip,
					port: serverOpts.port
				};

				helper.httpRequest(reqOpts, reqData, (err) =>
				{
					if(err) return this.closeSender(err);

					terminal.writeLine('Starting media player...');
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
	}
}
