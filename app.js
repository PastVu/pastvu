'use strict';

const startStamp = Date.now();

// Включаем "наши" расширения js
require('./commons/JExtensions');

const express = require('express');
const async = require('async');
const posix = require('posix');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const step = require('step');
const log4js = require('log4js');
const argv = require('optimist').argv;
const _ = require('lodash');
const Bluebird = require('bluebird');

const mkdirp = require('mkdirp');
const mongoose = require('mongoose');
const ms = require('ms'); // Tiny milisecond conversion utility
let Utils;

const constants = require('./controllers/constants');
let app;
let io;
let db;
let CoreServer;
let httpServer;

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

/**
 * Вызов логера
 */
console.log('\n');
mkdirp.sync(logPath);
log4js.configure('./log4js.json', { cwd: logPath });
if (land === 'dev') {
    // В dev выводим все логи также в консоль
    log4js.addAppender(log4js.appenders.console());
}
const logger404 = log4js.getLogger('404.js');
const logger = log4js.getLogger('app.js');

logger.info('~~~');

// Вывод информации об окружении
logger.info('Platform: %s, architecture: %s with %d cpu cores', process.platform, process.arch, os.cpus().length);
logger.info('Node.js [%s] with v8 [%s] on process pid: %d', process.versions.node, process.versions.v8, process.pid);
logger.info('Posix file descriptor limits: soft=%d, hard=%d', nofileLimits.soft, nofileLimits.hard);

// Включаем подробный stack trace промисов не на проде
if (land !== 'prod') {
    logger.info('Bluebird long stack traces are enabled');
    Bluebird.longStackTraces();
}

// Промисифаем mongoose и fs, методы будут с постфиксом Async, например, model.saveAsync().then(..)
Bluebird.promisifyAll(require('mongoose'));
Bluebird.promisifyAll(fs);

mkdirp.sync(storePath + 'incoming');
mkdirp.sync(storePath + 'private');
mkdirp.sync(storePath + 'public/avatars');
mkdirp.sync(storePath + 'public/photos');

async.waterfall([
    function connectMongo(cb) {
        db = mongoose.createConnection() // http://mongoosejs.com/docs/api.html#connection_Connection
            .once('open', openHandler)
            .once('error', errFirstHandler);
        db.open(moongoUri, { httpServer: { poolSize: moongoPool, auto_reconnect: true }, db: { safe: true } });

        function openHandler() {
            var admin = new mongoose.mongo.Admin(db.db);
            admin.buildInfo(function (err, info) {
                logger.info('MongoDB[' + info.version + ', x' + info.bits + '] connected through Mongoose[' + mongoose.version + '] at: ' + moongoUri);
                cb(null);
            });
            db.removeListener('error', errFirstHandler);
            db.on('error', function (err) {
                logger.error('Connection error to MongoDB at: ' + moongoUri);
                logger.error(err && (err.message || err));
            });
            db.on('reconnected', function () {
                logger.info('Reconnected to MongoDB at: ' + moongoUri);
            });
        }

        function errFirstHandler(err) {
            logger.error('Connection error to MongoDB at: ' + moongoUri);
            cb(err);
        }
    },

    function loadingModels(callback) {
        require('./models/ApiLog').makeModel(db);
        require('./models/ActionLog').makeModel(db);
        require('./models/Counter').makeModel(db);
        require('./models/Settings').makeModel(db);
        require('./models/Reason').makeModel(db);
        require('./models/User').makeModel(db);
        require('./models/UserSettings').makeModel(db);
        require('./models/UserStates').makeModel(db);
        require('./models/UserAction').makeModel(db);
        require('./models/Sessions').makeModel(db);
        require('./models/Download').makeModel(db);
        require('./models/Photo').makeModel(db);
        require('./models/Comment').makeModel(db);
        require('./models/Cluster').makeModel(db);
        require('./models/Region').makeModel(db);
        require('./models/News').makeModel(db);
        require('./models/_initValues').makeModel(db);
        callback(null);
    },

    // Настраиваем express
    function (callback) {
        var pub = '/public/',
            ourMiddlewares,
            lessMiddleware,
            statusCodes = http.STATUS_CODES,
            status404Code = 404,
            status404Text = statusCodes[status404Code],
            static404 = function (req, res) {
                logger404.error(JSON.stringify({
                    url: req.url,
                    method: req.method,
                    ua: req.headers && req.headers['usestatic404r-agent'],
                    referer: req.headers && req.headers.referer
                }));
                res.statusCode = status404Code;
                res.end(status404Text); // Вызываем end вместо send, чтобы не было дополнительных действий типа etag
            };

        global.appVar.land = land;
        global.appVar.storePath = storePath;
        global.appVar.mail = mail;
        global.appVar.serverAddr = { protocol, domain, host, port, uport, dport, subdomains };

        Utils = require('./commons/Utils'); // Utils должны реквайрится после установки глобальных переменных, так как они там используются
        ourMiddlewares = require('./controllers/middleware');

        app = express();
        app.disable('x-powered-by'); // Disable default X-Powered-By
        app.set('query parser', 'extended'); // Parse with 'qs' module
        app.set('trust proxy', true); // Если нужно брать ip пользователя через req.ips(), это вернет массив из X-Forwarded-For с переданным количеством ip. https://github.com/visionmedia/express/blob/master/History.md#430--2014-05-21
        app.set('views', 'views');
        app.set('view engine', 'jade');

        // Etag (по умолчанию weak), чтобы браузер мог указывать его для запрашиваемого ресурса
        // При этом если браузеру заголовком Cache-Control разрешено кешировать, он отправит etag в запросе,
        // и если сгенерированный ответ получает такой же etag, сервер вернёт 304 без контента и браузер возьмет контент из своего кеша
        app.set('etag', 'weak');

        // На проде включаем внутреннее кеширование результатов рендеринга шаблонов
        // Сокращает время рендеринга (и соответственно waiting время запроса клиента) на порядок
        if (land === 'dev') {
            app.disable('view cache'); // В дев выключаем только для того, чтобы можно было править шаблон без перезагрузки сервера
        } else {
            app.enable('view cache');
        }

        app.hash = land === 'dev' ? pkg.version : buildJson.appHash;
        logger.info('Application Hash: ' + app.hash);

        app.set('appEnv', {
            land,
            hash: app.hash,
            version: pkg.version,
            storePath,
            serverAddr: global.appVar.serverAddr
        });

        // Устанавливаем объект, свойства которого будут доступны из всех jade-шаблонов как глобальные переменные
        _.assign(app.locals, {
            pretty: false, // Adds whitespace to the resulting html to make it easier for a human to read
            compileDebug: false, // Include the function source in the compiled template for better error messages (sometimes usefu
            debug: false, // If set to true, the tokens and function body is logged to stdoutl in development).

            appLand: land, // Решает какие скрипты вставлять в head
            appHash: app.hash // Вставляется в head страниц
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
            if (land === 'dev') {
                lessMiddleware = require('less-middleware');
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
            // Favicon надо помещать перед статикой, т.к. он прочитается с диска один раз и закешируется.
            // Он бы отдался и на следующем шаге, но тогда будет читаться с диска каждый раз
            app.use(require('serve-favicon')(path.join(__dirname, pub, 'favicon.ico'), { maxAge: ms(land === 'dev' ? '1s' : '2d') }));
            app.use(express.static(path.join(__dirname, pub), { maxAge: ms(land === 'dev' ? '1s' : '2d'), etag: false }));

            // "Законцовываем" пути к статике, т.е. то что дошло сюда - 404
            app.get(/^\/(?:img|js|style)(?:\/.*)$/, static404);
        }
        if (serveStore) {
            app.use('/_a/', express.static(path.join(storePath, 'public/avatars/'), { maxAge: ms('2d'), etag: false }));
            app.use('/_p/', express.static(path.join(storePath, 'public/photos/'), { maxAge: ms('7d'), etag: false }));

            // "Законцовываем" пути к хранилищу, т.е. то что дошло сюда - 404
            app.get('/_a/d/*', function (req, res) {
                res.redirect(302, '/img/caps/avatar.png');
            });
            app.get('/_a/h/*', function (req, res) {
                res.redirect(302, '/img/caps/avatarth.png');
            });
            app.get(/^\/(?:_a|_p)(?:\/.*)$/, static404);
        }

        callback(null);
    },
    function (callback) {
        httpServer = http.createServer(app);
        io = require('socket.io')(httpServer, {
            transports: ['websocket', 'polling'],
            path: '/socket.io',
            serveClient: false
        });

        /**
         * Set zero for unlimited listeners
         * http://nodejs.org/docs/latest/api/events.html#events_emitter_setmaxlisteners_n
         */
        httpServer.setMaxListeners(0);
        io.sockets.setMaxListeners(0);
        process.setMaxListeners(0);

        var _session = require('./controllers/_session.js');
        io.use(_session.handleSocket);
        _session.loadController(app, db, io);
        callback(null);
    },
    function (callback) {
        step(
            function () {
                require('./controllers/settings.js').loadController(app, db, io, this.parallel());
                require('./controllers/region.js').loadController(app, db, io, this.parallel());
            },
            function (err) {
                callback(err);
            }
        );

    },
    function (callback) {
        require('./controllers/actionlog.js').loadController(app, db, io);
        require('./controllers/mail.js').loadController(app);
        require('./controllers/auth.js').loadController(app, db, io);
        require('./controllers/reason.js').loadController(app, db, io);
        require('./controllers/userobjectrel.js').loadController(app, db, io);
        require('./controllers/index.js').loadController(app, db, io);
        require('./controllers/photo.js').loadController(app, db, io);
        require('./controllers/subscr.js').loadController(app, db, io);
        require('./controllers/comment.js').loadController(app, db, io);
        require('./controllers/profile.js').loadController(app, db, io);
        require('./controllers/admin.js').loadController(app, db, io);
        if (land === 'dev') {
            require('./controllers/tpl.js').loadController(app);
        }

        require('./controllers/routes.js').loadController(app);

        //Раздаем лог
        if (serveLog) {
            app.use(
                '/nodelog',
                require('basic-auth-connect')('pastvu', 'pastvupastvu'),
                require('serve-index')(logPath, { icons: true }),
                express.static(logPath, { maxAge: 0, etag: false })
            );
        }

        require('./controllers/errors.js').registerErrorHandling(app);
        require('./controllers/systemjs.js').loadController(app, db);
        require('./basepatch/v1.3.0.4.js').loadController(app, db);

        CoreServer = require('./controllers/coreadapter.js');
        callback(null);
    }
    ],
    function finish(err) {
        if (err) {
            logger.fatal(err && (err.message || err));
            setTimeout(function () {
                process.exit(1); // Запускаем в setTimeout, т.к. в некоторых консолях в противном случае не выводятся предыдущие console.log
            }, 100);
        } else {
            /**
             * Handling uncaught exceptions
             */
            process.on('uncaughtException', function (err) {
                // Add here storage for saving and resuming
                logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
                logger.trace(err && (err.stack || err));
            });

            process.on('exit', function () {
                console.log('--SHUTDOWN--');
            });

            const manualGC = manualGCInterval && global.gc;

            if (manualGC) {
                // Самостоятельно вызываем garbage collector через определеное время
                logger.info('Manual garbage collection every %ss', manualGCInterval / 1000);
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
                        `heapUsed: ${Utils.format.fileSize(memory.heapUsed)}, heapTotal: ${Utils.format.fileSize(memory.heapTotal)}`,
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
                            `heapUsed: ${Utils.format.fileSize(memory.heapUsed)}, heapTotal: ${Utils.format.fileSize(memory.heapTotal)}`,
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
                    logger.info('servePublic: ' + servePublic + ', serveStore ' + serveStore);
                    logger.info('Host for users: [%s]', protocol + '://' + host);
                    logger.info('Core server listening [%s:%s] in %s-mode', coreHostname ? coreHostname : '*', corePort, land.toUpperCase());
                    logger.info('HTTP server listening [%s:%s] in %s-mode %s gzip \n', httpHostname ? httpHostname : '*', httpPort, land.toUpperCase(), gzip ? 'with' : 'without');

                    scheduleMemInfo(startStamp - Date.now());
                });
            });
        }
    }
);