const path = require('path');
const http = require('http');
const url = require('url');
const extract = require('ffmpeg-extract');
const debug = require('debug')('playercast:helper');

const SUBS_DIRS = ['Subs', 'Subtitles'];
const SUBS_FORMATS = ['srt', 'ass', 'vtt'];
const COVER_NAMES = ['cover', 'cover_01', 'cover 01', 'cover1'];
const COVER_FORMATS = ['jpg', 'png'];

var possibleCovers;

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
	},

	findSubsOrCover(filePath, cb)
	{
		debug('Analyzing file with ffprobe...');
		this._analyzeFile((err, result) =>
		{
			if(err) return cb(err);

			debug('File successfully analyzed');

			if(extract.video.getIsVideo(result.ffprobeData))
				return this._findSubs(result, cb);

			if(extract.music.getIsAudio(result.ffprobeData))
				return this._findCover(result, cb);

			debug('Not a video or a music file');
			cb(null, result.mediaData);
		});
	},

	_analyzeFile: function(filePath, cb)
	{
		extract.analyzeFile({ filePath: filePath }, (err, data) =>
		{
			if(err) return cb(err);

			var mediaData = {};
			var parsedFile = path.parse(filePath);
			var metadata = extract.music.getMetadata(data);

			if(metadata)
			{
				debug('Obtained music metadata');
				mediaData.title = metadata.title;
			}
			else
			{
				debug('No music metadata');
				mediaData.title = parsedFile.name;
			}

			var result = {
				parsedFile: parsedFile,
				mediaData: mediaData,
				ffprobeData: data
			};

			return cb(null, result);
		});
	},

	_findSubs: function(result, cb)
	{
		debug('Checking if subtitles are merged...');
		result.mediaData.isSubsMerged = extract.video.getIsSubsMerged(result.ffprobeData);
		debug(`Subtitles merged: ${mediaData.isSubsMerged}`);

		if(result.mediaData.isSubsMerged)
			return cb(null, result.mediaData);

		debug('Searching for external subtitles...');
		const fileDir = result.parsedFile.dir;
		const fileName = result.parsedFile.name;
		const possibleSubs = extract.shared.getPossibleNames([fileName], SUBS_FORMATS);

		var findOpts = {
			dirPath: fileDir,
			namesArr: possibleSubs,
			dirsArr: SUBS_DIRS,
			checkDirs: true
		};

		extract.shared.findFileInDir(findOpts, (err, foundPath) =>
		{
			if(err) return cb(null, result.mediaData);

			result.mediaData.subsPath = foundPath;
			cb(null, result.mediaData);
		});
	},

	_findCover: function(result, cb)
	{
		debug('Checking if cover is merged...');
		if(extract.music.getIsCoverMerged(result.ffprobeData))
		{
			debug('Found cover merged in file');
			return cb(null, result.mediaData);
		}

		debug('Cover not merged in file');

		if(!possibleCovers)
		{
			possibleCovers = extract.shared.getPossibleNames(COVER_NAMES, COVER_FORMATS);
			debug(`Supported cover names: ${possibleCovers}`);
		}

		const fileDir = result.parsedFile.dir;
		extract.shared.findFileInDir(fileDir, possibleCovers, (err, coverPath) =>
		{
			if(err)
			{
				debug('No cover found');
				return cb(null, result.mediaData);
			}

			debug(`Found cover: ${coverPath}`);
			result.mediaData.coverPath = coverPath;

			return cb(null);
		});
	}
}
