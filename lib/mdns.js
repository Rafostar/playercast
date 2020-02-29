const multicastdns = require('multicast-dns');
const scanner = require('multicast-scanner');
const ip = require('internal-ip').v4;

const SERVICE_NAME = '_playercast._tcp.local';

module.exports =
{
	client: null,
	friendlyName: null,
	localName: null,
	fullName: null,
	port: null,

	listen: function(name, port)
	{
		this.friendlyName = name;
		this.localName = this._getLocalName(name);
		this.fullName = this._getLocalName(name, true);
		this.port = port || 9881;
		this.client = multicastdns();
		this.client.on('query', this._onQuery.bind(this));
	},

	find: function(name, cb)
	{
		var opts = {
			name: this._getLocalName(name),
			friendly_name: name,
			service_name: SERVICE_NAME,
			service_type: 'PTR'
		};

		scanner(opts, cb);
	},

	_getLocalName: function(name, isFull)
	{
		if(!name || typeof name !== 'string')
			return null;

		name = (name.split(' ').join('') + '.').toLowerCase();

		return (isFull) ? name + SERVICE_NAME : name + 'local';
	},

	_onQuery: function(query)
	{
		if(!query.questions.length) return;

		var question = query.questions[0];

		if(
			!question
			|| !question.name
			|| question.name !== SERVICE_NAME
		)
			return;

		ip().then(address =>
		{
			if(!address) return;

			this.client.respond({
				answers: [{
					name: SERVICE_NAME,
					type: 'PTR',
					ttl: 120,
					flush: false,
					data: this.fullName
				}],
				additionals: [{
					name: this.localName,
					type: 'A',
					ttl: 120,
					flush: true,
					data: address
				}, {
					name: this.fullName,
					type: 'TXT',
					ttl: 255,
					flush: true,
					data: [
						'md=Playercast',
						'fn=' + this.friendlyName
					]
				}, {
					name: this.fullName,
					type: 'SRV',
					ttl: 120,
					flush: true,
					data: {
						port: this.port,
						weigth: 0,
						priority: 0,
						target: this.localName
					}
				}]
			});
		});
	}
}
