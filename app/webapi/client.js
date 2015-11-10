const _ = require('lodash');
const ms = require('ms');

const socket = require('../client/socket');
const APIError = require('../errors/APIError');

const constants = require('../constants');
const SOCKET_NOTIFICATION_EVENT_PREFIX = require('../constants').notification.SOCKET_EVENT_PREFIX;
const DEFAULT_TIMEOUT = ms('20s');

module.exports = {

    constants,

    call(method, data, opts) {
        const timeout = (opts && _.isNumber(opts.timeout)) ? opts.timeout : DEFAULT_TIMEOUT;

        return socket
            .request(method, data, timeout)
            .then(function ({ error, result }) {
                if (error) {
                    const apiError = new APIError(error.code, error.details);

                    if (error.message) {
                        apiError.message = error.message;
                    }

                    throw apiError;
                }

                return result;
            });
    },

    on(event, cb, ctx) {
        return socket.on(SOCKET_NOTIFICATION_EVENT_PREFIX + event, cb, ctx);
    },

    off(event, cb) {
        return socket.off(SOCKET_NOTIFICATION_EVENT_PREFIX + event, cb);
    }

};