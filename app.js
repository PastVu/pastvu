#!/usr/bin/env node
var fs = require( 'fs' );

var express = require('express'),
	connect = require('express/node_modules/connect'),
	mongodb = require('connect-mongodb/node_modules/mongodb'),
	
	mongoStore = require('connect-mongodb'),
	server_config = new mongodb.Server('localhost', 27017, {auto_reconnect: true, native_parser: true}),
	db = new mongodb.Db('oldmos', server_config, {}),
	mongo_store = new mongoStore({db: db, reapInterval: 3000}),
	 
	parseCookie = connect.utils.parseCookie,
	
	lessMiddleware = require('less-middleware'),
	mongoose = require('mongoose'),
	
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
 * Выполняем "наши" модули
 */
require('./commons/JExtensions.js');
require('./commons/Utils.js');
	
app = module.exports = express.createServer();
io = require('socket.io').listen(app);

app.version = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8' )).version;
/**
 * Окружение (development, test, production)
 */
var env = process.env.NODE_ENV || 'development';
	
app.configure(function(){
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.set('view options', {layout: false, pretty: true});
	app.set('db-uri', 'mongodb://localhost:27017/oldmos');
	
	app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: day }));
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({ cookie: {maxAge: 12*hour}, store: mongo_store, secret: 'OldMosSess', key: 'oldmos.sid' }));
	app.use(express.methodOverride());
	
	io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
	io.set('authorization', function (data, accept) {
		if (!data.headers.cookie) return accept('No cookie transmitted.', false);
		data.cookie = parseCookie(data.headers.cookie);
		data.sessionID = data.cookie['oldmos.sid'];
		
		mongo_store.load(data.sessionID, function (err, session) {
			if (err || !session) return accept('Error: '+err, false);
			data.session = session;
			return accept(null, true);

		});
	});
	
	if (env=='development') {
		app.use('/style', lessMiddleware({src: __dirname + '/public/style', force: true, once: false, compress: false, debug:true}));
		app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
		io.set('log level', 2);
		require('reloader')({
			watchModules: false,
			onStart: function () {},
			onReload: function () {app.listen(3000);}
		});
	} else { 
		app.use('/style', lessMiddleware({src: __dirname + '/public/style', force: false, once: true, compress: true, optimization:2, debug:false}));
		app.use(express.errorHandler());
		
		io.enable('browser client minification');  // send minified client
		io.enable('browser client etag');          // apply etag caching logic based on version number
		io.enable('browser client gzip');          // gzip the file
		io.set('log level', 1);                    // reduce logging
	}
	app.use(express.static(__dirname + '/public', {maxAge: day, redirect: '/'}));
    app.use(app.router);
	
	
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

// creating models
require(__dirname+'/models/Settings.js');
require(__dirname+'/models/Role.js');
require(__dirname+'/models/User.js');


// loading controllers
require('./controllers/errors.js').loadController(app);
require('./controllers/mail.js').loadController(app);
require('./controllers/auth.js').loadController(app, io, mongo_store);
require('./controllers/index.js').loadController(app, io);
require('./controllers/photo.js').loadController(app, io);
app.get('*', function(req, res){errS.e404Virgin(req, res)});

if (env!='development') {app.listen(3000);}

console.log('Express server listening on port %d, environment: %s', app.address().port, app.settings.env)
console.log('Using Express %s', express.version);