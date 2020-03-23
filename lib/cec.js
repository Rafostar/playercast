const CecController = require('cec-controller');
var resolved = false;

module.exports = () =>
{
	return new Promise((resolve, reject) =>
	{
		const osdName = 'Playercast';
		var events = new CecController({ osdString: osdName });

		const onReady = (ctl) =>
		{
			if(resolved) return;

			resolved = true;

			if(!ctl.hasOwnProperty('dev0'))
				return resolve(null);

			var hdmi = null;

			for(var key in ctl)
			{
				if(typeof ctl[key] !== 'object')
					continue;

				if(ctl[key].osdString === osdName)
				{
					var port = ctl[key].address.split('.')[0];
					hdmi = (isNaN(port)) ? null : port;
					break;
				}
			}

			resolve({ events, ctl, hdmi });
		}

		const onError = (err) =>
		{
			if(resolved) return;

			resolved = true;
			resolve(null);
		}

		events.on('ready', onReady);
		events.on('error', onError);
	});
}
