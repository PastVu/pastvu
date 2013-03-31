#!/usr/bin/env node
var express = require('express'),
	http = require('http'),
	app, server, io,

	Session,

	fs = require('fs'),
	os = require('os'),
	connect = require('express/node_modules/connect'),
	cookie = require('express/node_modules/cookie'),
	Utils = require('./commons/Utils.js'),
	File = require("file-utils").File,
	log4js = require('log4js'),
	argv = require('optimist').argv,

	lessMiddleware = require('less-middleware'),
	mongoose = require('mongoose'),
	mc = require('mc'), // memcashed
	ms = require('ms'), // Tiny milisecond conversion utility
	errS = require('./controllers/errors.js').err;

/**
 * log the cheese logger messages to a file, and the console ones as well.
 */
console.log('\n');
log4js.configure('./log4js.json', {cwd: './logs'});
var logger = log4js.getLogger("app.js");

/**
 * Включаем "наши" модули
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

/**
 * Окружение (dev, test, prod)
 */
var land = argv.land || 'dev',
	domain = argv.domain || addresses[0] || 'localhost',
	port = argv.port || 3000,
	uport = argv.uport || 8888,
	pub = (land === 'prod' ? '/public-build' : '/public');

logger.info('Starting Node(' + process.versions.node + ') with v8(' + process.versions.v8 + '), Express(' + express.version + ') and Mongoose(' + mongoose.version + ') on process pid:' + process.pid);

app = express();
server = http.createServer(app);

app.version = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8')).version;
app.hash = (land === 'dev' ? app.version : Utils.randomString(10));
logger.info('Application Hash: ' + app.hash);

io = require('socket.io').listen(server);

new File("publicContent/avatars").createDirectory();
new File("publicContent/photos/micros").createDirectory();
new File("publicContent/photos/micro").createDirectory();
new File("publicContent/photos/mini").createDirectory();
new File("publicContent/photos/midi").createDirectory();
new File("publicContent/photos/thumb").createDirectory();
new File("publicContent/photos/standard").createDirectory();
new File("publicContent/photos/origin").createDirectory();
new File("publicContent/incoming").createDirectory();

app.configure(function () {
	app.set('appEnv', {land: land, domain: domain, port: port, uport: uport});

	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	if (land === 'dev') {
		app.disable('view cache');
	} else {
		app.enable('view cache');
	}
	app.set('db-uri', 'mongodb://localhost:27017/oldmos');

	app.locals({
		pretty: false,
		appHash: app.hash,
		appVersion: app.version
	});

	//app.use(express.logger({ immediate: false, format: 'dev' }));
	app.disable('x-powered-by'); // Disable default X-Powered-By
	app.use(express.errorHandler({ dumpExceptions: (land !== 'prod'), showStack: (land !== 'prod') }));
	app.use(express.compress());
	app.use(express.favicon(__dirname + pub + '/favicon.ico', { maxAge: ms('1d') }));
	if (land === 'dev') {
		app.use('/style', lessMiddleware({src: __dirname + pub + '/style', force: true, once: false, compress: false, debug: false}));
	} else {
		app.use('/style', lessMiddleware({src: __dirname + pub + '/style', force: false, once: true, compress: true, yuicompress: true, optimization: 2, debug: false}));
	}
	app.use(express.static(__dirname + pub, {maxAge: ms('1d')}));

	app.use('/_avatar', express.static(__dirname + '/publicContent/avatars', {maxAge: ms('1d')}));
	app.use('/_p', express.static(__dirname + '/publicContent/photos', {maxAge: ms('7d')}));

	app.use(express.bodyParser());
	app.use(express.cookieParser());
	//app.use(express.session({ cookie: {maxAge: ms('12h')}, store: mongo_store, secret: 'OldMosSess', key: 'oldmos.exp' }));
	app.use(express.session({ cookie: {maxAge: ms('12h')}, secret: 'OldMosSess', key: 'oldmos.exp' }));
	app.use(express.methodOverride());
	app.use(app.router);

	// Set custom X-Powered-By for non-static
	app.get('*', function (req, res, next) {
		res.setHeader('X-Powered-By', 'Paul Klimashkin | klimashkin@gmail.com');
		next();
	});

	io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
	io.set('authorization', function (handshakeData, callback) {

		if (!handshakeData.headers.cookie) {
		}

		handshakeData.cookie = cookie.parse(handshakeData.headers.cookie);
		handshakeData.sessionID = handshakeData.cookie['oldmos.sid'] || 'idcap';

		Session.findOne({key: handshakeData.sessionID}).populate('user').exec(function (err, session) {
			if (err) {
				return callback('Error: ' + err, false);
			}
			if (!session) {
				session = new Session({});
			}
			session.key = Utils.randomString(50); // При каждом заходе регенирируем ключ
			session.stamp = new Date(); // При каждом заходе продлеваем действие ключа
			session.save();
			if (session.user) {
				console.info("%s entered", session.user.login);
			}

			handshakeData.session = session;

			return callback(null, true);
		});
	});

	if (land === 'dev') {
		io.set('log level', 1);
	} else {
		io.set('browser client', false);
		io.enable('browser client minification');  // send minified client
		io.enable('browser client etag');          // apply etag caching logic based on version number
		io.enable('browser client gzip');          // gzip the file
		io.set('log level', 1);                    // reduce logging
	}
});

// connecting to db with mongoose
var db = mongoose.createConnection(app.set('db-uri'), {db: {safe: true}})
	.once('open', function () {
		logger.info("Connected to mongo: " + app.set('db-uri'));
	})
	.on('error', function () {
		logger.fatal("Connection error to mongo: " + app.set('db-uri'));
	});

// connecting to memcached
var memcached = new mc.Client();
memcached.connect(function () {
	logger.info("Connected to the localhost memcache on port 11211");
});

mongoose.Model.saveUpsert = function (findQuery, properties, cb) {
	this.findOne(findQuery, function (err, doc) {
		if (err && cb) {
			cb(err);
		}
		if (!doc) {
			doc = new this(findQuery);
		}
		for (var p in properties) {
			if (properties.hasOwnProperty(p)) {
				doc[p] = properties[p];
			}
		}
		doc.save(!cb ? undefined : function (err, doc) {
			if (err) {
				cb(err);
				return;
			}
			cb(null, doc);
		});
	}.bind(this));
};
// creating models
require(__dirname + '/models/Sessions.js').makeModel(db);
require(__dirname + '/models/Counter.js').makeModel(db);
require(__dirname + '/models/Settings.js').makeModel(db);
require(__dirname + '/models/Role.js').makeModel(db);
require(__dirname + '/models/User.js').makeModel(db);
require(__dirname + '/models/Photo.js').makeModel(db);
require(__dirname + '/models/Comment.js').makeModel(db);
require(__dirname + '/models/Cluster.js').makeModel(db);
require(__dirname + '/models/_initValues.js').makeModel(db);
Session = db.model('Session');

// loading controllers
require('./controllers/_session.js').loadController(app, db, io);
require('./controllers/systemjs.js').loadController(app, db);
require('./controllers/mail.js').loadController(app);
require('./controllers/auth.js').loadController(app, db, io);
require('./controllers/index.js').loadController(app, db, io);
require('./controllers/photo.js').loadController(app, db, io);
require('./controllers/comment.js').loadController(app, db, io);
require('./controllers/profile.js').loadController(app, db, io);
require('./controllers/admin.js').loadController(app, db, io);
require('./controllers/tpl.js').loadController(app);
require('./controllers/errors.js').loadController(app);
app.get('*', function (req, res) {
	errS.e404Virgin(req, res);
});

/**
 * Handling uncaught exceptions
 */
process.on('uncaughtException', function (err) {
	// Add here storage for saving and resuming
	logger.fatal("PROCESS uncaughtException: " + err.message);
	logger.fatal(err.stack);
});

server.listen(port);

logger.info('Express server listening %s in %s-mode \n', (domain + ':' + port), land.toUpperCase());