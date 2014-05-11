'use strict';

var net = require('net'),
	_ = require('lodash'),
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
		var args = _.toArray(arguments),
			server = net.createServer(function (socket) {
				var clientSocket = new ClientSocket(server, socket),
					ondestroy = function () {
						socket.destroy();
						_.remove(clientSockets, clientSocket);
						console.log(clientSockets.length + ' core clients left');
					};

				clientSockets.push(clientSocket);

				socket.on('error', function (err) {
					console.log('Core client connection error: ' + (err.code || err));
				});
				socket.on('close', function (withError) {
					console.log('Core client disconnected' + (withError ? ' due to error' : ''));
					ondestroy();
				});
				socket.on('end', function () {
					console.log('Core client connection end');
					ondestroy();
				});
				console.log('Core client connected. Total clients: %d', clientSockets.length);
			});

		server.on('error', function (e) {
			if (e.code === 'EADDRINUSE') {
				console.log('Address in use, retrying...');
				setTimeout(function () {
					server.close();
					server.listen.apply(server, args);
				}, 1000);
			} else {
				console.log('Error occured: ', e);
			}
		});

		server.listen.apply(server, args);
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