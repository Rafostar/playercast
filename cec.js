const CecController = require('cec-controller');
var resolved = false;

module.exports = () =>
{
	return new Promise((resolve, reject) =>
	{
		const osdName = 'Playercast';
		var events = new CecController({ osdString: osdName });

		var onReady = (ctl) =>
		{
			if(!resolved)
			{
				resolved = true;

				if(ctl.hasOwnProperty('dev0'))
				{
					var hdmi = null;

					for(var key in ctl)
					{
						if(typeof ctl[key] !== 'object') continue;
						else if(ctl[key].osdString === osdName)
						{
							var port = ctl[key].address.split('.')[0];
							hdmi = (isNaN(port)) ? null : port;
							break;
						}
					}

					resolve({ events, ctl, hdmi });
				}
				else
					resolve(null);
			}
		}

		var onError = (err) =>
		{
			if(!resolved)
			{
				resolved = true;
				resolve(null);
			}
		}

		events.on('ready', onReady);
		events.on('error', onError);
	});
}
