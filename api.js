#!/usr/bin/env node
'use strict';

const express = require('express');
const http = require('http');
const async = require('async');
const path = require('path');
const fs = require('fs');
const os = require('os');
const log4js = require('log4js');
const argv = require('optimist').argv;
const _ = require('lodash');

const makeDir = require('make-dir');
const mongoose = require('mongoose');
let Utils;
const CoreClient = require('./controllers/serviceConnectorPlug');

let app; let db;
let core; let
    server;

global.appVar = {}; //Глоблальный объект для хранения глобальных переменных приложения
global.appVar.maxRegionLevel = 5; //6 уровней регионов: 0..5

const interfaces = os.networkInterfaces();
const addresses = [];

for (const k in interfaces) {
    if (interfaces.hasOwnProperty(k)) {
        for (const k2 in interfaces[k]) {
            if (interfaces[k].hasOwnProperty(k2)) {
                const address = interfaces[k][k2];

                if (address.family === 'IPv4' && !address.internal) {
                    addresses.push(address.address);
                }
            }
        }
    }
}


const confDefault = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/config.json', 'utf8')));
const confConsole = _.pick(argv, Object.keys(confDefault));
const conf = _.defaults(confConsole, argv.conf ? JSON.parse(JSON.minify(fs.readFileSync(argv.conf, 'utf8'))) : {}, confDefault);

const land = conf.land; //Окружение (dev, test, prod)
const httpPort = conf.api_port; //Порт прослушки сервера
const httpHostname = conf.api_hostname; //Слушать хост

const coreHostname = conf.coreHostname; //Хост Core
const corePort = conf.corePort; //Порт Core

const moongoUri = argv.mongo_api || conf.mongo_api.con;
const moongoPool = argv.mongopool_api || conf.mongo_api.pool;

const gzip = conf.gzip; //Использовать gzip

const logPath = path.normalize(conf.logPath || __dirname + '/logs'); //Путь к папке логов
const manualGarbageCollect = conf.manualGarbageCollect; //Интервал самостоятельного вызова gc. 0 - выключено


/**
 * Вызов логера
 */
console.log('\n');
makeDir.sync(logPath);
log4js.configure('./log4js.json', { cwd: logPath });

if (land === 'dev') {
    //В dev выводим все логи также в консоль
    log4js.addAppender(log4js.appenders.console());
}

const logger = log4js.getLogger('api.js');

logger.info('~~~ API');
logger.info('Starting Node[' + process.versions.node + '] with v8[' + process.versions.v8 + '] on process pid:' + process.pid);
logger.info('Platform: ' + process.platform + ', architecture: ' + process.arch + ' with ' + os.cpus().length + ' cpu cores');

async.waterfall([
    function connectMongo(cb) {
        db = mongoose.createConnection() // http://mongoosejs.com/docs/api.html#connection_Connection
            .once('open', openHandler)
            .once('error', errFirstHandler);
        db.open(moongoUri, { server: { poolSize: moongoPool, auto_reconnect: true }, db: { safe: true } });

        function openHandler() {
            const admin = new mongoose.mongo.Admin(db.db);

            admin.buildInfo((err, info) => {
                logger.info('MongoDB[' + info.version + ', x' + info.bits + '] connected through Mongoose[' + mongoose.version + '] at: ' + moongoUri);
                cb(null);
            });
            db.removeListener('error', errFirstHandler);
            db.on('error', err => {
                logger.error('Connection error to MongoDB at: ' + moongoUri);
                logger.error(err && (err.message || err));
            });
            db.on('reconnected', () => {
                logger.info('Reconnected to MongoDB at: ' + moongoUri);
            });
        }

        function errFirstHandler(err) {
            logger.error('Connection error to MongoDB at: ' + moongoUri);
            cb(err);
        }
    },

    function loadingModels(callback) {
        require(__dirname + '/models/ApiLog.js').makeModel(db);
        callback(null);
    },

    //Настраиваем express
    function (callback) {
        global.appVar.land = land;
        Utils = require('./commons/Utils.js'); //Utils должны реквайрится после установки глобальных переменных, так как они там используются

        const ourMiddlewares = require('./controllers/middleware.js');


        app = express();
        app.enable('trust proxy', true); //Если нужно брать ip пользователя через req.ips(), это вернет массив из X-Forwarded-For с переданным количеством ip. https://github.com/visionmedia/express/blob/master/History.md#430--2014-05-21
        app.disable('x-powered-by'); //Disable default X-Powered-By
        app.set('etag', false); //Disable etag
        app.set('views', 'views');
        app.set('view engine', 'pug');

        if (land === 'dev') {
            app.disable('view cache'); //В дев выключаем только для того, чтобы можно было править шаблон без перезагрузки сервера
        } else {
            app.enable('view cache');
        }

        app.use(ourMiddlewares.responseHeaderHook());

        if (gzip) {
            app.use(require('compression')());
        }

        callback(null);
    },

    function (callback) {
        core = new CoreClient(logger);
        server = http.createServer(app);
        callback(null);
    },
    function loadingControllers(callback) {
        require('./controllers/api.js').loadController(app, core);
        require('./controllers/apilog.js').loadController();
        require('./controllers/errors.js').registerErrorHandling(app);
        callback(null);
    },
],
function finish(err) {
    if (err) {
        logger.fatal(err && (err.message || err));
        setTimeout(() => {
            process.exit(1); // Запускаем в setTimeout, т.к. в некоторых консолях в противном случае не выводятся предыдущие console.log
        }, 100);
    } else {
        /**
         * Set zero for unlimited listeners
         * http://nodejs.org/docs/latest/api/events.html#events_emitter_setmaxlisteners_n
         */
        server.setMaxListeners(0);
        process.setMaxListeners(0);

        /**
         * Handling uncaught exceptions
         */
        process.on('uncaughtException', err => {
            // Add here storage for saving and resuming
            logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
            logger.trace(err && (err.stack || err));
        });

        process.on('exit', () => {
            console.log('--SHUTDOWN--');
        });

        if (manualGarbageCollect && global.gc) {
            //Самостоятельно вызываем garbage collector через определеное время
            logger.info('Using manual garbage collection every %ss', manualGarbageCollect / 1000);
            setTimeout(function collectGarbage() {
                const start = Date.now();
                let memUsage = process.memoryUsage();

                logger.info('rss: %s, heapUsed: %s, heapTotal: %s. -> Starting GC', Utils.format.fileSize(memUsage.rss), Utils.format.fileSize(memUsage.heapUsed), Utils.format.fileSize(memUsage.heapTotal));

                global.gc(); //Вызываем gc

                memUsage = process.memoryUsage();
                logger.info('rss: %s, heapUsed: %s, heapTotal: %s. Garbage collected in %ss', Utils.format.fileSize(memUsage.rss), Utils.format.fileSize(memUsage.heapUsed), Utils.format.fileSize(memUsage.heapTotal), (Date.now() - start) / 1000);
                setTimeout(collectGarbage, manualGarbageCollect);
            }, manualGarbageCollect);
        }

        core.connect(corePort, coreHostname);
        core.once('connect', () => {
            server.listen(httpPort, httpHostname, () => {
                logger.info('API HTTP server listening [%s:%s] in %s-mode %s gzip \n', httpHostname || '*', httpPort, land.toUpperCase(), gzip ? 'with' : 'without');
            });
        });
    }
}
);
