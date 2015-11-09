import net from 'net';
import _ from 'lodash';
import EventEmitter from 'events';

export class Client extends EventEmitter {
    constructor(logger) {
        super();

        this.logger = logger || console;
        this.socketClosed = true;
        this.connectargs = _.toArray(arguments);
        this.promiseDescriptors = new Map();
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

        this.socket
            .on('data', data => this.tokenizer(data).forEach(msg => this.handleMessage(msg)))
            .on('connect', () => {
                this.logger.info(`Connected to core at :${this.connectargs[0]}`);
                this.socketClosed = false;
                this.emit('connect');
            })
            .on('error', err => {
                if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
                    this.logger.warn(`Can't connect to Core. Retrying...`);
                    setTimeout(() => this.connect(), 1000);
                } else {
                    this.logger.error('Core connnection error: ', err);
                    this.emit('error', err);
                }
            })
            .on('close', () => {
                this.socketClosed = true;
                this.emit('close');
            });

        this.socket.connect(...this.connectargs);
    }

    request(category, method, args, stringifyResultArgs, spread) {
        return new Promise((resolve, reject) => {
            if (this.socketClosed) {
                return reject({ code: 99 });
            }

            const msg = { category, method, args, spread, stringifyResultArgs };

            msg.descriptor = this.promiseDescriptorNext++;
            this.promiseDescriptors.set(msg.descriptor, { resolve, reject });

            this.socket.write(JSON.stringify(msg) + '\0');
        });
    }

    handleMessage(msg) {
        try {
            msg = JSON.parse(msg);
        } catch (e) {
            this.emit('parseError', e);
            return;
        }

        const descriptor = msg.descriptor;
        if (descriptor === undefined) {
            return;
        }

        const promise = this.promiseDescriptors.get(descriptor);
        if (promise === undefined) {
            return;
        }

        if (msg.error) {
            promise.reject(msg.error);
        } else {
            promise.resolve(msg.result);
        }

        this.promiseDescriptors.delete(descriptor);
    }

    tokenizer(data) {
        this.buffer += data;

        const result = this.buffer.split('\0');
        if (result.length === 1) {
            return [];
        }

        this.buffer = result.pop();
        return result;
    }

    close() {
        this.socket.end();
    }
}