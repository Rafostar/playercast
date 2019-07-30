const fs = require('fs');
const systemdPath = `${process.env.HOME}/.config/systemd/user`;
const servicePath = `${systemdPath}/playercast.service`;

module.exports =
{
	create: (server, argv) =>
	{
		if(!fs.existsSync(systemdPath))
		{
			fs.mkdirSync(systemdPath.substring(0, systemdPath.lastIndexOf('/')));
			fs.mkdirSync(systemdPath);
		}

		var execString = `${process.argv[1]} ${server.ip}:${server.port} -q -n '${argv.name}'`;

		const argvFilter = (option) =>
		{
			if(	option !== '_'
				&& option !== 'quiet'
				&& option !== 'name'
				&& option !== 'create-service'
				&& option !== 'remove-service'
				&& option.length > 1 // Do not process aliases
			) {
				return option;
			}
		}

		const options = Object.keys(argv).filter(argvFilter);
		options.forEach(option =>
		{
			if(argv[option] === true)
				execString += ` --${option}`;
			else if(argv[option] !== false)
				if(isNaN(argv[option])) execString += ` --${option} '${argv[option]}'`;
				else execString += ` --${option} ${argv[option]}`;
		});

		const contents = [
			`[Unit]`,
			`Description=Playercast Service`,
			`After=network-online.target`,
			`Wants=network-online.target`,
			``,
			`[Service]`,
			`Type=simple`,
			`Environment=DISPLAY=:0`,
			`ExecStart=${execString}`,
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
