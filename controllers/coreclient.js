'use strict';

var net = require('net'),
	util = require('util'),
	events = require('events');

var Client = module.exports = function () {
	this.reset();
};
util.inherits(Client, events.EventEmitter);

Client.prototype.connect = function () {
	var that = this;

	this.socket = new net.Socket();

	this.socket.setEncoding('utf8');
	this.socket.setNoDelay(true);

	this.socket.on('data', function (data) {
		var messages = that._tokenizer(data),
			len = messages.length,
			i = 0;

		while (i < len) {
			that.handleMessage(messages[i++]);
		}
	});
	this.socket.on('connect', function () {
		that.emit('connect');
	});
	this.socket.on('error', function (e) {
		that.emit('error', e);
	});
	this.socket.on('close', function () {
		that.reset();
		that.emit('close');
	});

	this.socket.connect.apply(this.socket, arguments);
};

Client.prototype.send = function (category, method, args, cb) {
	var msg = {
			category: category,
			method: method,
			args: args
		},
		cbDescriptor;

	if (cb) {
		cbDescriptor = this.cbDescriptorNext++;
		msg.descriptor = cbDescriptor;
		this.cbDescriptors[cbDescriptor] = cb;
	}

	this.socket.write(JSON.stringify(msg) + '\0');
};
Client.prototype.close = function () {
	this.socket.end();
};

Client.prototype.handleMessage = function (msg) {
	var descriptor,
		cb;

	try {
		msg = JSON.parse(msg);
	} catch (e) {
		this.emit('error', e);
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

	cb.apply(msg.args);
	delete this.cbDescriptors[msg.descriptor];
};

Client.prototype.reset = function () {
	var connResetErr = new Error('Connection lost');
	if (this.cbDescriptors) {
		for (var key in this.cbDescriptors) {
			this.cbDescriptors[key](connResetErr);
		}
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
