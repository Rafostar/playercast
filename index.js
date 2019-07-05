#!/usr/bin/env node

const player = require('./player');
const args = process.argv.slice(2);

if(args.length !== 1) return showHelp();

var data = args[0].split(':');
if(data.length > 2) return showHelp();

const server = {
	ip: data[0],
	port: (data[1] || 4000)
};

const link = `http://${server.ip}:${server.port}`;
var opts = {
	media: `${link}/cast`,
	websocket: link,
	player: 'mpv',
	ipcPath: '/tmp/cast-socket'
};

player.init(opts);

function showHelp()
{
	const pkg = require('./package.json');

	console.log([
		``,
		`Playercast ${pkg.version}, media receiver for GNOME Shell Extension Cast to TV`,
		``,
		`Usage: playercast <ip>[:port]`,
		``,
		`  ip   - address of device with Cast to TV extension`,
		`  port - listening port configured in extension (default: 4000)`,
		``
	].join('\n'));
}
