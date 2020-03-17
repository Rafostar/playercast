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
	if(argv.attach)
	{
		if(argv._.length)
			return terminal.showHelp();

		terminal.quiet = (argv.quiet || debug.enabled);
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

		terminal.quiet = (argv.quiet || debug.enabled);
		terminal.mode = 'Sender';
		helper.loadPlaylist(argv._);

		return sender.init(argv);
	}

	if(argv['create-service'])
	{
		if(argv._.length !== 1)
			return terminal.showHelp();

		return service.create(source, argv);
	}
	else if(argv['remove-service'])
	{
		return service.remove();
	}

	if(argv._.length > 1)
		return terminal.showHelp();

	connectClient(argv);
}

function connectClient(argv)
{
	var playerOpts = {
		ipcPath: '/tmp/playercast-socket'
	};

	if(argv._.length === 1)
	{
		const data = String(argv._[0]).split(':');
		if(data.length > 2)
			return terminal.showHelp();

		const source = {
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

	var config = { ...playerOpts, ...argv };

	if(!config.name)
		config.name = 'Playercast-' + helper.makeRandomString(4, true);

	terminal.device = config.name;
	config.app = (config.player) ? config.player.toLowerCase() : playerOpts.player;

	terminal.quiet = (argv.quiet || debug.enabled);
	terminal.disableWriting();
	terminal.enableKeyInput(player);

	if(playerOpts.connectWs)
		return player.init(config);

	server.receiver(config.port || 9881, (err) =>
	{
		if(err)
		{
			terminal.writeError(err);
			debug(err);

			return process.exit(1);
		}

		process.on('SIGINT', () => player.closePlayercast());
		process.on('SIGTERM', () => player.closePlayercast());
		process.on('uncaughtException', (err) => player.closePlayercast(err));

		player.init(config);
	});
}
