'use strict';

var net = require('net'),
	util = require('util'),
	events = require('events'),
	_ = require('lodash');

var Client = module.exports = function (logger) {
	this.logger = logger || console;
	this.socketClosed = true;
};
util.inherits(Client, events.EventEmitter);

Client.prototype.connect = function () {
	var that = this;

	this.reset();
	this.connectargs = this.connectargs || _.toArray(arguments);

	this.socket = new net.Socket();
	this.socket.setEncoding('utf8');
	this.socket.setNoDelay(true);

	this.socket
		.on('data', function (data) {
			var messages = that._tokenizer(data),
				len = messages.length,
				i = 0;

			while (i < len) {
				that.handleMessage(messages[i++]);
			}
		})
		.on('connect', function () {
			that.logger.info('Connected to core at :%s', that.connectargs[0]);
			that.socketClosed = false;
			that.emit('connect');
		})
		.on('error', function (e) {
			if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') {
				that.logger.warn('Can\'t connect to Core. Retrying...');
				setTimeout(function () {
					that.connect();
				}, 1000);
			} else {
				that.logger.error('Core connnection error: ', e);
				that.emit('error', e);
			}
		})
		.on('close', function () {
			that.socketClosed = true;
			that.emit('close');
		});

	this.socket.connect.apply(this.socket, this.connectargs);
};
Client.prototype.request = function (category, method, args, cb, stringifyResultArgs) {
	if (this.socketClosed) {
		if (cb) {
			cb(99);
		}
		return false;
	}
	var msg = {
			category: category,
			method: method,
			args: args,
			stringifyResultArgs: stringifyResultArgs
		},
		cbDescriptor;

	if (cb) {
		cbDescriptor = this.cbDescriptorNext++;
		msg.descriptor = cbDescriptor;
		this.cbDescriptors[cbDescriptor] = cb;
	}

	this.socket.write(JSON.stringify(msg) + '\0');
	return true;
};
Client.prototype.close = function () {
	this.socket.end();
};

Client.prototype.handleMessage = function (msg) {
	var descriptor,
		cb;

	try {
		console.time('parse');
		msg = JSON.parse(msg);
		console.timeEnd('parse');
	} catch (e) {
		this.emit('parseError', e);
		return;
	}

	descriptor = msg.descriptor;
	if (descriptor === undefined) {
		return;
	}
	cb = this.cbDescriptors[descriptor];
	if (cb === undefined) {
		return;
	}

	cb.apply(null, msg.args);
	delete this.cbDescriptors[msg.descriptor];
};

Client.prototype.reset = function () {
	var connResetErr = new Error('Connection lost');
	if (this.cbDescriptors) {
		for (var key in this.cbDescriptors) {
			this.cbDescriptors[key](connResetErr);
		}
	}
	if (this.socket) {
		this.socket.destroy();
	}

	this.buffer = '';
	this.socket = null;
	this.cbDescriptorNext = 1;
	this.cbDescriptors = Object.create(null);
};

Client.prototype._tokenizer = function (data) {
	this.buffer += data;

	var result = this.buffer.split('\0');
	if (result.length === 1) {
		return [];
	}

	this.buffer = result.pop();
	return result;
};
