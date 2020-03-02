const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const debug = require('debug')('playercast:server');
const { WSServer } = require('./websocket');
const player = require('./player');
const helper = require('./helper');
const keymap = require('./keymap');
const terminal = require('./terminal');
const noop = () => {};

module.exports =
{
	transmitter: function(opts, cb)
	{
		cb = cb || noop;

		var called = false;
		debug(`Creating file server on port ${opts.port}`);

		const callOnce = function(err)
		{
			debug(err || 'Server successfully created ');

			if(called) return;

			called = true;
			cb(err);
		}

		const app = express();
		app.use(bodyParser.json());

		const configServer = function()
		{
			app.get('/cast', (req, res) =>
				serveFile(helper.resolvePath(opts.filePath), req, res)
			);
			app.get('/subs', (req, res) =>
				serveFile(helper.resolvePath(opts.subsPath), req, res)
			);
			app.get('/cover', (req, res) =>
				/* Cover path found by helper is an absolute path */
				serveFile(opts.coverPath, req, res)
			);
			app.get('/*', (req, res) => res.sendStatus(404));
			app.post('/*', (req, res) => res.sendStatus(404));

			var server = app.listen(opts.port, callOnce);
			server.on('error', callOnce);

			var websocket = new WSServer(server);
			websocket.castData = opts;

			terminal.enableKeyInput(websocket);
		}

		if(opts.subsPath)
			return configServer();

		helper.findSubsOrCover(opts.filePath, (err, result) =>
		{
			if(err) return configServer();

			if(result.subsPath)
				opts.subsPath = result.subsPath;

			if(result.coverPath)
				opts.coverPath = result.coverPath;

			opts.mediaData = result;

			configServer();
		});
	},

	receiver: function(port, cb)
	{
		cb = cb || noop;

		var called = false;
		debug(`Creating API server on port ${port}`);

		const callOnce = function(err)
		{
			debug(err || 'Server successfully created');

			if(called) return;

			called = true;
			cb(err);
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
			terminal.writeError(err);
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
				/* Some players make requests for chunks over range */
				if(!err.name || err.name !== 'RangeNotSatisfiableError')
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
			break;
		case 'remote':
			if(!req.body || !req.body.action)
				return res.sendStatus(404);

			keymap.extRemote(req.body, player);
			break;
		default:
			return res.sendStatus(404);
	}

	res.sendStatus(200);
}
