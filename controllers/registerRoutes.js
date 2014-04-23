'use strict';

var _ = require('lodash'),
	Utils = require('../commons/Utils.js'),
	apiController = require('./api.js'),
	XPoweredBy = 'Paul Klimashkin | klimashkin@gmail.com';

module.exports.loadController = function (app) {

	app.all('*', function (req, res, next) {
		//Устанавливаем кастомный X-Powered-By
		res.setHeader('X-Powered-By', XPoweredBy);
		next();
	});

	// More complicated example: '/p/:cid?/*
	['/', '/p/*', '/u*', '/photoUpload', '/news*', '/confirm/:key'].forEach(function (route) {
		app.get(route, appMainHandler);
	});
	function appMainHandler(req, res) {
		res.status(200).render('app.jade', {appName: 'Main'});
	}

	['/admin*'].forEach(function (route) {
		app.get(route, appAdminHandler);
	});
	function appAdminHandler(req, res) {
		res.status(200).render('app.jade', {appName: 'Admin'});
	}

	//ping-pong для проверки работы сервера
	app.all('/ping', function (req, res) {
		res.send(200, 'pong');
	});


	var apiPaths = {
		'0.1.0': [
			{path: /^\/0\.1\.0\/?$/, handler: apiController.apiRouter}
		]
	};
	_.forEach(apiPaths, function (paths, version) {
		_.forEach(paths, function (item) {
			app.all(item.path, item.handler);
		});
	});
};