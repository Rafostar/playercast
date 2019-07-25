const CecController = require('cec-controller');
var resolved = false;

module.exports = () =>
{
	return new Promise((resolve, reject) =>
	{
		var events = new CecController({ osdString: 'Playercast' });

		var onReady = (ctl) =>
		{
			if(!resolved)
			{
				resolved = true;

				if(ctl.hasOwnProperty('dev0'))
					resolve({ events, ctl });
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
