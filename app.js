#!/usr/bin/env node
var fs = require( 'fs' ),
	port = 3000,
	express = require('express'),
	connect = require('express/node_modules/connect'),
	gzippo = require('gzippo'),
	mongodb = require('connect-mongodb/node_modules/mongodb'),
	Utils = require('./commons/Utils.js'),
	log4js = require('log4js'),

	mongoStore = require('connect-mongodb'),
	server_config = new mongodb.Server('localhost', 27017, {auto_reconnect: true, native_parser: true}),
	db = new mongodb.Db('oldmos', server_config, {}),
	mongo_store = new mongoStore({db: db, reapInterval: 3000}),

	parseCookie = connect.utils.parseCookie,

	lessMiddleware = require('less-middleware'),
	mongoose = require('mongoose'),
	memcached = require('mc'),
	errS = require('./controllers/errors.js').err,
	app, io,

	second = 1000,
	minute = 60*second,
	hour = 60*minute,
	day = 24*hour,
	week = 7*day,
	month = 30.4368499*day,
	oneYear = 365*day;

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
require('./commons/Utils.js');

/**
 * Окружение (development, test, production)
 */
var env = process.env.NODE_ENV || 'development',
	pub = (env == 'development' ? '/public' : '/public-build');

logger.info('Starting Node('+process.versions.node+') with v8('+process.versions.v8+') and Express('+express.version+') on process pid:'+process.pid);

app = module.exports = express.createServer();
app.version = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8' )).version;
app.hash = (env == 'development' ? app.version : Utils.randomString(10)); logger.info('Application Hash: '+app.hash);

io = require('socket.io').listen(app);

app.configure(function(){

	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.set('view options', {layout: false, pretty: true});
	app.set('db-uri', 'mongodb://localhost:27017/oldmos');
	
	//app.use(express.logger({ immediate: false, format: 'dev' }));
	
	app.use(express.errorHandler({ dumpExceptions: (env=='development'), showStack: (env=='development') }));
	app.use(express.favicon(__dirname + pub + '/favicon.ico', { maxAge: day }));
	if (env=='development') {
		app.use('/style', lessMiddleware({src: __dirname + pub + '/style', force: true, once: false, compress: false, debug:false}));
	} else {
		app.use('/style', lessMiddleware({src: __dirname + pub + '/style', force: false, once: true, compress: true, optimization:2, debug:false}));
	}
	app.use(gzippo.staticGzip(__dirname + pub, {maxAge: day})); //app.use(express.static(__dirname + pub, {maxAge: day}));
	
	app.use('/ava', express.static(__dirname + '/uploads/ava', {maxAge: day}));
	
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({ cookie: {maxAge: 12*hour}, store: mongo_store, secret: 'OldMosSess', key: 'oldmos.sid' }));
	app.use(express.methodOverride());
	
	app.use(gzippo.compress());
    app.use(app.router);
	var Session = connect.middleware.session.Session;
	io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
	io.set('authorization', function (data, accept) {
		if (!data.headers.cookie) return accept('No cookie transmitted.', false);
		data.cookie = parseCookie(data.headers.cookie);
		data.sessionID = data.cookie['oldmos.sid']; 
		
		mongo_store.load(data.sessionID, function (err, session) {
			if (err || !session) return accept('Error: '+err, false);
			if (session.login) console.info("%s entered", session.login);
			data.session = session;
			return accept(null, true);
		});
	});
	
	if (env=='development') {
		io.set('log level', 1);
		require('reloader')({
			watchModules: false,
			onStart: function () {},
			onReload: function () {app.listen(port);}
		});
	} else {
		io.enable('browser client minification');  // send minified client
		io.enable('browser client etag');          // apply etag caching logic based on version number
		io.enable('browser client gzip');          // gzip the file
		io.set('log level', 1);                    // reduce logging
	}
});

// Helpers
app.dynamicHelpers({
  messages: function(req, res){
    var messages = {},
      messageTypes = ['error', 'warning', 'info'];

      messageTypes.forEach(function(type){
        var arrMsgs = req.flash(type);
        if (arrMsgs.length > 0) {
			messages[type] = arrMsgs;
        }
      });

      return messages;
  },

  user: function(req, res){
    var user = req.session.user;
    return user || {};
  }

});

// connecting to db
var ccc = mongoose.connect(app.set('db-uri'));

// connecting to memcached
var mc = new memcached.Client();
mc.connect(function() {
  logger.info("Connected to the localhost memcache on port 11211!");
});

// creating models
require(__dirname+'/models/Settings.js');
require(__dirname+'/models/Role.js');
require(__dirname+'/models/User.js');


// loading controllers
require('./controllers/_session.js').loadController(app, io, mongo_store, mc);
require('./controllers/errors.js').loadController(app);
require('./controllers/mail.js').loadController(app);
require('./controllers/auth.js').loadController(app, io, mongo_store);
require('./controllers/index.js').loadController(app, io);
require('./controllers/photo.js').loadController(app, io);
require('./controllers/profile.js').loadController(app, io);
require('./controllers/admin.js').loadController(app, io);
app.get('*', function(req, res){errS.e404Virgin(req, res)});

/**
 * Handling uncaught exceptions
 */
process.on('uncaughtException', function (err) {
  // Add here storage for saving and resuming
  logger.fatal("PROCESS uncaughtException: " + err.message);
  logger.fatal(err.stack);
});

if (env!='development') {app.listen(port);}

logger.info('Express server listening on port %d, environment: %s \n', port, app.settings.env)