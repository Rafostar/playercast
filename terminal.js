module.exports =
{
	enableKeyInput: (player) =>
	{
		if(!process.stdin.isTTY) return;

		process.stdin.setRawMode(true);
		process.stdin.setEncoding('utf8');

		process.stdin.on('data', (key) =>
		{
			switch(key)
			{
				case '\u0003': // ctrl-c
				case '\u0071': // q
				case '\u001B': // Esc
					player.close();
					break;
				case '\u0020': // Space
					player.action('cyclePause');
					break;
				default:
					break;
			}
		});
	},

	writeLine: (text) =>
	{
		process.stdout.cursorTo(0);
		process.stdout.clearLine(0);
		process.stdout.write(text);
	},

	writeError: (text, isQuiet) =>
	{
		if(isQuiet) console.error(text);
		else console.error('\n' + text);
	},

	writePlayerStatus: (status, isLive) =>
	{
		if(!(status.currentTime >= 0.01)) return;

		var text = status.playerState;
		while(text.length < 8) text += ' ';

		var current = convertTime(status.currentTime);
		var total = (isLive === false && status.media.duration > 0) ?
			convertTime(status.media.duration) : null;

		var volume = Math.floor(status.volume * 100);

		var outChars = 36;

		if(total) text += `${current}/${total} VOLUME:${volume}`;
		else
		{
			text += `${current} VOLUME:${volume}`;
			outChars = 27;
		}

		while(text.length < outChars) text += ' ';

		process.stdout.cursorTo(0);
		process.stdout.write(text);
	},

	showHelp: () =>
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
			`  -q, --quiet                Do not print player status info except errors`,
			`  -n, --name                 Name your receiver (default: "Playercast-XXXX")`,
			`  --cec-end-hdmi <number>    Switch TV to specified HDMI port after playback`,
			`  --cec-alt-remote           Use alternative TV remote key mappings`,
			`  --disable-cec              Do not use HDMI CEC functionality`,
			`  --create-service           Creates systemd service with used options`,
			`  --remove-service           Removes playercast systemd service file`,
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
