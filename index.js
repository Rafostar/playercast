#!/usr/bin/env node

const parseArgs = require('minimist');
const cliCursor = require('cli-cursor');
const player = require('./player');
const service = require('./service');
const terminal = require('./terminal');

process.on('SIGINT', () => player.closePlayercast());
process.on('SIGTERM', () => player.closePlayercast());
process.on('uncaughtException', (err) => player.closePlayercast(err));
cliCursor.hide();

const opts = {
	boolean: [
		'quiet', 'cec-alt-remote', 'cec-force-switch', 'disable-cec',
		'create-service', 'remove-service'
	],
	string: ['name', 'player', 'cec-end-hdmi'],
	alias: { q: 'quiet', n: 'name', p: 'player' },
	unknown: (option) => onUnknown(option)
};

const args = process.argv.slice(2);
const argv = parseArgs(args, opts);

if(argv._.length !== 1)
	return terminal.showHelp();

const data = String(argv._[0]).split(':');
if(data.length > 2 || !checkArgvStrings())
	return terminal.showHelp();

const server = {
	ip: data[0],
	port: (data[1] || 4000)
};

if(isNaN(server.port) || server.port < 1 || server.port > 65535)
	return terminal.showHelp();

const link = `http://${server.ip}:${server.port}`;
const playerOpts = {
	player: 'mpv',
	media: `${link}/cast`,
	subtitles: `${link}/subs`,
	cover: `${link}/cover`,
	websocket: link,
	ipcPath: '/tmp/cast-socket'
};

var config = { ...playerOpts, ...argv };
config.name = (config.name) ? config.name : makeRandomName();
config.app = (config.player) ? config.player.toLowerCase() : playerOpts.player;

if(argv['create-service']) service.create(server, argv);
else if(argv['remove-service']) service.remove();
else {
	terminal.enableKeyInput(player);
	player.listen(config);
}

function onUnknown(option)
{
	if(!option.includes('-')) return;

	terminal.showHelp();
	process.exit();
}

function checkArgvStrings()
{
	if(argv['cec-end-hdmi'] && isNaN(argv['cec-end-hdmi']))
		return false;

	for(var key of opts.string)
		if(argv[key] === '') return false;

	return true;
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
