const debug = require('debug')('playercast:terminal');
var statusText;

module.exports =
{
	quiet: false,
	mode: 'Receiver',
	device: 'Unknown',
	controlEnabled: false,
	textPrevLength: 0,

	disableWriting: function()
	{
		if(!process.stdin.isTTY) return;

		process.stdin.setRawMode(true);
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', this._handleQuitKey);

		debug('Writing in terminal is now disabled');
	},

	enableKeyInput: function(player)
	{
		if(!process.stdin.isTTY) return;

		this.controlEnabled = true;
		process.stdin.removeListener('data', this._handleQuitKey);
		process.stdin.on('data', (key) => this._handleAllKeys(key, player));

		debug('Playback control is now enabled');
	},

	_handleQuitKey: function(key)
	{
		if(!process.stdin.isTTY) return;

		debug(`Key press on handle quit: ${key}`);

		switch(key)
		{
			case 'd':
			case 'D':
			case 'q':
			case 'Q':
			case '\u0003': // ctrl-c
			case '\u001B': // Esc
				console.clear();
				process.exit(0);
				break;
			default:
				break;
		}
	},

	_handleAllKeys: function(key, player)
	{
		/* Read arrow keys */
		if(key.charCodeAt(0) === 27 && key.charCodeAt(1) === 91)
		{
			switch(key.charCodeAt(2))
			{
				case 65: // Up
					player.increaseVolume(0.05);
					break;
				case 66: // Down
					player.decreaseVolume(0.05);
					break;
				case 67: // Right
					player.seekForward(10);
					break;
				case 68: // Left
					player.seekBackward(10);
					break;
				default:
					break;
			}
		}
		else if(key.charCodeAt(0) === 127) // Backspace
		{
			player.setSpeed(1.00);
		}
		else
		{
			switch(key)
			{
				case '\u0020': // Space
					player.action('cyclePause');
					break;
				case 'v':
				case 'V':
				case '\u005F': // Underscore
					player.action('cycleVideo');
					break;
				case 'a':
				case 'A':
					player.action('cycleAudio');
					break;
				case 's':
				case 'S':
					player.action('cycleSubs');
					break;
				case 'f':
				case 'F':
					player.action('cycleFullscreen');
					break;
				case 'd':
				case 'D':
					if(player.detachPlayercast)
						player.detachPlayercast();
					break;
				case 'q':
				case 'Q':
				case '\u0003': // ctrl-c
				case '\u001B': // Esc
					player.closePlayercast();
					break;
				case '>':
				case '.':
					player.nextTrack();
					break;
				case '<':
				case ',':
					player.previousTrack();
					break;
				case ']':
					player.increaseSpeed(0.25);
					break;
				case '[':
					player.decreaseSpeed(0.25);
					break;
				case '0':
					player.seekPercent(0.0);
					break;
				case '1':
					player.seekPercent(0.1);
					break;
				case '2':
					player.seekPercent(0.2);
					break;
				case '3':
					player.seekPercent(0.3);
					break;
				case '4':
					player.seekPercent(0.4);
					break;
				case '5':
					player.seekPercent(0.5);
					break;
				case '6':
					player.seekPercent(0.6);
					break;
				case '7':
					player.seekPercent(0.7);
					break;
				case '8':
					player.seekPercent(0.8);
					break;
				case '9':
					player.seekPercent(0.9);
					break;
				default:
					debug(`Unassigned key: ${key}`);
					break;
			}
		}
	},

	clear: function()
	{
		if(this.quiet || debug.enabled) return;

		console.clear();
	},

	writeLine: function(text)
	{
		if(this.quiet)
			return (debug.enabled) ? debug(text) : null;

		if(!process.stdout.cursorTo) return;

		process.stdout.cursorTo(0, 0);
		console.clear();
		process.stdout.write(text);
	},

	writeError: function(text, sameLine)
	{
		if(this.quiet)
			return (debug.enabled) ? debug(text) : console.error(text);

		if(!sameLine)
			return console.error('\n' + text);

		if(process.stdout.cursorTo)
		{
			process.stdout.cursorTo(0);
			process.stdout.clearLine(0);
		}

		if(text && text.message)
		{
			text = (text.message.startsWith('Error:')) ?
				text.message : `Error: ${text.message}`;
		}

		console.error(text);
	},

	writePlayerStatus: function(status, isLive)
	{
		if(
			!status
			|| !process.stdout.cursorTo
			|| this.quiet
			|| debug.enabled
		)
			return;

		var text = '';

		if(!status.streamType || status.streamType !== 'PICTURE')
		{
			text += status.playerState;

			while(text.length < 8)
				text += ' ';

			const current = convertTime(status.currentTime);
			const total = (!isLive && status.media.duration > 0) ?
				convertTime(status.media.duration) : null;

			var volume = Math.round(status.volume * 100) + '%';
			volume = `VOLUME: ${volume}`;

			var speed = '';

			if(status.speed != 1.00)
			{
				speed = Math.round(status.speed * 100) + '%';
				speed = `SPEED: ${speed}`;
			}

			if(total)
				text += `${current}/${total} ${volume}`;
			else
				text += `${current} ${volume}`;

			if(speed)
				text += ` ${speed}`;

			const textCurrLength = text.length;

			while(text.length < this.textPrevLength)
				text += ' ';

			this.textPrevLength = textCurrLength;
		}

		const playerInfo = (this.mode === 'Receiver') ?
			`NAME: ${this.device}` : `RECEIVER: ${this.device}`;
		const titleLine = `TITLE: ${status.title}`;
		const quitLine = (this.mode === 'Attach') ?
			'  D: detach             Q: quit' : '  Q: quit';
		const itemLine = (status.playlist && status.playlist.length) ?
			`\nITEM: ${status.playlist.index}/${status.playlist.length}` : '';

		process.stdout.cursorTo(0, 0);

		statusText = [
			`MODE: ${this.mode}`,
			playerInfo,
			``,
			`CONTROLS:`,
			`  Left/Right: seek      Up/Down: volume`,
			`  Space: cycle pause    </>: change item`,
			`  V: cycle video        A: cycle audio`,
			`  S: cycle subtitles    F: fullscreen`,
			`  [/]: change speed     Backspace: reset speed`,
			quitLine,
			itemLine,
			titleLine,
			text
		].join('\n');

		process.stdout.write(statusText);
	},

	restoreText: function()
	{
		if(
			!statusText
			|| !process.stdout.cursorTo
			|| this.quiet
			|| debug.enabled
		)
			return;

		console.clear();
		process.stdout.write(statusText);
	},

	showHelp: function()
	{
		const pkg = require('../package.json');
		const defPlayer = (process.platform === 'win32') ? 'vlc' : 'mpv';

		console.log([
			``,
			`Playercast ${pkg.version}, ${pkg.description}`,
			``,
			`RECEIVER: playercast [ip:port] [OPTIONS]`,
			``,
			`  ip   - connect to specified sender device instead of running MDNS`,
			`  port - media server listening port (default: 4000)`,
			``,
			`  OPTIONS:`,
			`    -q, --quiet                Do not print player status info except errors`,
			`    -n, --name                 Name your receiver (default: "Playercast-XXXX")`,
			`    -p, --player               Media player app to use (default: ${defPlayer})`,
			`    --cwd <path>               Set current working dir for player spawn`,
			`    --port <number>            Port for running web API (default: 9881)`,
			``,
			`    --cec-end-hdmi <number>    Switch TV to specified HDMI port after playback`,
			`    --cec-force-switch         Force change of HDMI input on player start`,
			`    --cec-alt-remote           Use alternative TV remote key mappings`,
			`    --disable-cec              Do not use HDMI-CEC functionality`,
			``,
			`    --create-service           Creates systemd service with used options`,
			`    --remove-service           Removes playercast systemd service file`,
			``,
			``,
			`SENDER/ATTACH: playercast [<media>, [media], ...] [OPTIONS]`,
			``,
			`  OPTIONS:`,
			`    -q, --quiet                Do not print player status info except errors`,
			`    -a, --attach               Attach to the currently playing sender`,
			`    -n, --name                 Name of receiver to connect to (default: auto)`,
			`    -s, --subs <file>          Cast with external subtitles file (default: auto)`,
			`    --port <number>            Port for running media server (default: 9880)`,
			`    --disable-scan             Wait for receiver instead of running MDNS scan`,
			``
		].join('\n'));
	}
}

function convertTime(time)
{
	var hours = ('0' + Math.floor(time / 3600)).slice(-2);
	time -= hours * 3600;
	var minutes = ('0' + Math.floor(time / 60)).slice(-2);
	time -= minutes * 60;
	var seconds = ('0' + Math.floor(time)).slice(-2);

	return `${hours}:${minutes}:${seconds}`;
}
