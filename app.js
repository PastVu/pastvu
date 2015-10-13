'use strict';

const startStamp = Date.now();

import './commons/JExtensions';
import fs from 'fs';
import os from 'os';
import ms from 'ms';
import _ from 'lodash';
import http from 'http';
import path from 'path';
import posix from 'posix';
import mkdirp from 'mkdirp';
import log4js from 'log4js';
import express from 'express';
import { argv } from 'optimist';
import Bluebird from 'bluebird';
import socketIO from 'socket.io';
import constants from './controllers/constants';
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

import { fillData as fillSettingsData } from './controllers/settings';
import { fillData as fillRegionData } from './controllers/region';

global.appVar = {}; // Глоблальный объект для хранения глобальных переменных приложения
global.appVar.maxRegionLevel = constants.region.maxLevel;

const nofileLimits = posix.getrlimit('nofile');
const addresses = _.transform(os.networkInterfaces(), (result, face) => face.forEach(function (address) {
    if (address.family === 'IPv4' && !address.internal) {
        result.push(address.address);
    }
}), []);

const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8'));
const confDefault = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/config.json', 'utf8')));
const confConsole = _.pick(argv, Object.keys(confDefault));
const conf = _.defaults(confConsole, argv.conf ? JSON.parse(JSON.minify(fs.readFileSync(argv.conf, 'utf8'))) : {}, confDefault);

const land = conf.land; // Окружение (dev, test, prod)
const httpPort = conf.port; // Порт прослушки сервера
const httpHostname = conf.hostname; // Хост прослушки сервера

const coreHostname = conf.core_hostname; // Хост Core
const corePort = conf.core_port; // Порт Core

const protocol = conf.protocol; // Протокол сервера для клинетов
const domain = conf.domain || addresses[0]; // Адрес сервера для клинетов
const port = conf.projectport; // Порт сервера для клиента
const uport = conf.projectuport; // Порт сервера загрузки фотографий для клиента
const dport = conf.projectdport; // Порт сервера скачки фотографий для клиента
const host = domain + port; // Имя хоста (адрес+порт)

const subdomains = (argv.subdomains || conf.subdomains).split('_').filter(function (item) {
    return typeof item === 'string' && item.length > 0;
}); // Поддомены для раздачи статики из store
const moongoUri = argv.mongo || conf.mongo.con;
const moongoPool = argv.mongopool || conf.mongo.pool;
const mail = conf.mail || {};

const buildJson = land === 'dev' ? {} : JSON.parse(fs.readFileSync(__dirname + '/build.json', 'utf8'));
const storePath = path.normalize(conf.storePath || (__dirname + '/../store/')); // Путь к папке хранилища
const servePublic = conf.servePublic; // Флаг, что node должен раздавать статику скриптов
const serveStore = conf.serveStore; // Флаг, что node должен раздавать статику хранилища
const serveLog = conf.serveLog; // Флаг, что node должен раздавать лог
const gzip = conf.gzip; // Использовать gzip

const logPath = path.normalize(conf.logPath || (__dirname + '/logs')); // Путь к папке логов
const manualGCInterval = conf.manualGarbageCollect; // Интервал самостоятельного вызова gc. 0 - выключено

Object.assign(
    global.appVar,
    { land, storePath, mail, serverAddr: { protocol, domain, host, port, uport, dport, subdomains } }
);

mkdirp.sync(logPath);
mkdirp.sync(storePath + 'incoming');
mkdirp.sync(storePath + 'private');
mkdirp.sync(storePath + 'public/avatars');
mkdirp.sync(storePath + 'public/photos');

log4js.configure('./log4js.json', { cwd: logPath });
if (land === 'dev') {
    // In dev write all logs to the console
    log4js.addAppender(log4js.appenders.console());
}
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

logger.info('~~~');

// Вывод информации об окружении
logger.info(`Platform: ${process.platform}, architecture: ${process.arch} with ${os.cpus().length} cpu cores`);
logger.info(`Node.js [${process.versions.node}] with v8 [${process.versions.v8}] on process pid: ${process.pid}`);
logger.info(`Posix file descriptor limits: soft=${nofileLimits.soft}, hard=${nofileLimits.hard}`);

// Включаем подробный stack trace промисов не на проде
if (land !== 'prod') {
    logger.info('Bluebird long stack traces are enabled');
    Bluebird.longStackTraces();
}

Bluebird.promisifyAll(fs);

(async function configure() {
    const db = await connectDb(moongoUri, moongoPool, logger);
    // Utils должны реквайрится после установки глобальных переменных, так как они там используются
    // TODO: fix it
    const Utils = require('./commons/Utils');

    const status404Text = http.STATUS_CODES[404];
    const static404 = function ({ url, method, headers: { useragent, referer } = {} }, res) {
        logger404.error(JSON.stringify({ url, method, useragent, referer }));

        res.statusCode = 404;
        res.end(status404Text); // Finish with 'end' instead of 'send', that there is no additional operations (etag)
    };

    const app = express();
    app.disable('x-powered-by'); // Disable default X-Powered-By
    app.set('query parser', 'extended'); // Parse with 'qs' module
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
    if (land === 'dev') {
        app.disable('view cache'); // In dev disable this, so we able to edit jade templates without server reload
    } else {
        app.enable('view cache');
    }

    app.hash = land === 'dev' ? pkg.version : buildJson.appHash;
    logger.info('Application Hash: ' + app.hash);

    app.set('appEnv', {
        land,
        storePath,
        hash: app.hash,
        version: pkg.version,
        serverAddr: global.appVar.serverAddr
    });

    // Set an object which properties will be available from all jade-templates as global variables
    Object.assign(app.locals, {
        pretty: false, // Adds whitespace to the resulting html to make it easier for a human to read
        compileDebug: false, // Include the function source in the compiled template for better error messages
        debug: false, // If set to true, the tokens and function body is logged to stdoutl (in development).

        appLand: land, // Decides which scripts insert in the head
        appHash: app.hash // Inserted in page head
    });

    // Alias for photos with cid from root. /5 -> /p/5
    app.get(/^\/(\d{1,7})$/, function (req, res) {
        res.redirect(303, '/p/' + req.params[0]);
    });

    app.use(ourMiddlewares.responseHeaderHook());

    if (gzip) {
        app.use(require('compression')());
    }

    if (servePublic) {
        const pub = '/public/';

        if (land === 'dev') {
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
        app.use(require('serve-favicon')(path.join(__dirname, pub, 'favicon.ico'), { maxAge: ms(land === 'dev' ? '1s' : '2d') }));
        app.use(express.static(path.join(__dirname, pub), {
            maxAge: ms(land === 'dev' ? '1s' : '2d'),
            etag: false
        }));

        // Seal static paths, ie request that achieve this handler will receive 404
        app.get(/^\/(?:img|js|style)(?:\/.*)$/, static404);
    }
    if (serveStore) {
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

    let CoreServer;
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
    _session.loadController(app, io);

    await* [fillSettingsData(app, io), fillRegionData(app, io)];

    require('./controllers/actionlog').loadController();
    require('./controllers/mail').loadController();
    require('./controllers/auth').loadController(app, db, io);
    require('./controllers/reason').loadController(io);
    require('./controllers/userobjectrel').loadController();
    require('./controllers/index').loadController(app, db, io);
    require('./controllers/photo').loadController(app, db, io);
    require('./controllers/subscr').loadController(io);
    require('./controllers/comment').loadController(io);
    require('./controllers/profile').loadController(app, db, io);
    require('./controllers/admin').loadController(app, db, io);
    if (land === 'dev') {
        require('./controllers/tpl').loadController(app);
    }

    require('./controllers/routes').loadController(app);

    if (serveLog) {
        app.use(
            '/nodelog',
            require('basic-auth-connect')('pastvu', 'pastvupastvu'),
            require('serve-index')(logPath, { icons: true }),
            express.static(logPath, { maxAge: 0, etag: false })
        );
    }

    require('./controllers/errors').registerErrorHandling(app);
    require('./controllers/systemjs').loadController(app, db);
    // require('./basepatch/v1.3.0.4').loadController(app, db);

    CoreServer = require('./controllers/coreadapter');

    const manualGC = manualGCInterval && global.gc;

    if (manualGC) {
        // Самостоятельно вызываем garbage collector через определеное время
        logger.info(`Manual garbage collection every ${manualGCInterval / 1000}s`);
    }

    const scheduleMemInfo = (function () {
        const INTERVAL = manualGC ? manualGCInterval : ms('30s');

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
        httpServer.listen(httpPort, httpHostname, function () {
            logger.info(`servePublic: ${servePublic}, serveStore ${serveStore}`);
            logger.info(`Host for users: [${protocol}://${host}]`);
            logger.info(`Core server listening [${coreHostname || '*'}:${corePort}] in ${land.toUpperCase()}-mode`);
            logger.info(
                `HTTP server listening [${httpHostname || '*'}:${httpPort}] in ${land.toUpperCase()}-mode`,
                `${gzip ? 'with' : 'without'} gzip`,
                '\n'
            );

            scheduleMemInfo(startStamp - Date.now());
        });
    });
}());