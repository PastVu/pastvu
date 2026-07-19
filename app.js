/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import ms from 'ms';
import http from 'http';
import path from 'path';
import moment from 'moment';
import fs from 'fs';
import log4js from 'log4js';
import config from './config/server.js';
import express from 'express';
import { Server } from 'socket.io';
import Utils from './commons/Utils.js';
import { i18nLocals } from './commons/i18n.js';
import connectDb, { waitDb } from './controllers/connection.js';
import * as session from './controllers/_session.js';
import CoreServer from './controllers/serviceConnector.js';
import { handleSocketConnection, registerSocketRequestHandler } from './app/request.js';
import exitHook from 'async-exit-hook';
import { JobCompletionListener } from './controllers/queue.js';

import { schedulePhotosTasks } from './controllers/photo.js';
import { ready as mailReady } from './controllers/mail.js';
import { ready as authReady } from './controllers/auth.js';
import { ready as regionReady, scheduleRegionStatQueueDrain } from './controllers/region.js';
import { ready as subscrReady } from './controllers/subscr.js';
import { ready as settingsReady } from './controllers/settings.js';
import * as routes from './controllers/routes.js';
import * as ourMiddlewares from './controllers/middleware.js';
import { converterStarter } from './controllers/converter.js';
import { ready as reasonsReady } from './controllers/reason.js';
import compression from 'compression';
import serveFavicon from 'serve-favicon';
import rewrite from 'express-urlrewrite';
import { createProxyMiddleware } from 'http-proxy-middleware';
import basicAuthConnect from 'basic-auth-connect';
import serveIndex from 'serve-index';
import { loadController as loadTplController } from './controllers/tpl.js';

import './models/_initValues.js';

export async function configure(startStamp) {
    const {
        env,
        logPath,
        storePath,
        manualGarbageCollect,
        listen: { hostname, port },
    } = config;

    fs.mkdirSync(path.join(storePath, 'incoming'), { recursive: true });
    fs.mkdirSync(path.join(storePath, 'private'), { recursive: true });
    fs.mkdirSync(path.join(storePath, 'protected/photos'), { recursive: true });
    fs.mkdirSync(path.join(storePath, 'public/avatars'), { recursive: true });
    fs.mkdirSync(path.join(storePath, 'public/photos'), { recursive: true });
    fs.mkdirSync(path.join(storePath, 'publicCovered/photos'), { recursive: true });

    const logger = log4js.getLogger('app');

    logger.info('Application Hash: ' + config.hash);

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, maxPoolSize: config.mongo.pool },
        logger,
    });

    const static404 = (req, res) => {
        res.statusCode = 404;
        res.end(http.STATUS_CODES[404]); // Finish with 'end' instead of 'send', that there is no additional operations (etag)
    };

    moment.locale(config.lang); // Set global language for momentjs

    const app = express();

    // Connect logger.
    app.use(log4js.connectLogger(log4js.getLogger('http'), {
        level: 'auto', // 2xx at INFO, 3xx at WARN, 4xx, 5xx at ERROR
        statusRules: [
            { codes: [302, 304], level: 'info' }, // Log 3xx (redirects) at INFO, not WARN
        ],
        nolog: '\.css|\.ico|\/img\/', // eslint-disable-line no-useless-escape
    }));

    app.set('x-powered-by', false); // Disable default X-Powered-By
    app.set('query parser', 'extended'); // Parse query with 'qs' module
    app.set('views', 'views');
    app.set('view engine', 'pug');

    // If we need user ip through req.ips(), it will return array from X-Forwarded-For with specified length.
    // https://github.com/visionmedia/express/blob/master/History.md#430--2014-05-21
    app.set('trust proxy', true);

    // Etag ('weak' by default), so browser will be able to specify it for request.
    // Thus if browser is allowed to cache with Cache-Control header, it'll send etag in request header,
    // and if generated response have same etag, server will return 304 without content (browser will get it from cache)
    app.set('etag', 'weak');

    // Enable chache of temlates in production
    // It reduce rendering time (and correspondingly 'waiting' time of client request) dramatically
    if (env === 'development') {
        app.set('view cache', false); // In dev disable this, so we able to edit pug templates without server reload
    } else {
        app.set('view cache', true);
    }

    // Set an object which properties will be available from all pug-templates as global variables
    Object.assign(app.locals, {
        pretty: false, // Adds whitespace to the resulting html to make it easier for a human to read
        compileDebug: false, // Include the function source in the compiled template for better error messages
        debug: false, // If set to true, the tokens and function body is logged to stdoutl (in development).
        config,
    });

    // Alias for photos with cid from root. /5 -> /p/5
    app.get(/^\/(\d{1,7})$/, (req, res) => {
        res.redirect(303, '/p/' + req.params[0]);
    });

    app.use(ourMiddlewares.responseHeaderHook());

    if (config.gzip) {
        app.use(compression());
    }

    if (config.servePublic) {
        const pub = path.resolve('./public');

        if (env === 'development') {
            app.use('/style', ourMiddlewares.lessToCss(path.join(pub, 'style')));
        }

        // Favicon need to be placed before static, because it will written from disc once and will be cached
        // It would be served even on next step (at static), but in this case it would be written from disc on every req
        app.use(serveFavicon(
            path.join(pub, 'favicon.ico'), { maxAge: ms(env === 'development' ? '1s' : '2d') })
        );

        app.use(express.static(pub, { maxAge: ms(env === 'development' ? '1s' : '2d'), etag: false }));

        // Seal static paths, ie request that achieve this handler will receive 404
        app.get(/^\/(?:img|js|style)(?:\/.*)$/, static404);
    }

    if (config.serveStore) {
        const { default: got } = await import('got');
        const uploadServer = `http://${config.uploader.hostname || 'localhost'}:${config.uploader.port}`;
        const downloadServer = `http://${config.downloader.hostname || 'localhost'}:${config.downloader.port}`;

        // Serve files for public photos
        app.use('/_p/', ourMiddlewares.serveImages(path.join(storePath, 'public/photos/'), { maxAge: ms('7d') }));
        app.use(rewrite('/_p/*', '/_pr/$1')); // If public doesn't exist, try to find protected version

        // Serve protected files for not public photos
        const prServeMiddleware = ourMiddlewares.serveImages(path.join(storePath, 'protected/photos/'), { maxAge: ms('7d') });

        app.use('/_pr/',
            async (req, res, next) => {
                try {
                    const response = await got(`${downloadServer}${req.originalUrl}`, {
                        headers: req.headers,
                        followRedirect: false,
                        timeout: { request: 1500 },
                    });

                    if (response.statusCode === 303) { // 303 means ok, user can get protected file
                        return prServeMiddleware(req, res, next);
                    }
                } catch (err) {
                    logger.warn('Downloader server request error:', err.message);
                }

                next();
            }
        );
        app.use(rewrite('/_pr/*', '/_prn/$1')); // If protected unavalible for user or file doesn't exist, move to covered

        // Serve covered files for not public photos
        app.use('/_prn/', ourMiddlewares.serveImages(path.join(storePath, 'publicCovered/photos/'), { maxAge: ms('7d') }));

        // Serve avatars
        app.use('/_a/', ourMiddlewares.serveImages(path.join(storePath, 'public/avatars/'), { maxAge: ms('2d') }));
        // Replace unfound avatars with default one
        app.get('/_a/d/{*path}', (req, res) => {
            res.redirect(302, '/img/caps/avatar.png');
        });
        app.get('/_a/h/{*path}', (req, res) => {
            res.redirect(302, '/img/caps/avatarth.png');
        });

        app.use(createProxyMiddleware({ target: uploadServer, pathFilter: ['/upload', '/uploadava'], logger }));
        app.use(createProxyMiddleware({ target: downloadServer, pathFilter: '/download', logger }));

        // Seal store paths, ie request that achieve this handler will receive 404
        app.get(/^\/(?:_a|_prn)(?:\/.*)$/, static404);
    }

    await Promise.all([authReady, settingsReady, regionReady, subscrReady, mailReady, reasonsReady]);

    scheduleRegionStatQueueDrain();

    const httpServer = http.createServer(app);
    const io = new Server(httpServer, {
        maxHttpBufferSize: 1e7, // Set buffer size to 10Mb handle large packets (e.g. region geometry)
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        serveClient: false,
    });

    // Set zero for unlimited listeners
    // http://nodejs.org/docs/latest/api/events.html#events_emitter_setmaxlisteners_n
    httpServer.setMaxListeners(0);
    io.sockets.setMaxListeners(0);
    process.setMaxListeners(0);

    io.use(handleSocketConnection); // Register middleware for establishing websocket connection
    registerSocketRequestHandler(io); // Register handler for socket.io events

    if (env === 'development') {
        loadTplController(app);
    }

    if (config.serveLog) {
        app.use(
            '/nodelog',
            basicAuthConnect(config.serveLogAuth.user, config.serveLogAuth.pass),
            serveIndex(logPath, { icons: true }),
            express.static(logPath, { maxAge: 0, etag: false })
        );
    }

    // Expose lang/t/ogLocale on res.locals so every res.render() picks them
    // up without each route handler threading i18n through render options.
    app.use(i18nLocals);

    // Handle appliaction routes
    routes.bindRoutes(app);

    // Handle route (express) errors
    routes.bindErrorHandler(app);

    const manualGC = manualGarbageCollect && global.gc;

    if (manualGC) {
        // Call the garbage collector after a certain time
        logger.info(`Manual garbage collection every ${manualGarbageCollect / 1000}s`);
    } else {
        logger.info('Automatic garbage collection');
    }

    const scheduleMemInfo = (function () {
        const INTERVAL = manualGC ? manualGarbageCollect : ms('30s');

        function memInfo() {
            let memory = process.memoryUsage();
            let elapsedMs = Date.now() - startStamp;
            let elapsedDays = Math.floor(elapsedMs / ms('1d'));

            if (elapsedDays) {
                elapsedMs -= elapsedDays * ms('1d');
            }

            logger.info(
                `+${elapsedDays}.${Utils.hh_mm_ss(elapsedMs, true)} `,
                `rss: ${Utils.format.fileSize(memory.rss)}`,
                `heapUsed: ${Utils.format.fileSize(memory.heapUsed)},`,
                `heapTotal: ${Utils.format.fileSize(memory.heapTotal)}`,
                manualGC ? '-> Starting GC' : ''
            );

            if (manualGC) {
                const start = Date.now();

                global.gc(); // Call garbage collector

                memory = process.memoryUsage();
                elapsedMs = Date.now() - startStamp;
                elapsedDays = Math.floor(elapsedMs / ms('1d'));

                logger.info(
                    `+${elapsedDays}.${Utils.hh_mm_ss(elapsedMs, true)} `,
                    `rss: ${Utils.format.fileSize(memory.rss)}`,
                    `heapUsed: ${Utils.format.fileSize(memory.heapUsed)},`,
                    `heapTotal: ${Utils.format.fileSize(memory.heapTotal)}`,
                    `Garbage collected in ${(Date.now() - start) / 1000}s`
                );
            }

            scheduleMemInfo();
        }

        return function (delta = 0) {
            setTimeout(memInfo, INTERVAL + delta);
        };
    }());

    logger.info(`Socket.io engine: ${io.engine.opts.wsEngine.name}`);
    logger.info(`servePublic: ${config.servePublic}, serveStore ${config.serveStore}`);
    logger.info(`Host for users: [${config.client.host}]`);

    await new CoreServer('Core', { port: config.core.port, host: '0.0.0.0' }, logger).listen();

    httpServer.listen(port, hostname, () => {
        logger.info(
            `HTTP server started up in ${(Date.now() - startStamp) / 1000}s`,
            `and listening [${hostname || '*'}:${port}]`,
            config.gzip ? 'with gzip' : ''
        );

        scheduleMemInfo(startStamp - Date.now());
    });

    exitHook(cb => {
        logger.info('HTTP server is shutting down');
        httpServer.close(cb);
    });

    // Once db is connected, register callbacks for some periodic jobs run in
    // worker instance as well as other components jobs.
    waitDb.then(async () => {
        const listener = new JobCompletionListener('session');

        listener.addCallback('archiveExpiredSessions', session.cleanArchivedSessions);
        listener.addCallback('calcUserStats', session.regetUsersAfterStatsUpdate);
        listener.init();

        // TODO: Review if any/all can be moved to worker.
        session.checkSessWaitingConnect();
        await converterStarter();
        await schedulePhotosTasks();
    });
}
