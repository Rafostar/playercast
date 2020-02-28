const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const debug = require('debug')('playercast');
const { WSServer } = require('./websocket');
const player = require('./player');
const terminal = require('./terminal');
const noop = () => {};

var clients = [];
var filePath;

module.exports =
{
	transmitter: function(opts, cb)
	{
		cb = cb || noop;

		var called = false;

		const callOnce = function(data)
		{
			if(data) debug(data);

			if(called) return;

			called = true;
			cb(data);
		}

		const app = express();
		app.use(bodyParser.json());

		filePath = opts.filePath;

		app.get('/cast', (req, res) => serveFile(opts.filePath, req, res));
		app.get('/subs', (req, res) => serveFile(opts.subsPath, req, res));
		app.get('/*', (req, res) => res.sendStatus(404));
		app.post('/*', (req, res) => res.sendStatus(404));

		var server = app.listen(opts.port, callOnce);
		server.on('error', callOnce);

		var websocket = new WSServer(server);
		websocket.on('connection', handleMessages);

		terminal.enableKeyInput(websocket);
	},

	receiver: function(port, cb)
	{
		cb = cb || noop;

		var called = false;

		const callOnce = function(data)
		{
			if(data) debug(data);

			if(called) return;

			called = true;
			cb(data);
		}

		const app = express();
		app.use(bodyParser.json());

		app.post('/api/*', onPost);
		app.get('/*', (req, res) => res.sendStatus(404));
		app.post('/*', (req, res) => res.sendStatus(404));

		var server = app.listen(port, callOnce);
		server.on('error', callOnce);
	}
}

function serveFile(filePath, req, res)
{
	res.setHeader('Access-Control-Allow-Origin', '*');

	if(!filePath)
		return res.sendStatus(204);

	fs.access(filePath, fs.constants.F_OK, (err) =>
	{
		if(err)
		{
			debug(err);
			return res.sendStatus(404);
		}

		res.sendFile(filePath, (err, pipe) =>
		{
			if(!err) return;

			if(err.code === 'EISDIR')
				return req.next();

			if(
				err.code !== 'ECONNABORTED'
				&& err.syscall !== 'write'
			) {
				debug(err);
				req.next();
			}
		});
	});
}

function onPost(req, res)
{
	switch(req.params[0])
	{
		case 'connect':
			player._changeHost(req.body);
			res.sendStatus(200);
			break;
		default:
			res.sendStatus(404);
			break;
	}
}

function handleMessages(socket)
{
	socket.on('playercast-connect', (msg) =>
	{
		socket.playercastName = msg;

		if(clients.includes(socket.playercastName))
		{
			socket.playercastInvalid = true;
			return socket.emit('invalid', 'name');
		}

		clients.push(socket.playercastName);
		socket.emit('invalid', false);

		socket.emit('playercast', {
			name: socket.playercastName,
			streamType: 'VIDEO',
			filePath: filePath
		});
	});

	socket.on('playercast-ctl', (msg) =>
	{
		switch(msg)
		{
			case 'track-ended':
				//socket.closePlayercast();
				break;
			case 'previous-track':
			case 'next-track':
				break;
			default:
				break;
		}
	});

	socket.on('status-update', (msg) =>
	{
		terminal.writePlayerStatus(msg);
	});

	socket.on('show-remote', (msg) =>
	{
		if(msg) return;

		terminal.writeLine('Cast finished');

		process.stdout.write('\n');
		process.exit(0);
	});

	socket.on('disconnect', () =>
	{
		if(!socket.playercastName) return;

		if(
			socket.playercastInvalid
			|| !clients.includes(socket.playercastName)
		)
			return;

		var index = clients.indexOf(socket.playercastName);
		clients.splice(index, 1);
	});
}
