const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const extract = require('ffmpeg-extract');
const debug = require('debug')('playercast:helper');

const SUBS_DIRS = ['Subs', 'Subtitles'];
const SUBS_FORMATS = ['srt', 'ass', 'vtt'];
const COVER_NAMES = ['cover', 'cover_01', 'cover 01', 'cover1'];
const COVER_FORMATS = ['jpg', 'png'];
const DEFAULT_COVER = path.join(__dirname, '../images/cover.png');

var possibleCovers;

module.exports =
{
	playlist: [],

	loadPlaylist: function(list)
	{
		list.forEach(item =>
		{
			if(!this.playlist.includes(item))
				this.playlist.push(item);
		});
	},

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
		if(data && typeof data === 'function')
			cb = data;

		const reqOpts = {
			host: opts.hostname || '127.0.0.1',
			port: opts.port || 9881,
			path: opts.path || '/api/connect',
			method: opts.method || 'POST',
			timeout: 3000,
			headers: {
				'Content-Type': 'application/json'
			}
		};

		var req = http.request(reqOpts, (res) =>
		{
			req.removeListener('error', cb);
			cb(null, res);
		});

		req.on('error', cb);

		if(reqOpts.method === 'POST')
			req.write(JSON.stringify(data));

		req.end();
	},

	httpRequestData: function(opts, cb)
	{
		this.httpRequest(opts, (err, res) =>
		{
			if(err) return cb(err);

			var resData = '';

			const addData = function(data)
			{
				resData += data;
			}

			res.on('data', addData);
			res.once('end', () =>
			{
				res.removeListener('data', addData);

				try { resData = JSON.parse(resData); }
				catch(err) { return cb(err); }

				cb(null, resData);
			});
		});
	},

	downloadFile: function(fileUrl, destPath, cb)
	{
		var opts = url.parse(fileUrl);
		opts.method = 'GET';

		this.httpRequest(opts, (err, res) =>
		{
			if(
				err
				|| (res.statusCode !== 200
				&& res.statusCode !== 206)
			)
				return cb(err || new Error('No subtitles available for download'));

			var stream = fs.createWriteStream(destPath);

			res.pipe(stream);

			const onFinish = function()
			{
				stream.removeListener('error', onError);
				stream.close(() => cb(null));
			}

			const onError = function(err)
			{
				stream.removeListener('finish', onFinish);
				removeFile(destPath, () => cb(err));
			}

			const removeFile = function(filePath, cb)
			{
				fs.access(filePath, fs.constants.F_OK, (err) =>
				{
					if(err) return cb(null);

					fs.unlink(filePath, cb);
				});
			}

			stream.once('finish', onFinish);
			stream.once('error', onError);
		});
	},

	downloadSubs: function(fileUrl, cb)
	{
		const destPath = path.join(os.tmpdir(), 'playercast-subs');

		debug(`Downloading subtitles from ${fileUrl} to: ${destPath}`);

		this.downloadFile(fileUrl, destPath, (err) =>
		{
			if(err)
			{
				debug(err);
				return cb(err);
			}

			debug('Subtitles download finished');
			cb(null, destPath);
		});
	},

	getIsUrl: function(filePath)
	{
		if(!filePath) return false;

		var parsed = url.parse(filePath);

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

	findSubsOrCover(filePath, cb)
	{
		debug('Analyzing file with ffprobe...');

		const finishAnalyze = function(err, data)
		{
			if(!err && debug.enabled)
				debug(`File analyze result: ${JSON.stringify(data)}`);

			cb(err, data);
		}

		this._analyzeFile(filePath, (err, result) =>
		{
			if(err || extract.video.getIsVideo(result.ffprobeData))
			{
				result.mediaData.streamType = 'VIDEO';
				return this._findSubs(result, finishAnalyze);
			}

			if(extract.music.getIsAudio(result.ffprobeData))
			{
				result.mediaData.streamType = 'MUSIC';
				return this._findCover(result, finishAnalyze);
			}

			debug('Not a video or music file');
			result.mediaData.streamType = 'PICTURE';

			cb(null, result.mediaData);
		});
	},

	_analyzeFile: function(filePath, cb)
	{
		extract.analyzeFile({ filePath: filePath }, (err, data) =>
		{
			if(err)
				debug('File cannot be analyzed');
			else
				debug('File successfully analyzed');

			var mediaData = {};
			var parsedFile = path.parse(path.resolve(filePath));

			if(!err)
			{
				var metadata = extract.music.getMetadata(data);

				if(metadata)
				{
					debug('Obtained file metadata');
					mediaData.title = metadata.title;
				}
				else
				{
					debug('No file metadata');
					mediaData.title = parsedFile.name;
				}
			}

			var result = {
				parsedFile: parsedFile,
				mediaData: mediaData,
				ffprobeData: data || null
			};

			cb(err, result);
		});
	},

	_findSubs: function(result, cb)
	{
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

		debug(`Checking for files: ${possibleSubs}`);
		extract.shared.findFileInDir(findOpts, (err, subsPath) =>
		{
			if(err)
			{
				debug('No subtitles found');
				return cb(null, result.mediaData);
			}

			debug(`Found subtitles: ${subsPath}`);
			result.mediaData.subsPath = subsPath;

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
			possibleCovers = extract.shared.getPossibleNames(COVER_NAMES, COVER_FORMATS);

		const fileDir = result.parsedFile.dir;

		var findOpts = {
			dirPath: fileDir,
			namesArr: possibleCovers,
			dirsArr: null,
			checkDirs: true
		};

		debug(`Checking for files: ${possibleCovers}`);
		extract.shared.findFileInDir(findOpts, (err, coverPath) =>
		{
			if(err)
			{
				debug('No cover found');
				result.mediaData.coverPath = DEFAULT_COVER;
				return cb(null, result.mediaData);
			}

			debug(`Found cover: ${coverPath}`);
			result.mediaData.coverPath = coverPath;

			return cb(null, result.mediaData);
		});
	},

	checkPlaylistItem: function(id, cb)
	{
		const item = this.playlist[id];

		if(!item) return cb(new Error('Playlist item does not exists'));

		const isUrl = this.getIsUrl(item);

		if(isUrl) return cb(null, true, item);

		const fullPath = path.resolve(item);

		fs.access(fullPath, fs.constants.F_OK, (err) =>
		{
			if(err) return this.checkPlaylistItem(id + 1, cb);

			cb(null, false, fullPath);
		});
	}
}
