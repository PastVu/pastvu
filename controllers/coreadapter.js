'use strict';

var net = require('net'),
	photoController = require('./photo.js'),
	commentController = require('./comment.js'),
	core = {
		photo: photoController.core,
		comment: commentController.core
	},
	coreCaller = function (msg) {
		var cat = core[msg.category],
			method;

		if (cat !== undefined) {
			method = cat[msg.method];
		}

		if (method !== undefined) {
			if (msg.cb) {
				msg.args.push(msg.cb);
			}
			method.apply(msg.args);
		} else if (msg.cb) {
			msg.cb('Unsupported method [' + msg.category + ':' + msg.method + ']');
		}
	},

	Server = function () {
		var that = this;

		this.server = net.createServer(function (s) {
			clientSockets.push(new ClientSocket(that, s));
			console.log('Core client connected');
		});
		this.server.listen.apply(this.server, arguments);
	},

	clientSockets = [],
	ClientSocket = function (server, socket) {
		this.server = server;
		this.socket = socket;

		this.buffer = '';

		var that = this;

		socket.setEncoding('utf8');
		socket.setNoDelay(true);

		socket.on('data', function (data) {
			var messages = that._tokenizer(data),
				len = messages.length,
				i = 0;

			while (i < len) {
				that.handleMessage(messages[i++]);
			}
		});
	};

ClientSocket.prototype.handleMessage = function (msg) {
	try {
		msg = JSON.parse(msg);
	} catch (e) {
		console.error('Error parsing incoming message: ', e);
		return;
	}
	if (msg) {
		if (msg.descriptor) {
			var that = this;
			msg.cb = function (err, data) {
				var result = {
					descriptor: msg.descriptor,
					args: arguments
				};
				that.socket.write(JSON.stringify(result) + '\0');
			};
		}
		coreCaller(msg);
	}
};

ClientSocket.prototype._tokenizer = function (data) {
	this.buffer += data;

	var result = this.buffer.split('\0');
	if (result.length === 1) {
		return [];
	}

	this.buffer = result.pop();
	return result;
};


module.exports = Server;