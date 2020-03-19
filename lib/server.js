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

		this.ws = null;

		var called = false;
		debug(`Creating file server on port ${opts.port}`);

		const callOnce = function(err)
		{
			if(called) return;

			called = true;
			if(!err) debug('Server successfully created ');

			cb(err);
		}

		const app = express();
		app.use(bodyParser.json());

		const configServer = () =>
		{
			app.get('/cast', (req, res) => this._serveFile('fullPath', req, res));
			app.get('/subs', (req, res) => this._serveFile('subsPath', req, res));
			app.get('/cover', (req, res) => this._serveFile('coverPath', req, res));
			app.get('/*', (req, res) => res.sendStatus(404));
			app.post('/*', (req, res) => res.sendStatus(404));

			var server = app.listen(opts.port, callOnce);
			server.on('error', callOnce);

			this.ws = new WSServer(server);
			this.ws.castData = opts;

			if(debug.enabled)
				debug(`Assigned cast data: ${JSON.stringify(this.ws.castData)}`);

			terminal.enableKeyInput(this.ws);
		}

		if(opts.isUrl || opts.subsPath)
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

	_serveFile: function(pathType, req, res)
	{
		const filePath = this.ws.castData[pathType];

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
	},

	receiver: function(port, cb)
	{
		cb = cb || noop;

		var called = false;
		debug(`Creating API server on port ${port}`);

		const callOnce = function(err)
		{
			if(called) return;

			called = true;
			if(!err) debug('Server successfully created');

			cb(err);
		}

		const app = express();
		app.use(bodyParser.json());

		app.get('/api/*', onGet);
		app.post('/api/*', onPost);
		app.get('/*', (req, res) => res.sendStatus(404));
		app.post('/*', (req, res) => res.sendStatus(404));

		var server = app.listen(port, callOnce);
		server.on('error', callOnce);
	}
}

function onGet(req, res)
{
	switch(req.params[0])
	{
		case 'attach':
			return res.send({ host: player.getServerAddress() });
			break;
		default:
			break;
	}

	res.sendStatus(404);
}

function onPost(req, res)
{
	switch(req.params[0])
	{
		case 'connect':
			player.changeHost(req.body);
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
