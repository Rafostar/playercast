#!/usr/bin/env node

const parseArgs = require('minimist');
const player = require('./player');
const service = require('./service');

const opts = {
	boolean: ['create-service', 'remove-service'],
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
	websocket: link,
	player: 'mpv',
	ipcPath: '/tmp/cast-socket'
};

const config = { ...playerOpts, ...argv };

if(argv['create-service']) service.create(server);
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
		`  --create-service      Creates systemd service file with currently used params`,
		`  --remove-service      Removes playercast systemd service file`,
		``
	].join('\n'));
}
