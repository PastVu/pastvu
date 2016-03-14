import _ from 'lodash';
import http from 'http';
import util from 'util';
import log4js from 'log4js';
import config from '../config';
import Utils from '../commons/Utils';
import sioRouter from 'socket.io-events';
import webApiCall from './webapi';
import { send500 } from '../controllers/routes';
import constants from './errors/constants';
import constantsError from './errors/constants';
import * as sessionController from '../controllers/_session';
import { ApplicationError } from './errors';

const logger = log4js.getLogger('request');
const loggerLong = log4js.getLogger('requestLong');

/**
 * Inspect data to logger
 */
const inspect = (function () {
    const inspectOptions = { depth: null, colors: config.env === 'development' };
    return obj => util.inspect(obj, inspectOptions);
}());

/**
 * Request's context generator
 *
 * rid - requestId, generated string, an identifier of the request
 * ridMark - "[RID-requestId]" is a prefix for loggers
 * trace - array of execution webapi methods with timings, like { type: 'webapi', method: 'Accaunting.Method', ms: 10 }
 * rpc - объект, наследуемый от экземпляра rpc с теми же собственными свойствами, что и у coreApi
 *
 * @returns {{trace: Array, rid: string, ridMark: string}}
 */
const genRequestContext = function ({ handshake, socket } = {}) {
    const rid = Utils.randomString(10, true);
    const requestTrace = [];
    let ridMark;

    if (handshake && handshake.usObj) {
        const { usObj, session } = handshake;
        ridMark = getUserIdForRidMark(rid, usObj, session);
    } else {
        ridMark = `[RID-${rid}]`;
    }

    return { rid, ridMark, call: webApiCall, trace: requestTrace, addUserIdToRidMark, handshake, socket };
};

function addUserIdToRidMark(usObj, session) {
    this.ridMark = getUserIdForRidMark(this.rid, usObj, session);
}
function getUserIdForRidMark(rid, usObj, session) {
    return `[RID-${rid} ${usObj.registered ? `U-${usObj.user.login}` : `S-${session.key}`}]`;
}

const logTrace = function (context, elapsedTotal, methodName) {
    if (_.size(context.trace) < 2) {
        return;
    }

    const elapsedByType = { webapi: 0, rpc: 0 };
    const message = util.format(
        'Trace:',
        _.reduce(context.trace, function (result, record) {
            elapsedByType[record.type] += record.ms;
            return result + '\n' + record.ms + 'ms, ' + record.type + ', ' + record.method;
        }, ''),
        '\nTotal wait time by layer type:',
        elapsedTotal + 'ms request  ',
        _.reduce(elapsedByType, function (result, elapsed, type) {
            if (elapsed > 0) {
                result += elapsed + 'ms ' + type + '  ';
            }

            return result;
        }, '')
    );

    logger.debug(context.ridMark, message);

    if (elapsedTotal >= config.logLongDuration) {
        loggerLong.debug(
            context.ridMark, 'request', methodName ? 'for ' + methodName : '', `execuded in ${elapsedTotal}ms.`, message
        );
    }
};

const callWebApi = async function (methodName, params) {
    const context = this;
    let result;

    try {
        result = { result: await this.call(methodName, params, true) };
    } catch (error) {
        result = { error };
    }

    // Send requestId to client, so that we can find request in logs
    result.rid = context.rid;

    return result;
};

/**
 * Handling incoming http-request
 */
export const handleHTTPRequest = async function (req, res, next) {
    const start = Date.now();
    const context = genRequestContext();
    const writeHeadOriginal = res.writeHead;

    logger.info(`${context.ridMark} -> HTTP request`);

    req.handshake = context.handshake = {
        host: req.headers.host,
        context
    };

    // Hook when response sending, executes after all route's handlers
    res.writeHead = function () {
        const elapsed = Date.now() - start;

        logger.info(`${context.ridMark} <- HTTP request finished with status ${res.statusCode} in ${elapsed}ms`);
        logTrace(context, elapsed);

        res.setHeader('X-Response-Time', elapsed + 'ms');
        writeHeadOriginal.apply(res, arguments);
    };

    try {
        // Create/select session for this connection
        const data = await sessionController.handleConnection.call(context, req.ip, req.headers, true, req);

        req.handshake.session = data.session;
        req.handshake.usObj = data.usObj;
        req.handshake.locale = data.locale;

        // Add session id to Set-cookie header (create or prolongs it on client)
        const cookieObj = sessionController.createSidCookieObj(data.session);
        const cookieResOptions = { path: cookieObj.path, domain: cookieObj.domain };

        if (cookieObj['max-age'] !== undefined) {
            cookieResOptions.maxAge = cookieObj['max-age'] * 1000;
        }
        res.cookie(cookieObj.key, cookieObj.value, cookieResOptions);

        // Transfer browser object further in case of future use, for example, in 'X-UA-Compatible' header
        req.browser = data.browser;
        req.cookie = data.cookie;

        next();
    } catch (error) {
        if (error instanceof ApplicationError) {
            if (!error.logged) {
                logger.warn(_.compact([
                    `${context.ridMark} HTTP request`,
                    `${inspect(error.toJSON())}`,
                    error.trace ? error.stack : undefined
                ]).join('\n'));
            }
        } else {
            logger.warn(`${context.ridMark} HTTP request`, error);
        }

        if (error.code === constantsError.SESSION_NO_HEADERS) {
            return res.status(400).send(error.code);
        }

        const locale = sessionController.identifyUserLocale(req.headers['accept-language']);

        if (error.code === constantsError.BAD_BROWSER) {
            res.statusCode = 200;
            res.render('status/badbrowser', { agent: error.details.agent, locale });
        } else if (error.code === 'ETIMEDOUT') {
            res.setHeader('Retry-After', 60);
            res.status(503).send('Service Unavailable: ' + (_.isFunction(error.toString) ? error.toString() : error));
        } else if (error) {
            send500(req, res, error);
        } else {
            res.sendStatus(500);
        }
    }
};

/**
 * Handler of API requests through http (for mobile applications)
 */
export const registerHTTPAPIHandler = (function () {
    function finishRequest(status, req, res, start, result) {
        const query = req.query;
        const now = Date.now();

        logger.info(
            `${this.ridMark} HTTP "${query.method}" method has been executed in ${now - start}ms`,
            `and ready to response with ${status} status`
        );

        if (!result) {
            result = { error: http.STATUS_CODES[status] };
        }

        res.status(status).json(result);
    }

    return async function httpAPIHandler(req, res) {
        const start = Date.now();
        const method = req.method;

        if (method !== 'GET' && method !== 'POST') {
            return res.set({ 'Allow': 'GET, POST' }).status(405).send('405 Method Not Allowed');
        }

        let query = req.query;

        if (method === 'POST') {
            query = _.isEmpty(query) ? req.body : _.assign({}, req.body, query);
        }

        if (_.isEmpty(query)) {
            return res.set({ 'Cache-Control': 'no-cache' }).status(200).send('Welcome to PastVu Api');
        }

        let params = query.params;
        const methodName = query.method;
        const context = req.handshake.context;

        logger.info(`${context.ridMark} HTTP "${methodName}" method has requested`);

        if (params === undefined) {
            params = {};
        } else if (typeof params === 'string') {
            try {
                params = params ? JSON.parse(params) : {};
            } catch (e) {
                return finishRequest.call(context, 400, req, res, start);
            }
        }

        const result = await callWebApi.call(context, methodName, params);

        if (result.error) {
            if (result.error.code === constants.NO_SUCH_METHOD) {
                finishRequest.call(context, 400, req, res, start, result.error.message);
            } else {
                finishRequest.call(context, 200, req, res, start, result.error);
            }
        } else {
            finishRequest.call(context, 200, req, res, start, result);
        }
    };
}());

/**
 * Handle incoming websocket-connection. Executes only once for browser tab
 */
export const handleSocketConnection = (function () {

    // On disconnetcion checks the necessity of keeping session and usObj in hashes
    const onSocketDisconnection = function (connectionContext/* , reason */) {
        const socket = this;
        const session = socket.handshake.session;
        const usObj = socket.handshake.usObj;

        logger.info(`${connectionContext.ridMark} <- Socket disconnection`);
        delete session.sockets[socket.id]; // Remove socket from session

        // If no more sockets in this session, remove session
        if (_.isEmpty(session.sockets)) {
            connectionContext.call(
                'session.removeSessionFromHashes', { usObj, session, logPrefix: 'onSocketDisconnection' }
            );
        }
    };

    return async function (socket, next) {
        const start = Date.now();
        const handshake = socket.handshake;
        const headers = handshake.headers;
        const context = genRequestContext({ handshake, socket });
        const ip = _.get(socket, 'client.conn.remoteAddress') || handshake.address || headers['x-real-ip'];

        logger.info(`${context.ridMark} -> Socket connection`);

        // Create/select session for this socket connection
        try {
            const data = await sessionController.handleConnection.call(context, ip, headers);
            const session = data.session;

            handshake.usObj = data.usObj;
            handshake.session = session;
            handshake.locale = data.locale;
            handshake.host = headers.host;

            if (!session.sockets) {
                session.sockets = Object.create(null);
            }
            session.sockets[socket.id] = socket; // Put socket into session

            socket.on('disconnect', _.partial(onSocketDisconnection, context)); // Disconnect handler
            next();
        } catch (error) {
            next(error);
        } finally {
            const elapsed = Date.now() - start;
            let message = `${context.ridMark} Socket connection handled in ${elapsed}ms`;

            if (!context.trace.length) {
                message += ' without layer types invoking';
            }

            logger.info(message);

            if (context.trace.length) {
                logTrace(context, elapsed, 'SocketConnection');
            }
        }
    };
}());

/**
 * Handler of all websocket requests
 */
const handleSocketRequest = sioRouter();
handleSocketRequest.on('*', async function handleSocketRequest(socket, args) {
    const start = Date.now();
    const methodName = args[0];
    const params = args[1];
    const acknowledgementCallback = _.last(args);

    socket = socket.sock;

    const context = genRequestContext({ handshake: socket.handshake, socket });

    logger.info(`${context.ridMark} -> Socket request for "${methodName}" method has arrived`);

    const response = await callWebApi.call(context, methodName, params);
    const elapsed = Date.now() - start;
    const logmessage = `${context.ridMark} <- Socket request for "${methodName}" method finished in ${elapsed}ms`;

    if (_.isFunction(acknowledgementCallback)) {
        // If client specified callback function, pass result into callback, if connection is still active
        if (socket.connected) {
            response.responseTime = elapsed;

            acknowledgementCallback(response);

            logger.info(logmessage, 'and responded to the client');
        } else {
            logger.warn(logmessage, 'and wanted to respond to the client, but the corresponding connection was lost');
        }
    } else {
        logger.info(logmessage);
    }

    logTrace(context, elapsed, methodName);
});

export const registerSocketRequestHendler = io => io.use(handleSocketRequest);