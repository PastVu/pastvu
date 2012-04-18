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
    app.use(express.bodyParser());
	app.use(express.methodOverride());
	
	if (env=='development') {
		app.use('/style', lessMiddleware({src: __dirname + '/public/style', force: true, once: false, compress: false, debug:true}));
		app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
		require('reloader')({
			watchModules: true,
			onStart: function () {console.log('Started on port: 3000');},
			onReload: function () {app.listen(3000);}
		});
	} else {
		app.use('/style', lessMiddleware({src: __dirname + '/public/style', force: false, once: true, compress: true, optimization:2, debug:false}));
		app.use(express.errorHandler());
	}
	
    app.use(app.router);
	app.use(express.static(__dirname + '/public', {maxAge: oneDay, redirect: '/'}));
	
});


app.get('/', function(req, res){
	res.render('index.jade', { pageTitle: 'My Site', youAreUsingJade: true });
});

if (env!='development') app.listen(3000);