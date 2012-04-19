#!/usr/bin/env node

var express = require('express'),
	lessMiddleware = require('less-middleware'),
	mongoose = require('mongoose'),
    mongoStore = require('connect-mongodb'),
	second = 1000,
	minute = 60*second,
	oneDay = 86400000,
	oneYear = 31557600000,
	app;
	
/**
 * Выполняем "наши" модули
 */
require('./commons/JExtensions.js');
require('./commons/Utils.js');
	
var app = module.exports = express.createServer();

/**
 * Окружение (development, test, production)
 */
var env = process.env.NODE_ENV || 'development';
	
app.configure(function(){
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.set('view options', {layout: false, pretty: true});
	app.set('db-uri', 'mongodb://kub1110OM:27017/oldmos');
	
	
	app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: oneDay }));
    app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({ cookie: {maxAge: 30*minute}, store: mongoStore(app.set('db-uri')), secret: 'OldMosSess' }));
	app.use(express.methodOverride());
	
	if (env=='development') {
		app.use('/style', lessMiddleware({src: __dirname + '/public/style', force: true, once: false, compress: false, debug:true}));
		app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
		require('reloader')({
			watchModules: false,
			onStart: function () {},
			onReload: function () {app.listen(3000);}
		});
	} else { 
		app.use('/style', lessMiddleware({src: __dirname + '/public/style', force: false, once: true, compress: true, optimization:2, debug:false}));
		app.use(express.errorHandler());
	}
	
    app.use(app.router);
	app.use(express.static(__dirname + '/public', {maxAge: oneDay, redirect: '/'}));
	
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
  },

});

app.get('/', function(req, res){
	res.render('index.jade', { pageTitle: 'My Site', youAreUsingJade: true });
});

// connecting to db
mongoose.connect(app.set('db-uri'));

// creating models
require(__dirname+'/models/User.js');


// loading controllers
require('./controllers/auth.js').loadController(app);

if (env!='development') app.listen(3000);
console.log('Express server listening on port %d, environment: %s', app.address().port, app.settings.env)
console.log('Using Express %s', express.version);