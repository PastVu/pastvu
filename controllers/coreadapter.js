import net from 'net';
import _ from 'lodash';
import log4js from 'log4js';
import Bluebird from 'bluebird';
import { core as photoCore } from './photo';
import { core as commentCore } from './comment';

const logger = log4js.getLogger('app');

const core = {
    photo: photoCore,
    comment: commentCore
};
const coreCaller = Bluebird.method(function (msg) {
    var cat = core[msg.category];
    var method;

    if (cat !== undefined) {
        method = cat[msg.method];
    }

    if (typeof method === 'function') {
        return method.apply(null, msg.args);
    }

    throw { message: 'Unsupported method [' + msg.category + ':' + msg.method + ']' };
});

var clientSockets = [];
var ClientSocket = function (server, socket) {
    this.server = server;
    this.socket = socket;

    this.buffer = '';

    var that = this;

    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    socket.on('data', function (data) {
        var messages = that._tokenizer(data);

        for (var i = 0, len = messages.length; i < len; i++) {
            that.handleMessage(messages[i]);
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
        var coreCallerPromise = coreCaller(msg);

        if (msg.descriptor) {
            var result = { descriptor: msg.descriptor };

            coreCallerPromise
                .bind(this)
                .then(function (methodResult) {
                    var spread = msg.spread;
                    var stringifyResultArgs = msg.stringifyResultArgs;

                    // Если передано что аргументы надо передавать как строка, стрингуем их
                    if (stringifyResultArgs) {
                        // Если указан параметр spread, значит в methodResult массив с несколькими аргументами
                        if (spread) {
                            // Если передано не число аргументов, а флаг, значит надо стригифаить каждый аргумент
                            if (stringifyResultArgs === true) {
                                stringifyResultArgs = methodResult.length;
                            }

                            for (var i = 0; i < stringifyResultArgs; i++) {
                                methodResult[i] = JSON.stringify(methodResult[i]);
                            }
                        } else {
                            methodResult = JSON.stringify(methodResult);
                        }
                    }

                    result.result = methodResult;
                })
                .catch(function (err) {
                    result.error = err;
                })
                .finally(function () {
                    this.socket.write(JSON.stringify(result) + '\0');
                });
        }
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

export const Server = function () {
    var args = _.toArray(arguments);
    var server = net.createServer(function (socket) {
        var clientSocket = new ClientSocket(server, socket);
        var ondestroy = function () {
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
};