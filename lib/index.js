const os = require('os');
const path = require('path');
const debug = require('debug')('playercast');
const helper = require('./helper');
const player = require('./player');
const sender = require('./sender');
const attach = require('./attach');
const service = require('./service');
const server = require('./server');
const terminal = require('./terminal');

module.exports = function(argv)
{
	terminal.quiet = (argv.quiet || debug.enabled);
	terminal.disableWriting();

	if(argv.attach)
	{
		if(argv._.length)
			return terminal.showHelp();

		terminal.mode = 'Attach';

		return attach.init(argv);
	}

	if(!argv.listen)
	{
		if(!argv._.length)
			return terminal.showHelp();

		process.on('SIGINT', () => sender.closeSender());
		process.on('SIGTERM', () => sender.closeSender());
		process.on('uncaughtException', (err) => sender.closeSender(err));

		terminal.mode = 'Sender';
		helper.loadPlaylist(argv._);

		return sender.init(argv);
	}

	if(argv._.length > 1)
		return terminal.showHelp();

	connectClient(argv);
}

function connectClient(argv)
{
	var playerOpts = {
		ipcPath: path.join(os.tmpdir(), 'playercast-socket')
	};

	var source = null;

	if(argv._.length === 1)
	{
		const data = String(argv._[0]).split(':');
		if(data.length > 2)
			return terminal.showHelp();

		source = {
			ip: data[0],
			port: (data[1] || 4000)
		};

		if(
			isNaN(source.port)
			|| source.port < 1
			|| source.port > 65535
		)
			return terminal.showHelp();

		const link = `http://${source.ip}:${source.port}`;

		playerOpts.websocket = link;
		playerOpts.connectWs = true;
	}

	if(!argv.name)
		argv.name = 'Playercast-' + helper.makeRandomString(4, true);

	if(argv['create-service'])
		return service.create(source, argv);
	else if(argv['remove-service'])
		return service.remove();

	var config = { ...playerOpts, ...argv };

	terminal.device = config.name;
	config.app = (config.player) ? config.player.toLowerCase() : playerOpts.player;

	terminal.enableKeyInput(player);

	if(playerOpts.connectWs)
		return player.init(config);

	server.receiver(config.port || 9881, (err) =>
	{
		if(err)
		{
			terminal.writeError(err, true);

			return process.exit(1);
		}

		process.on('SIGINT', () => player.closePlayercast());
		process.on('SIGTERM', () => player.closePlayercast());
		process.on('uncaughtException', (err) => player.closePlayercast(err));

		player.init(config);
	});
}
