import net from 'net';
import { handleServiceRequest } from '../app/request';

class ClientSocket {
    constructor(server, socket, logger) {
        this.server = server;
        this.socket = socket;
        this.logger = logger;
        this.buffer = '';

        socket.setEncoding('utf8');
        socket.setNoDelay(true);
        socket.on('data', data => this.tokenizer(data).forEach(message => this.handleMessage(message)));
    }

    tokenizer(data = '') {
        const result = (this.buffer + data).split('\0');

        this.buffer = result.pop() || '';
        return result;
    }

    parseMessage(msg) {
        if (!msg) {
            return;
        }
        try {
            return JSON.parse(msg);
        } catch (error) {
            this.logger.warn(`Core: error parsing incoming message: ${error}. Message: ${msg}`);
        }
    }

    handleMessage(msgString) {
        const msg = this.parseMessage(msgString);

        if (!msg || !msg.method) {
            return;
        }

        const { sid, method, params, descriptor } = msg;
        const callPromise = handleServiceRequest({ sid, methodName: method, params });

        if (!descriptor) {
            callPromise.catch(error => this.logger.warn(`Service didn't request response, but call error occured`, error));
            return;
        }

        const result = { descriptor };

        callPromise
            .then(methodResult => {
                let { spread, stringifyResultArgs } = msg;

                // If specified that the arguments should be passed as a string, stringify them
                if (stringifyResultArgs) {
                    // If 'spread' parameter specified, means methodResult contains array of arguments
                    if (spread) {
                        // If specified not number of arguments, but flag, means every argument need to be stringified
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

export default class Server {
    constructor(name, listenOptions, logger = console) {
        this.name = name;
        this.logger = logger;
        this.listenOptions = listenOptions;
        this.clientSockets = [];

        this.server = net.createServer(socket => {
            const clientSocket = new ClientSocket(this.server, socket);
            this.clientSockets = [...this.clientSockets, clientSocket];

            socket
                .on('error', error => {
                    this.logger.warn(`${this.name} client connection error:`, error);
                })
                .on('close', hadError => {
                    if (hadError) {
                        socket.destroy();
                    }
                    this.clientSockets = this.clientSockets.filter(item => item !== clientSocket);

                    this.logger.info(`${this.name} client disconnected. Total clients: ${this.clientSockets.length}`);
                });

            this.logger.info(`${this.name} client connected. Total clients: ${this.clientSockets.length}`);
        });

    }

    listen() {
        return new Promise((resolve, reject) => {
            const { host, port } = this.listenOptions;

            this.server
                .on('listening', () => {
                    this.logger.info(`${this.name} server listening [${host || '*'}:${port}]`);
                    resolve();
                })
                .on('error', err => {
                    if (err.code === 'EADDRINUSE') {
                        this.logger.error(`${this.name} server address in use, retrying...`);
                        setTimeout(function () {
                            this.server.close();
                            this.listen();
                        }, 1000);
                    } else {
                        this.logger.error(`${this.name} server error occured:`, err);
                        reject(reject);
                    }
                })
                .listen(this.listenOptions);
        });
    }
}