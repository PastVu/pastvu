'use strict';

var net = require('net'),
	_ = require('lodash'),
	log4js = require('log4js'),
	logger = log4js.getLogger('app.js'),
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
			method.apply(null, msg.args);
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
						logger.info('Core client disconnected. Total clients: %d', clientSockets.length);
					};

				clientSockets.push(clientSocket);

				socket.on('error', function (err) {
					logger.warn('Core client connection error: ' + (err.code || err));
				});
				socket.on('close', function () {
					ondestroy();
				});
				socket.on('end', function () {
					logger.info('Core client connection end');
					ondestroy();
				});
				logger.info('Core client connected. Total clients: %d', clientSockets.length);
			});

		server.on('error', function (e) {
			if (e.code === 'EADDRINUSE') {
				logger.error('Address in use, retrying...');
				setTimeout(function () {
					server.close();
					server.listen.apply(server, args);
				}, 1000);
			} else {
				logger.error('Error occured: ', e);
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
		logger.error('Core: error parsing incoming message: ' + e + '. Message: ' + msg);
		return;
	}
	if (msg) {
		if (msg.descriptor) {
			var that = this;
			msg.cb = function () {
				var result = {
						descriptor: msg.descriptor
					},
					stringifyResultArgs = msg.stringifyResultArgs,
					args = _.toArray(arguments);

				//Если передано сколько аргументов надо передавать как строка, стрингуем их (не включая нулевой аргумент - err)
				if (typeof stringifyResultArgs === 'number') {
					while (stringifyResultArgs) {
						args[stringifyResultArgs] = JSON.stringify(args[stringifyResultArgs--]);
					}
				}

				result.args = args;
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