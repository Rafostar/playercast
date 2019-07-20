#!/usr/bin/env node

const parseArgs = require('minimist');
const player = require('./player');
const service = require('./service');

const opts = {
	boolean: ['quiet', 'disable-cec', 'create-service', 'remove-service'],
	string: ['name'],
	alias: { q: 'quiet', n: 'name' },
	unknown: (option) => onUnknown(option)
};

const args = process.argv.slice(2);
const argv = parseArgs(args, opts);

if(argv['remove-service']) return service.remove();
else if(argv._.length !== 1) return showHelp();

const data = String(argv._[0]).split(':');
if(data.length > 2) return showHelp();

const server = {
	ip: data[0],
	port: (data[1] || 4000)
};

const link = `http://${server.ip}:${server.port}`;
const playerOpts = {
	media: `${link}/cast`,
	subtitles: `${link}/subs`,
	websocket: link,
	player: 'mpv',
	ipcPath: '/tmp/cast-socket'
};

var config = { ...playerOpts, ...argv };
config.name = (config.name) ? config.name : makeRandomName();

if(argv['create-service']) service.create(server, config);
else if(argv['remove-service']) service.remove();
else player.listen(config);

function onUnknown(option)
{
	if(option.includes('-'))
	{
		showHelp();
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

function showHelp()
{
	const pkg = require('./package.json');

	console.log([
		``,
		`Playercast ${pkg.version}, media receiver for GNOME Shell Extension Cast to TV`,
		``,
		`Usage: playercast <ip>[:port] [OPTIONS]`,
		``,
		`  ip   - address or hostname of device with Cast to TV extension`,
		`  port - listening port configured in extension (default: 4000)`,
		``,
		`OPTIONS:`,
		`  -q, --quiet          Do not print player status info except errors`,
		`  -n, --name           Name your receiver (default: "Playercast-XXXX")`,
		`  --disable-cec        Do not use HDMI CEC functionality`,
		`  --create-service     Creates systemd service with currently used options`,
		`  --remove-service     Removes playercast systemd service file`,
		``
	].join('\n'));
}
