const multicastdns = require('multicast-dns');
const scanner = require('multicast-scanner');
const ip = require('internal-ip').v4;

module.exports =
{
	client: null,
	name: null,
	localName: null,

	listen: function(name)
	{
		this.name = name;
		this.localName = this._getLocalName(name);
		this.client = multicastdns();
		this.client.on('query', this._onQuery.bind(this));
	},

	find: function(name, cb)
	{
		var localName = this._getLocalName(name);

		var opts = {
			name: localName,
			friendly_name: name,
			service_name: '_playercast._tcp.local',
			service_type: 'PTR'
		};

		scanner(opts, cb);
	},

	_getLocalName: function(name)
	{
		if(!name || typeof name !== 'string')
			return null;

		return (name.split(' ').join('') + '.local').toLowerCase();
	},

	_onQuery: function(query)
	{
		if(!query.questions.length) return;

		var question = query.questions[0];

		if(
			!question
			|| !question.name
			|| question.name !== '_playercast._tcp.local'
		)
			return;

		ip().then(address =>
		{
			if(!address) return;

			this.client.respond({
				answers: [{
					name: '_playercast._tcp.local',
					type: 'PTR',
					ttl: 120,
					flush: false,
					data: this.localName
				}],
				additionals: [{
					name: this.localName,
					type: 'A',
					ttl: 120,
					flush: true,
					data: address
				}, {
					name: this.localName,
					type: 'TXT',
					ttl: 255,
					flush: true,
					data: [
						'md=Playercast',
						'fn=' + this.name
					]
				}]
			});
		});
	}
}
