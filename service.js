const fs = require('fs');
const systemdPath = `${process.env.HOME}/.config/systemd/user`;
const servicePath = `${systemdPath}/playercast.service`;

module.exports =
{
	create: (server) =>
	{
		if(!fs.existsSync(systemdPath))
		{
			fs.mkdirSync(systemdPath.substring(0, systemdPath.lastIndexOf('/')));
			fs.mkdirSync(systemdPath);
		}

		const contents = [
			`[Unit]`,
			`Description=Playercast Service`,
			`After=network-online.target`,
			`Wants=network-online.target`,
			``,
			`[Service]`,
			`Type=simple`,
			`Environment=DISPLAY=:0`,
			`ExecStart=${process.argv[1]} -q ${server.ip}:${server.port}`,
			`Restart=always`,
			``,
			`[Install]`,
			`WantedBy=default.target`
		].join('\n');

		fs.writeFileSync(servicePath, contents);
		console.log('Created systemd service file');
		console.log([
			'Enable and start service with commands:',
			'  systemctl --user enable playercast',
			'  systemctl --user start playercast'].join('\n'));
	},

	remove: () =>
	{
		if(fs.existsSync(servicePath))
		{
			fs.unlinkSync(servicePath);
			return console.log('Removed systemd service file');
		}

		console.error('Service file not installed!');
	}
}
