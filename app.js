import './commons/JExtensions';
import fs from 'fs';
import os from 'os';
import ms from 'ms';
import http from 'http';
import path from 'path';
import posix from 'posix';
import mkdirp from 'mkdirp';
import log4js from 'log4js';
import config from './config';
import express from 'express';
import Bluebird from 'bluebird';
import socketIO from 'socket.io';
import Utils from './commons/Utils';
import * as region from './controllers/region';
import * as settings from './controllers/settings';
import * as ourMiddlewares from './controllers/middleware';

import connectDb from './controllers/connection';
import { ApiLog } from './models/ApiLog';
import { ActionLog } from './models/ActionLog';
import { Counter } from './models/Counter';
import { Settings } from './models/Settings';
import { Reason } from './models/Reason';
import { User, UserConfirm } from './models/User';
import { UserSettings } from './models/UserSettings';
import { UserStates } from './models/UserStates';
import { UserAction } from './models/UserAction';
import { Sessions } from './models/Sessions';
import { Download } from './models/Download';
import { Photo } from './models/Photo';
import { Comment } from './models/Comment';
import { Cluster } from './models/Cluster';
import { Region } from './models/Region';
import { News } from './models/News';
import './models/_initValues';

const startStamp = Date.now();
const {
    env,
    logPath,
    storePath,
    manualGarbageCollect,
    listen: {
        hostname
    },
    core: {
        hostname: coreHostname,
        port: corePort
    }
} = config;

mkdirp.sync(logPath);
mkdirp.sync(storePath + 'incoming');
mkdirp.sync(storePath + 'private');
mkdirp.sync(storePath + 'public/avatars');
mkdirp.sync(storePath + 'public/photos');

log4js.configure('./log4js.json', { cwd: logPath });
if (env === 'development') {
    log4js.addAppender(log4js.appenders.console()); // In dev write all logs also to the console
}

const nofileLimits = posix.getrlimit('nofile');
const logger404 = log4js.getLogger('404.js');
const logger = log4js.getLogger('app.js');

// Handling uncaught exceptions
process.on('uncaughtException', function (err) {
    // Add here storage for saving and resuming
    logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
    logger.trace(err && (err.stack || err));
});

process.on('exit', function () {
    logger.info('--SHUTDOWN--');
});

// Displays information about the environment
logger.info('~~~');
logger.info(`Starting server v${config.version} in ${env.toUpperCase()} mode`);
logger.info(`Platform: ${process.platform}, architecture: ${process.arch} with ${os.cpus().length} cpu cores`);
logger.info(`Node.js [${process.versions.node}] with v8 [${process.versions.v8}] on pid: ${process.pid}`);
logger.info(`Posix file descriptor limits: soft=${nofileLimits.soft}, hard=${nofileLimits.hard}`);

// Enable verbose stack trace of Bluebird promises (not in production)
if (env !== 'production') {
    logger.info('Bluebird long stack traces are enabled');
    Bluebird.longStackTraces();
}
logger.info('Application Hash: ' + config.hash);

Bluebird.promisifyAll(fs);

(async function configure() {
    await connectDb(config.mongo.connection, config.mongo.pool, logger);

    const status404Text = http.STATUS_CODES[404];
    const static404 = ({ url, method, headers: { useragent, referer } = {} }, res) => {
        logger404.error(JSON.stringify({ url, method, useragent, referer }));

        res.statusCode = 404;
        res.end(status404Text); // Finish with 'end' instead of 'send', that there is no additional operations (etag)
    };

    const app = express();
    app.disable('x-powered-by'); // Disable default X-Powered-By
    app.set('query parser', 'extended'); // Parse query with 'qs' module
    app.set('views', 'views');
    app.set('view engine', 'jade');

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
        app.disable('view cache'); // In dev disable this, so we able to edit jade templates without server reload
    } else {
        app.enable('view cache');
    }

    // Set an object which properties will be available from all jade-templates as global variables
    Object.assign(app.locals, {
        pretty: false, // Adds whitespace to the resulting html to make it easier for a human to read
        compileDebug: false, // Include the function source in the compiled template for better error messages
        debug: false, // If set to true, the tokens and function body is logged to stdoutl (in development).
        config
    });

    // Alias for photos with cid from root. /5 -> /p/5
    app.get(/^\/(\d{1,7})$/, function (req, res) {
        res.redirect(303, '/p/' + req.params[0]);
    });

    app.use(ourMiddlewares.responseHeaderHook());

    if (config.gzip) {
        app.use(require('compression')());
    }

    if (config.servePublic) {
        const pub = '/public/';

        if (env === 'development') {
            const lessMiddleware = require('less-middleware');
            app.use('/style', lessMiddleware(path.join(__dirname, pub, 'style'), {
                force: true,
                once: false,
                debug: false,
                compiler: {
                    compress: false,
                    yuicompress: false,
                    sourceMap: true,
                    sourceMapRootpath: '/',
                    sourceMapBasepath: path.join(__dirname, pub)
                },
                parser: { dumpLineNumbers: 0, optimization: 0 }
            }));
        }

        // Favicon need to be placed before static, because it will written from disc once and will be cached
        // It would be served even on next step (at static), but in this case it would be written from disc on every req
        app.use(require('serve-favicon')(
            path.join(__dirname, pub, 'favicon.ico'), { maxAge: ms(env === 'development' ? '1s' : '2d') })
        );

        app.use(express.static(path.join(__dirname, pub), {
            maxAge: ms(env === 'development' ? '1s' : '2d'),
            etag: false
        }));

        // Seal static paths, ie request that achieve this handler will receive 404
        app.get(/^\/(?:img|js|style)(?:\/.*)$/, static404);
    }
    if (config.serveStore) {
        app.use('/_a/', ourMiddlewares.serveImages(path.join(storePath, 'public/avatars/'), { maxAge: ms('2d') }));
        app.use('/_p/', ourMiddlewares.serveImages(path.join(storePath, 'public/photos/'), { maxAge: ms('7d') }));

        // Replace unfound avatars with default one
        app.get('/_a/d/*', function (req, res) {
            res.redirect(302, '/img/caps/avatar.png');
        });
        app.get('/_a/h/*', function (req, res) {
            res.redirect(302, '/img/caps/avatarth.png');
        });

        // Seal store paths, ie request that achieve this handler will receive 404
        app.get(/^\/(?:_a|_p)(?:\/.*)$/, static404);
    }

    const httpServer = http.createServer(app);
    const io = socketIO(httpServer, {
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        serveClient: false
    });

    // Set zero for unlimited listeners
    // http://nodejs.org/docs/latest/api/events.html#events_emitter_setmaxlisteners_n
    httpServer.setMaxListeners(0);
    io.sockets.setMaxListeners(0);
    process.setMaxListeners(0);

    const _session = require('./controllers/_session');

    io.use(_session.handleSocket);
    _session.loadController(io);

    await* [settings.ready, region.ready];

    settings.loadController(io);
    region.loadController(io);
    require('./controllers/actionlog').loadController();
    require('./controllers/mail').loadController();
    require('./controllers/auth').loadController(io);
    require('./controllers/reason').loadController(io);
    require('./controllers/userobjectrel').loadController();
    require('./controllers/index').loadController(io);
    require('./controllers/photo').loadController(io);
    require('./controllers/subscr').loadController(io);
    require('./controllers/comment').loadController(io);
    require('./controllers/profile').loadController(io);
    require('./controllers/admin').loadController(io);
    if (env === 'development') {
        require('./controllers/tpl').loadController(app);
    }

    require('./controllers/routes').loadController(app);

    if (config.serveLog) {
        app.use(
            '/nodelog',
            require('basic-auth-connect')('pastvu', 'pastvupastvu'),
            require('serve-index')(logPath, { icons: true }),
            express.static(logPath, { maxAge: 0, etag: false })
        );
    }

    require('./controllers/errors').registerErrorHandling(app);
    require('./controllers/systemjs').loadController();
    // require('./basepatch/v1.3.0.4').loadController(app);

    const CoreServer = require('./controllers/coreadapter').Server;

    const manualGC = manualGarbageCollect && global.gc;

    if (manualGC) {
        // Самостоятельно вызываем garbage collector через определеное время
        logger.info(`Manual garbage collection every ${manualGarbageCollect / 1000}s`);
    }

    const scheduleMemInfo = (function () {
        const INTERVAL = manualGC ? manualGarbageCollect : ms('30s');

        function memInfo() {
            let memory = process.memoryUsage();
            let elapsedMs = Date.now() - startStamp;
            let elapsedDays = Math.floor(elapsedMs / Utils.times.msDay);

            if (elapsedDays) {
                elapsedMs -= elapsedDays * Utils.times.msDay;
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

                global.gc(); // Вызываем gc

                memory = process.memoryUsage();
                elapsedMs = Date.now() - startStamp;
                elapsedDays = Math.floor(elapsedMs / Utils.times.msDay);

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

    new CoreServer(corePort, coreHostname, function () {
        httpServer.listen(config.listen.port, hostname, function () {
            logger.info(`servePublic: ${config.servePublic}, serveStore ${config.serveStore}`);
            logger.info(`Host for users: [${config.client.host}]`);
            logger.info(`Core server listening [${coreHostname || '*'}:${corePort}]`);
            logger.info(
                `HTTP server started up in ${(Date.now() - startStamp) / 1000}s`,
                `and listening [${hostname || '*'}:${config.listen.port}]`,
                config.gzip ? `with gzip` : '',
                '\n'
            );

            scheduleMemInfo(startStamp - Date.now());
        });
    });
}());