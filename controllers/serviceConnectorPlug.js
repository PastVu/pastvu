import net from 'net';
import EventEmitter from 'events';

export default class Plug extends EventEmitter {
    constructor(logger = console, connectOptions) {
        super();

        this.logger = logger;
        this.connected = false;
        this.promiseDescriptors = new Map();
        this.connectOptions = connectOptions;
    }

    reset() {
        const connResetErr = new Error('Connection lost');

        this.promiseDescriptors.forEach(value => value.reject(connResetErr));

        if (this.socket) {
            this.socket.destroy();
        }

        this.buffer = '';
        this.socket = null;
        this.promiseDescriptorNext = 1;
        this.promiseDescriptors.clear();
    }

    connect() {
        this.reset();

        this.socket = new net.Socket();
        this.socket.setEncoding('utf8');
        this.socket.setNoDelay(true);

        return new Promise(resolve => {
            this.socket
                .on('data', data => this.tokenizer(data).forEach(msg => this.handleMessage(msg)))
                .on('connect', () => {
                    this.logger.info(`Connected to core at [${this.connectOptions.host}:${this.connectOptions.port}]`);
                    this.connected = true;
                    this.emit('connect');
                })
                .once('connect', resolve)
                .on('error', error => {
                    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                        this.logger.warn(`Can't connect to Core. Retrying...`);
                    } else {
                        this.logger.error('Core connnection error. Retrying...:', error);
                        this.emit('error', error);
                    }
                    setTimeout(() => this.connect(), 1000);
                })
                .on('close', hadError => {
                    this.connected = false;
                    this.emit('close');

                    if (!hadError) {
                        this.logger.warn('Connection to core has been closed. Reconnecting...');
                        setTimeout(() => this.connect(), 1000);
                    }
                });

            this.socket.connect(this.connectOptions);
        });
    }

    request(data) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                return reject({ code: 99 });
            }

            const msg = { descriptor: this.promiseDescriptorNext++, ...data};

            this.promiseDescriptors.set(msg.descriptor, { resolve, reject });

            this.socket.write(JSON.stringify(msg) + '\0');
        });
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
            this.emit('parseError', error);
        }
    }

    handleMessage(msgString) {
        const msg = this.parseMessage(msgString);

        if (!msg || !msg.descriptor) {
            return;
        }

        const descriptor = msg.descriptor;

        const promise = this.promiseDescriptors.get(descriptor);

        if (!promise) {
            return;
        }

        if (msg.error) {
            promise.reject(msg.error);
        } else {
            promise.resolve(msg.result);
        }

        this.promiseDescriptors.delete(descriptor);
    }

    close() {
        this.socket.end();
    }
}