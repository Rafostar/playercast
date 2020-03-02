const helper = require('./helper');
const mdns = require('./mdns');
const server = require('./server');
const terminal = require('./terminal');

module.exports =
{
	init: function(opts)
	{
		const isUrl = helper.getIsUrl(opts._[0]);

		if(!isUrl && !helper.existsSync(opts._[0]))
			return this.closeSender(new Error(`File '${opts._[0]}' does not exists`));

		const castType = (isUrl) ? 'link' : 'file';

		terminal.disableWriting();
		terminal.writeLine(`Casting ${castType}...`);
		terminal.writeLine(`Searching for ${opts.name || 'Playercast'}...`);

		mdns.find(opts.name, (err, device) =>
		{
			if(err) return this.closeSender(err);

			if(!opts.name)
				opts.name = device.friendlyName;

			terminal.writeLine(`Found ${opts.name}`);
			terminal.device = opts.name;

			const serverOpts = {
				filePath: opts._[0],
				isUrl: isUrl,
				subsPath: opts.subs,
				port: opts.port || 9880
			};

			server.transmitter(serverOpts, (err) =>
			{
				if(err) return this.closeSender(err);

				terminal.writeLine(`Connecting to ${opts.name}...`);

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

					terminal.writeLine('Send connection request');
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
