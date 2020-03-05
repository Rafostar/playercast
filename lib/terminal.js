const debug = require('debug')('playercast:terminal');
var statusText;

module.exports =
{
	quiet: false,
	mode: 'Receiver',

	disableWriting: function()
	{
		if(!process.stdin.isTTY) return;

		process.stdin.setRawMode(true);
		process.stdin.setEncoding('utf8');
	},

	enableKeyInput: function(player)
	{
		if(!process.stdin.isTTY) return;

		process.stdin.on('data', (key) =>
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
			else
			{
				switch(key)
				{
					case '\u0020': // Space
						player.action('cyclePause');
						break;
					case '\u005F': // Underscore
						player.action('cycleVideo');
						break;
					case 'q':
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
					default:
						debug(`Unassigned key: ${key}`);
						break;
				}
			}
		});
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
			text = `Error: ${text.message}`;

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

		var text = status.playerState;
		while(text.length < 8) text += ' ';

		const current = convertTime(status.currentTime);
		const total = (!isLive && status.media.duration > 0) ?
			convertTime(status.media.duration) : null;

		var volume = Math.round(status.volume * 100) + '%';

		while(volume.length < 4) volume += ' ';

		if(total)
			text += `${current}/${total} VOLUME: ${volume}`;
		else
		{
			text += `${current} VOLUME: ${volume}`;
			outChars = 29;
		}

		const playerInfo = (this.mode === 'Receiver') ?
			`NAME: ${this.device}` : `RECEIVER: ${this.device}`;
		const titleLine = `TITLE: ${status.title}`;

		process.stdout.cursorTo(0, 0);

		statusText = [
			`MODE: ${this.mode}`,
			`${playerInfo}`,
			``,
			`CONTROLS:`,
			`  Left/Right: seek     Up/Down: volume`,
			`  Space: cycle pause   </>: change track`,
			`  Q: quit`,
			``,
			`${titleLine}`,
			`${text}`
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
			`RECEIVER: playercast --listen [ip:port] [OPTIONS]`,
			``,
			`  ip   - connect to specified sender device instead of running MDNS`,
			`  port - media server listening port (default: 4000)`,
			``,
			`  OPTIONS:`,
			`    -q, --quiet                Do not print player status info except errors`,
			`    -n, --name                 Name your receiver (default: "Playercast-XXXX")`,
			`    -p, --player               Media player app to use (default: ${defPlayer})`,
			`    --port <number>            Port for running web API (default: 9881)`,
			``,
			`    --cec-end-hdmi <number>    Switch TV to specified HDMI port after playback`,
			`    --cec-force-switch         Force change of HDMI input on player start`,
			`    --cec-alt-remote           Use alternative TV remote key mappings`,
			`    --disable-cec              Do not use HDMI CEC functionality`,
			``,
			`    --create-service           Creates systemd service with used options`,
			`    --remove-service           Removes playercast systemd service file`,
			``,
			``,
			`SENDER: playercast [<media>, [media], ...] [OPTIONS]`,
			``,
			`  OPTIONS:`,
			`    -q, --quiet                Do not print player status info except errors`,
			`    -n, --name                 Name of receiver to connect to (default: auto)`,
			`    -s, --subs <file>          Cast with external subtitles file (default: auto)`,
			`    --port <number>            Port for running media server (default: 9880)`,
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
