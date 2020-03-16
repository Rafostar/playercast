#!/usr/bin/env node

const cliCursor = require('cli-cursor');
const parseArgs = require('minimist');
const playercast = require('./lib/index');
const terminal = require('./lib/terminal');

cliCursor.hide();

const opts = {
	boolean: [
		'quiet', 'cec-alt-remote', 'cec-force-switch', 'disable-cec',
		'listen', 'create-service', 'remove-service'
	],
	string: ['subs', 'name', 'player', 'cwd', 'port', 'cec-end-hdmi'],
	alias: { q: 'quiet', s: 'subs', n: 'name', p: 'player' },
	default: { p: (process.platform === 'win32') ? 'vlc' : 'mpv' },
	unknown: (option) => onUnknown(option)
};

const args = process.argv.slice(2);
const argv = parseArgs(args, opts);
init();

function init()
{
	if(!checkArgvStrings())
		return terminal.showHelp();

	const app = playercast(argv);
}

function onUnknown(option)
{
	if(!option.startsWith('-')) return;

	terminal.showHelp();
	process.exit(1);
}

function checkArgvStrings()
{
	if(
		argv.hasOwnProperty('cec-end-hdmi')
		&& (isNaN(argv['cec-end-hdmi']) || argv['cec-end-hdmi'] < 0)
	)
		return false;

	if(
		argv.hasOwnProperty('port')
		&& (isNaN(argv.port) || argv.port < 1 || argv.port > 65535)
	)
		return false;

	for(var key of opts.string)
		if(argv[key] === '') return false;

	return true;
}
