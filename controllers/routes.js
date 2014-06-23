'use strict';

var _ = require('lodash'),
	Utils = require('../commons/Utils.js'),
	checkBrowser = (function () {
		var checkUserAgent = Utils.checkUserAgent({
			'IE': '>=9.0.0',
			'Firefox': '>=6.0.0', //6-я версия - это G+
			'Opera': '>=12.10.0',
			'Chrome': '>=11.0.0', //11 версия - это Android 4 default browser в desktop-режиме
			'Android': '>=4.0.0',
			'Safari': '>=5.1.0',
			'Mobile Safari': '>=5.1.0'
		});

		return function (req, res, next) {
			var browser = checkUserAgent(req.headers['user-agent']);
			//console.log(browser.agent);
			if (!browser.accept) {
				res.statusCode = 200;
				res.render('status/badbrowser', {agent: browser.agent, title: 'Вы используете устаревшую версию браузера'});
			} else {
				req.browser = browser;
				next();
			}
		};
	}());

module.exports.loadController = function (app) {

	//Проверка браузера при обращении ко всем путям
	app.get('*', checkBrowser);

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

	app.get('/badbrowser', function (req, res) {
		res.statusCode = 200;
		res.render('status/badbrowser', {agent: req.browser && req.browser.agent, title: 'Вы используете устаревшую версию браузера'});
	});
	app.get('/nojs', function (req, res) {
		res.statusCode = 200;
		res.render('status/nojs', {agent: req.browser && req.browser.agent, title: 'Выключен JavaScript'});
	});

	//ping-pong для проверки работы сервера
	app.all('/ping', function (req, res) {
		res.send(200, 'pong');
	});
};