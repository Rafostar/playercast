var CecController = require('cec-controller');

module.exports = () =>
{
	var cec = new CecController();

	var myCec = {};
	var keys = Object.keys(cec);

	if(keys.length === 0)
		return null;

	for(var key of keys)
	{
		var currObj = cec[key];

		if(typeof currObj !== 'object')
			continue;

		if(currObj.hasOwnProperty('name') && currObj.name === 'TV')
		{
			myCec.tv = {};

			Object.keys(currObj).forEach(key =>
			{
				if(typeof currObj[key] === 'function')
					myCec.tv[key] = currObj[key].bind(this);
			});

			break;
		}
	}

	if(!myCec.hasOwnProperty('tv'))
		return null;

	keys.forEach(key =>
	{
		if(typeof cec[key] === 'function')
			myCec[key] = cec[key].bind(this);
	});

	return myCec;
}
