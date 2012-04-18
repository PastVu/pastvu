#!/usr/bin/env node

var express = require('express'),
	lessMiddleware = require('less-middleware'),
    app = express.createServer(),
	oneDay = 86400000,
	oneYear = 31557600000;

/**
 * Окружение (development, test, production)
 */
var env = process.env.NODE_ENV || 'development';
	
app.configure(function(){
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.set('view options', {layout: false});
    app.use(express.methodOverride());
    app.use(express.bodyParser());
	
	if (env=='development') {
		app.use('/style', lessMiddleware({src: __dirname + '/style', force: true, once: false, compress: false, debug:true}));
		app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
		require('reloader')({
			watchModules: true,
			onStart: function () {console.log('Started on port: 3000');},
			onReload: function () {app.listen(3000);}
		});
	} else {
		app.use('/style', lessMiddleware({src: __dirname + '/style', force: false, once: true, compress: true, optimization:2, debug:false}));
		app.use(express.errorHandler());
	}
	
    app.use(app.router);
	app.use('/js', express.static(__dirname + '/js', {maxAge: oneDay, redirect: '/'}));
	app.use('/style', express.static(__dirname + '/style'));
	
});


app.get('/', function(req, res){
	res.render('index.jade', { pageTitle: 'My Site', youAreUsingJade: true });
});

if (env!='development') app.listen(3000);