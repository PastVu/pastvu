'use strict';

var _ = require('lodash'),
	Utils = require('../commons/Utils.js'),
	apiController = require('./api.js'),
	XPoweredBy = 'Paul Klimashkin | klimashkin@gmail.com';

module.exports.loadController = function (app) {

	[
		'/', //Корень
		/^\/(?:ps|photoUpload|confirm)\/?$/, // Пути строгие (/example без или с завершающим слешом)
		/^\/(?:p|u|news)(?:\/.*)?$/ // Пути с возможным продолжением (/example/*)
	]
		.forEach(function (route) {
			app.route(route).get(appMainHandler);
		});
	function appMainHandler(req, res) {
		res.set({'Cache-Control': 'no-cache'}).status(200).render('app', {appName: 'Main'});
	}

	[/^\/(?:admin)(?:\/.*)?$/].forEach(function (route) {
		app.get(route, appAdminHandler);
	});
	function appAdminHandler(req, res) {
		res.set({'Cache-Control': 'no-cache'}).status(200).render('app', {appName: 'Admin'});
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