const path = require('path');
const http = require('http');
const url = require('url');

module.exports =
{
	convToUrl: function(opts)
	{
		if(
			!opts
			|| !opts.hostname
			|| !opts.port
			|| isNaN(opts.port)
		)
			return null;

		return `http://${opts.hostname}:${opts.port}`;
	},

	httpRequest: function(opts, data, cb)
	{
		const reqOpts = {
			host: opts.hostname || '127.0.0.1',
			port: opts.port || 9881,
			path: '/api/connect',
			method: 'POST',
			timeout: 3000,
			headers: {
				'Content-Type': 'application/json'
			}
		};

		var req = http.request(reqOpts, () =>
		{
			req.removeListener('error', cb);
			cb(null);
		});

		req.on('error', cb);
		req.write(JSON.stringify(data));
		req.end();
	},

	getIsUrl: function(path)
	{
		if(!path) return false;

		var parsed = url.parse(path);

		return (parsed && parsed.hostname);
	},

	makeRandomString: function(length, useCapital)
	{
		var text = '';
		var possible = 'abcdefghijklmnopqrstuvwxyz0123456789';

		if(useCapital)
			possible += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

		for(var i = 0; i < length; i++)
		{
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	},

	resolvePath: function(filePath)
	{
		return (filePath) ? path.resolve(filePath) : null;
	}
}
