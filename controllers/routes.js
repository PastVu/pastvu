'use strict';

var _ = require('lodash'),
	Utils = require('../commons/Utils.js'),
	apiController = require('./api.js');

module.exports.loadController = function (app) {

	[
		'/', //Корень
		/^\/(?:photoUpload)\/?$/, // Пути строгие (/example без или с завершающим слешом)
		/^\/(?:ps|u|news)(?:\/.*)?$/, // Пути с возможным продолжением (/example/*)
		/^\/(?:p|confirm)\/.+$/ // Пути обязательным продолжением (/example/*)
	]
		.forEach(function (route) {
			app.route(route).get(appMainHandler);
		});
	function appMainHandler(req, res) {
		res.setHeader('Cache-Control', 'no-cache');
		res.statusCode = 200;
		res.render('app', {appName: 'Main'});
	}

	[/^\/(?:admin)(?:\/.*)?$/].forEach(function (route) {
		app.get(route, appAdminHandler);
	});
	function appAdminHandler(req, res) {
		res.setHeader('Cache-Control', 'no-cache');
		res.statusCode = 200;
		res.render('app', {appName: 'Admin'});
	}

	//ping-pong для проверки работы сервера
	app.all('/ping', function (req, res) {
		res.send(200, 'pong');
	});


	var apiPaths = {
		'0.2.0': [
			{path: /^\/0\.2\.0\/?$/, handler: apiController.apiRouter}
		]
	};
	_.forEach(apiPaths, function (paths, version) {
		_.forEach(paths, function (item) {
			app.all(item.path, item.handler);
		});
	});
};