import net from 'net';
import _ from 'lodash';
import log4js from 'log4js';
import { core as photoCore } from './photo';
import { core as commentCore } from './comment';

const logger = log4js.getLogger('app');

const core = {
    photo: photoCore,
    comment: commentCore
};

function coreCaller(msg) {
    const cat = core[msg.category];

    if (cat !== undefined) {
        const method = cat[msg.method];

        if (typeof method === 'function') {
            return method(...msg.args);
        }
    }

    throw { message: `Unsupported method [${msg.category}:${msg.method}]` };
};

class ClientSocket {
    constructor(server, socket) {
        this.server = server;
        this.socket = socket;
        this.buffer = '';

        socket.setEncoding('utf8');
        socket.setNoDelay(true);
        socket.on('data', data => this._tokenizer(data).forEach(message => this.handleMessage(message)));
    }

    handleMessage(msg) {
        try {
            msg = JSON.parse(msg);
        } catch (e) {
            return logger.error(`Core: error parsing incoming message: ${e}. Message: ${msg}`);
        }

        if (!msg) {
            return;
        }

        const coreCallerPromise = coreCaller(msg);

        if (msg.descriptor) {
            const result = { descriptor: msg.descriptor };

            coreCallerPromise
                .then(methodResult => {
                    const spread = msg.spread;
                    let stringifyResultArgs = msg.stringifyResultArgs;

                    // Если передано что аргументы надо передавать как строка, стрингуем их
                    // If you specified that the arguments should be passed as a string, stringify them
                    if (stringifyResultArgs) {
                        // If 'spread' parameter specified, means methodResult contains array of arguments
                        if (spread) {
                            // If specified not number of arguments, but flag,
                            // means every argument need to be stringified
                            if (stringifyResultArgs === true) {
                                stringifyResultArgs = methodResult.length;
                            }

                            for (let i = 0; i < stringifyResultArgs; i++) {
                                methodResult[i] = JSON.stringify(methodResult[i]);
                            }
                        } else {
                            methodResult = JSON.stringify(methodResult);
                        }
                    }

                    result.result = methodResult;
                })
                .catch(err => {
                    result.error = err;
                })
                .finally(() => {
                    this.socket.write(JSON.stringify(result) + '\0');
                });
        }
    }

    _tokenizer(data) {
        this.buffer += data;

        const result = this.buffer.split('\0');
        if (result.length === 1) {
            return [];
        }

        this.buffer = result.pop();
        return result;
    }
}

export class Server {
    constructor() {
        this.listenargs = _.toArray(arguments);
        this.clientSockets = [];

        this.server = net.createServer(socket => {
            const clientSocket = new ClientSocket(this.server, socket);
            const ondestroy = () => {
                socket.destroy();
                _.remove(this.clientSockets, clientSocket);

                logger.info(`Core client disconnected. Total clients: ${this.clientSockets.length}`);
            };

            this.clientSockets.push(clientSocket);

            socket.on('error', err => {
                logger.warn('Core client connection error: ', err);
            });
            socket.on('close', ondestroy);
            socket.on('end', () => {
                logger.info('Core client connection end');
                ondestroy();
            });

            logger.info(`Core client connected. Total clients: ${this.clientSockets.length}`);
        });

        this.server.on('error', err => {
            if (err.code === 'EADDRINUSE') {
                logger.error('Address in use, retrying...');
                setTimeout(function () {
                    this.server.close();
                    this.listen();
                }, 1000);
            } else {
                logger.error('Error occured: ', err);
            }
        });

        this.listen();
    }
    listen() {
        this.server.listen(...this.listenargs);
    }
}