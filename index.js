#!/usr/bin/env node

const parseArgs = require('minimist');
const cliCursor = require('cli-cursor');
const player = require('./player');
const service = require('./service');
const terminal = require('./terminal');

process.on('SIGINT', () => player.close());
process.on('SIGTERM', () => player.close());
process.on('uncaughtException', (err) => player.close(err));
cliCursor.hide();

const opts = {
	boolean: ['quiet', 'cec-alt-remote', 'disable-cec', 'create-service', 'remove-service'],
	string: ['name', 'cec-end-hdmi'],
	alias: { q: 'quiet', n: 'name' },
	unknown: (option) => onUnknown(option)
};

const args = process.argv.slice(2);
const argv = parseArgs(args, opts);

if(argv['remove-service']) return service.remove();
else if(argv._.length !== 1) return terminal.showHelp();

const data = String(argv._[0]).split(':');
if(data.length > 2) return terminal.showHelp();

const server = {
	ip: data[0],
	port: (data[1] || 4000)
};

const link = `http://${server.ip}:${server.port}`;
const playerOpts = {
	media: `${link}/cast`,
	subtitles: `${link}/subs`,
	cover: `${link}/cover`,
	websocket: link,
	player: 'mpv',
	ipcPath: '/tmp/cast-socket'
};

var config = { ...playerOpts, ...argv };
config.name = (config.name) ? config.name : makeRandomName();

if(argv['create-service']) service.create(server, argv);
else if(argv['remove-service']) service.remove();
else {
	terminal.enableKeyInput(player);
	player.listen(config);
}

function onUnknown(option)
{
	if(option.includes('-'))
	{
		terminal.showHelp();
		process.exit();
	}
}

function makeRandomName()
{
	var text = "Playercast-";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	for(var i = 0; i < 4; i++)
	{
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}
