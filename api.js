#!/usr/bin/env node
'use strict';

var express = require('express'),
	http = require('http'),
	async = require('async'),
	path = require('path'),
	fs = require('fs'),
	os = require('os'),
	log4js = require('log4js'),
	argv = require('optimist').argv,
	_ = require('lodash'),

	mkdirp = require('mkdirp'),
	mongoose = require('mongoose'),
	ms = require('ms'), // Tiny milisecond conversion utility
	Utils,
	CoreClient = require('./controllers/coreclient'),

	app, db,
	core, server;

global.appVar = {}; //Глоблальный объект для хранения глобальных переменных приложения
global.appVar.maxRegionLevel = 6; //6 уровней регионов: 0..5

/**
 * Включаем "наши" расширения js
 */
require('./commons/JExtensions.js');

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


var confDefault = JSON.parse(JSON.minify(fs.readFileSync(__dirname + '/config.json', 'utf8'))),
	confConsole = _.pick(argv, Object.keys(confDefault)),
	conf = _.defaults(confConsole, argv.conf ? JSON.parse(JSON.minify(fs.readFileSync(argv.conf, 'utf8'))) : {}, confDefault),

	land = conf.land, //Окружение (dev, test, prod)
	http_port = conf.api_port, //Порт прослушки сервера
	http_hostname = conf.api_hostname, //Слушать хост

	core_hostname = conf.core_hostname, //Хост Core
	core_port = conf.core_port, //Порт Core

	moongoUri = argv.mongo_api || conf.mongo_api.con,
	moongoPool = argv.mongopool_api || conf.mongo_api.pool,

	gzip = conf.gzip, //Использовать gzip

	logPath = path.normalize(conf.logPath || (__dirname + "/logs")), //Путь к папке логов
	manualGarbageCollect = conf.manualGarbageCollect; //Интервал самостоятельного вызова gc. 0 - выключено


/**
 * Вызов логера
 */
console.log('\n');
mkdirp.sync(logPath);
log4js.configure('./log4js.json', {cwd: logPath});
var logger = log4js.getLogger("api.js");

logger.info('~~~ API');
logger.info('Starting Node[' + process.versions.node + '] with v8[' + process.versions.v8 + '] on process pid:' + process.pid);
logger.info('Platform: ' + process.platform + ', architecture: ' + process.arch + ' with ' + os.cpus().length + ' cpu cores');

async.waterfall([
		function connectMongo(cb) {
			db = mongoose.createConnection() // http://mongoosejs.com/docs/api.html#connection_Connection
				.once('open', openHandler)
				.once('error', errFirstHandler);
			db.open(moongoUri, {server: {poolSize: moongoPool, auto_reconnect: true}, db: {safe: true}});

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
			callback(null);
		},

		//Настраиваем express
		function (callback) {
			var ourMiddlewares = require('./controllers/middleware.js');

			global.appVar.land = land;

			app = express();
			app.enable('trust proxy'); //Используем хедеры прокси, если стоим за ним
			app.disable('x-powered-by'); //Disable default X-Powered-By
			app.disable('etag');

			app.use(ourMiddlewares.responseHeaderHook());
			if (gzip) {
				app.use(require('compression')());
			}

			callback(null);
		},

		function (callback) {
			core = new CoreClient();
			server = http.createServer(app);
			callback(null);
		},
		function loadingControllers(callback) {
			require('./controllers/api.js').loadController(app, db, core);
			require('./controllers/apilog.js').loadController(app, db);
			require('./controllers/errors.js').registerErrorHandling(app);
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
			server.setMaxListeners(0);
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

					logger.info('rss: %s, heapUsed: %s, heapTotal: %s. -> Start GC', Utils.format.fileSize(memUsage.rss), Utils.format.fileSize(memUsage.heapUsed), Utils.format.fileSize(memUsage.heapTotal));

					global.gc(); //Вызываем gc

					memUsage = process.memoryUsage();
					logger.info('rss: %s, heapUsed: %s, heapTotal: %s. Garbage collected in %ss', Utils.format.fileSize(memUsage.rss), Utils.format.fileSize(memUsage.heapUsed), Utils.format.fileSize(memUsage.heapTotal), (Date.now() - start) / 1000);
					setTimeout(collectGarbage, manualGarbageCollect);
				}, manualGarbageCollect);
			}

			core.connect(core_port, core_hostname, function () {
				server.listen(http_port, http_hostname, function () {
					logger.info('gzip: ' + gzip);
					logger.info('API connected to Core %s:%s', core_hostname, core_port);
					logger.info('API server listening [%s:%s] in %s-mode \n', http_hostname ? http_hostname : '*', http_port, land.toUpperCase());
				});
			});
		}
	}
);