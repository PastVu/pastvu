#!/usr/bin/env node
'use strict';

// Подключаем require-hook babel
require('babel/register')({
    only: /photoConverter\.js/,
    stage: 0
    //whitelist: [],
    //blacklist: []
});

// Включаем "наши" расширения js
require('./commons/JExtensions.js');

var express = require('express'),
    async = require('async'),
    posix = require('posix'),
    http = require('http'),
    path = require('path'),
    fs = require('fs'),
    os = require('os'),
    step = require('step'),
    log4js = require('log4js'),
    argv = require('optimist').argv,
    moment = require('moment'),
    _ = require('lodash'),
    Bluebird = require('bluebird'),

    mkdirp = require('mkdirp'),
    mongoose = require('mongoose'),
    ms = require('ms'), // Tiny milisecond conversion utility
    Utils,

    constants = require('./controllers/constants.js'),
    app, io, db,
    startStamp,
    CoreServer,
    coreServer,
    httpServer;

global.appVar = {}; //Глоблальный объект для хранения глобальных переменных приложения
global.appVar.maxRegionLevel = constants.region.maxLevel;


var nofileLimits = posix.getrlimit('nofile');
var interfaces = os.networkInterfaces();
var addresses = [];
for (var k in interfaces) {
    if (interfaces.hasOwnProperty(k)) {
        for (var k2 in interfaces[k]) {
            if (interfaces[k].hasOwnProperty(k2)) {
                var address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    addresses.push(address.address);
                }
            }
        }
    }
}

var pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8')),
    confDefault = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/config.json', 'utf8'))),
    confConsole = _.pick(argv, Object.keys(confDefault)),
    conf = _.defaults(confConsole, argv.conf ? JSON.parse(JSON.minify(fs.readFileSync(argv.conf, 'utf8'))) : {}, confDefault),

    land = conf.land, //Окружение (dev, test, prod)
    http_port = conf.port, //Порт прослушки сервера
    http_hostname = conf.hostname, //Хост прослушки сервера

    core_hostname = conf.core_hostname, //Хост Core
    core_port = conf.core_port, //Порт Core

    protocol = conf.protocol, //Протокол сервера для клинетов
    domain = conf.domain || addresses[0], //Адрес сервера для клинетов
    port = conf.projectport, //Порт сервера для клиента
    uport = conf.projectuport, //Порт сервера загрузки фотографий для клиента
    host = domain + port, //Имя хоста (адрес+порт)

    subdomains = (argv.subdomains || conf.subdomains).split('_').filter(function (item) {
        return typeof item === 'string' && item.length > 0;
    }), //Поддомены для раздачи статики из store
    moongoUri = argv.mongo || conf.mongo.con,
    moongoPool = argv.mongopool || conf.mongo.pool,
    mail = conf.mail || {},

    buildJson = land === 'dev' ? {} : JSON.parse(fs.readFileSync(__dirname + '/build.json', 'utf8')),
    storePath = path.normalize(conf.storePath || (__dirname + "/../store/")), //Путь к папке хранилища
    servePublic = conf.servePublic, //Флаг, что node должен раздавать статику скриптов
    serveStore = conf.serveStore, //Флаг, что node должен раздавать статику хранилища
    serveLog = conf.serveLog, //Флаг, что node должен раздавать лог
    gzip = conf.gzip, //Использовать gzip

    logPath = path.normalize(conf.logPath || (__dirname + "/logs")), // Путь к папке логов
    logUptimeInterval = conf.logUptimeInterval, // Интервал логирования времени работы сервера
    manualGarbageCollect = conf.manualGarbageCollect; // Интервал самостоятельного вызова gc. 0 - выключено

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
var logger = log4js.getLogger('app.js'),
    logger404 = log4js.getLogger("404.js");

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

mkdirp.sync(storePath + "incoming");
mkdirp.sync(storePath + "private");
mkdirp.sync(storePath + "public/avatars");
mkdirp.sync(storePath + "public/photos");

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
                    logger.error("Connection error to MongoDB at: " + moongoUri);
                    logger.error(err && (err.message || err));
                });
                db.on('reconnected', function () {
                    logger.info("Reconnected to MongoDB at: " + moongoUri);
                });
            }

            function errFirstHandler(err) {
                logger.error("Connection error to MongoDB at: " + moongoUri);
                cb(err);
            }
        },

        function loadingModels(callback) {
            require(__dirname + '/models/ApiLog.js').makeModel(db);
            require(__dirname + '/models/ActionLog.js').makeModel(db);
            require(__dirname + '/models/Counter.js').makeModel(db);
            require(__dirname + '/models/Settings.js').makeModel(db);
            require(__dirname + '/models/Reason.js').makeModel(db);
            require(__dirname + '/models/User.js').makeModel(db);
            require(__dirname + '/models/UserSettings.js').makeModel(db);
            require(__dirname + '/models/UserStates.js').makeModel(db);
            require(__dirname + '/models/UserAction.js').makeModel(db);
            require(__dirname + '/models/Sessions.js').makeModel(db);
            require(__dirname + '/models/Photo.js').makeModel(db);
            require(__dirname + '/models/Comment.js').makeModel(db);
            require(__dirname + '/models/Cluster.js').makeModel(db);
            require(__dirname + '/models/Region.js').makeModel(db);
            require(__dirname + '/models/News.js').makeModel(db);
            require(__dirname + '/models/_initValues.js').makeModel(db);
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
                        ua: req.headers && req.headers['user-agent'],
                        referer: req.headers && req.headers.referer
                    }));
                    res.statusCode = status404Code;
                    res.end(status404Text); // Вызываем end вместо send, чтобы не было дополнительных действий типа etag
                };

            global.appVar.land = land;
            global.appVar.storePath = storePath;
            global.appVar.mail = mail;
            global.appVar.serverAddr = { protocol: protocol, domain: domain, host: host, port: port, uport: uport, subdomains: subdomains };

            Utils = require('./commons/Utils.js'); // Utils должны реквайрится после установки глобальных переменных, так как они там используются
            ourMiddlewares = require('./controllers/middleware.js');

            app = express();
            app.disable('x-powered-by'); // Disable default X-Powered-By
            app.set('query parser', 'extended'); // Parse with "qs" module
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
                land: land,
                hash: app.hash,
                version: pkg.version,
                storePath: storePath,
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

                //"Законцовываем" пути к статике, т.е. то что дошло сюда - 404
                app.get(/^\/(?:img|js|style)(?:\/.*)$/, static404);
            }
            if (serveStore) {
                app.use('/_a/', express.static(path.join(storePath, 'public/avatars/'), { maxAge: ms('2d'), etag: false }));
                app.use('/_p/', express.static(path.join(storePath, 'public/photos/'), { maxAge: ms('7d'), etag: false }));

                //"Законцовываем" пути к хранилищу, т.е. то что дошло сюда - 404
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
            require('./basepatch/v1.3.0.2.js').loadController(app, db);

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
             * Set zero for unlimited listeners
             * http://nodejs.org/docs/latest/api/events.html#events_emitter_setmaxlisteners_n
             */
            httpServer.setMaxListeners(0);
            process.setMaxListeners(0);
            /**
             * Handling uncaught exceptions
             */
            process.on('uncaughtException', function (err) {
                // Add here storage for saving and resuming
                logger.fatal("PROCESS uncaughtException: " + (err && (err.message || err)));
                logger.trace(err && (err.stack || err));
            });

            process.on('exit', function () {
                console.log("--SHUTDOWN--");
            });

            if (manualGarbageCollect && global.gc) {
                //Самостоятельно вызываем garbage collector через определеное время
                logger.info('Using manual garbage collection every %ss', manualGarbageCollect / 1000);
                setTimeout(function collectGarbage() {
                    var start = Date.now(),
                        memUsage = process.memoryUsage();

                    logger.info('rss: %s, heapUsed: %s, heapTotal: %s. -> Starting GC', Utils.format.fileSize(memUsage.rss), Utils.format.fileSize(memUsage.heapUsed), Utils.format.fileSize(memUsage.heapTotal));

                    global.gc(); //Вызываем gc

                    memUsage = process.memoryUsage();
                    logger.info('rss: %s, heapUsed: %s, heapTotal: %s. Garbage collected in %ss', Utils.format.fileSize(memUsage.rss), Utils.format.fileSize(memUsage.heapUsed), Utils.format.fileSize(memUsage.heapTotal), (Date.now() - start) / 1000);
                    setTimeout(collectGarbage, manualGarbageCollect);
                }, manualGarbageCollect);
            }


            coreServer = new CoreServer(core_port, core_hostname, function () {
                httpServer.listen(http_port, http_hostname, function () {
                    logger.info('servePublic: ' + servePublic + ', serveStore ' + serveStore);
                    logger.info('Host for users: [%s]', protocol + '://' + host);
                    logger.info('Core server listening [%s:%s] in %s-mode', core_hostname ? core_hostname : '*', core_port, land.toUpperCase());
                    logger.info('HTTP server listening [%s:%s] in %s-mode %s gzip \n', http_hostname ? http_hostname : '*', http_port, land.toUpperCase(), gzip ? 'with' : 'without');

                    startStamp = Date.now();
                    setTimeout(function func() {
                        var mom = moment(Date.now() - startStamp).zone('0');

                        logger.info('uptime %d.%s', mom.dayOfYear() - 1, mom.format('HH:mm:ss'));

                        setTimeout(func, logUptimeInterval);
                    }, logUptimeInterval + 100);
                });
            });
        }
    }
);