const debug = require('debug')('playercast:attach');
const { WSAttach } = require('./websocket');
const mdns = require('./mdns');
const helper = require('./helper');
const keymap = require('./keymap');
const terminal = require('./terminal');

module.exports =
{
	init: function(opts)
	{
		terminal.writeLine(`Searching for ${opts.name || 'Playercast'}...`);

		mdns.find(opts.name, (err, device) =>
		{
			if(err) return this.closeAttach(err);

			if(!opts.name)
				opts.name = device.friendlyName;

			terminal.writeLine(`Found ${opts.name}`);
			terminal.device = opts.name;

			this.connectSession(device);
		});
	},

	connectSession: function(device)
	{
		const reqOpts = {
			hostname: device.ip,
			port: device.port || 9880,
			method: 'GET',
			path: '/api/attach'
		};

		terminal.writeLine(`Connecting to ${device.friendlyName}...`);
		helper.httpRequestData(reqOpts, (err, data) =>
		{
			if(err) return this.closeAttach(err);

			terminal.writeLine(`Connected to ${device.friendlyName}`);

			if(!data.host)
			{
				return this.closeAttach(
					new Error(`${device.friendlyName} is inactive`)
				);
			}

			this.createWs(data.host);
		});
	},

	createWs: function(url)
	{
		var websocket = new WSAttach(url);

		terminal.writeLine(`Connecting to server: ${url}`);
		websocket.once('connect', () =>
		{
			terminal.writeLine(`Attaching to server...`);
			websocket.emit('attach-request');
		});

		websocket.once('attach-connect', (msg) =>
		{
			terminal.writeLine('Attached successfully');
			terminal.device = msg.name;

			terminal.disableWriting();
			terminal.clear();
			terminal.enableKeyInput(websocket);
			terminal.writePlayerStatus(msg);
			process.stdout.on('resize', terminal.restoreText);

			websocket.on('attach-status', (msg) => terminal.writePlayerStatus(msg));
			websocket.on('attach-show', (msg) =>
			{
				if(msg) return terminal.writeLine('File loaded');

				terminal.writeLine('Cast finished');

				process.stdout.write('\n');
				process.exit(0);
			});
		});
	},

	closeAttach: function(err, sameLine)
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
}
