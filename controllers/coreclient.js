import net from 'net';
import _ from 'lodash';
import util from 'util';
import events from 'events';
import Bluebird from 'bluebird';

export const Client = function (logger) {
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
            var messages = that._tokenizer(data);

            for (var i = 0, len = messages.length; i < len; i++) {
                that.handleMessage(messages[i]);
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
Client.prototype.request = Bluebird.method(function (category, method, args, stringifyResultArgs, spread) {
    if (this.socketClosed) {
        throw { code: 99 };
    }
    var that = this;

    return new Bluebird(function (resolve, reject) {
        var msg = {
            category: category,
            method: method,
            args: args,
            spread: spread,
            stringifyResultArgs: stringifyResultArgs
        };

        msg.descriptor = that.promiseDescriptorNext++;
        that.promiseDescriptors[msg.descriptor] = { resolve: resolve, reject: reject };

        that.socket.write(JSON.stringify(msg) + '\0');
    });
});
Client.prototype.close = function () {
    this.socket.end();
};

Client.prototype.handleMessage = function (msg) {
    var descriptor;
    var promise;

    try {
        msg = JSON.parse(msg);
    } catch (e) {
        this.emit('parseError', e);
        return;
    }

    descriptor = msg.descriptor;
    if (descriptor === undefined) {
        return;
    }

    promise = this.promiseDescriptors[descriptor];
    if (promise === undefined) {
        return;
    } else if (msg.error) {
        promise.reject(msg.error);
    } else {
        promise.resolve(msg.result);
    }

    delete this.promiseDescriptors[descriptor];
};

Client.prototype.reset = function () {
    var connResetErr = new Error('Connection lost');
    if (this.promiseDescriptors) {
        for (var key in this.promiseDescriptors) {
            this.promiseDescriptors[key].reject(connResetErr);
        }
    }
    if (this.socket) {
        this.socket.destroy();
    }

    this.buffer = '';
    this.socket = null;
    this.promiseDescriptorNext = 1;
    this.promiseDescriptors = Object.create(null);
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