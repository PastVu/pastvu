'use strict';

var _ = require('lodash'),
	Utils = require('../commons/Utils.js'),
	settings = require('./settings.js'),
	_session = require('./_session.js');

module.exports.loadController = function (app) {
	var genInitDataString = (function () {
		var clientParamsJSON = JSON.stringify(settings.getClientParams());
		console.log(clientParamsJSON);
		return function (usObj) {
			var resultString = 'var init={settings:' + clientParamsJSON + ', user:' + JSON.stringify(_session.getPlainUser(usObj.user));

			if (usObj.registered) {
				resultString += ',registered:true';
			}

			resultString += '};';

			return resultString;
		};
	}());

	//Создание сессии и проверка браузера при обращении ко всем путям
	app.get('*', _session.handleRequest);

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
		res.render('app', {appName: 'Main', initData: genInitDataString(req.handshake.usObj)});
	}

	[/^\/(?:admin)(?:\/.*)?$/].forEach(function (route) {
		app.get(route, appAdminHandler);
	});
	function appAdminHandler(req, res) {
		res.setHeader('Cache-Control', 'no-cache');
		res.statusCode = 200;
		res.render('app', {appName: 'Admin'});
	}

	//Устаревший браузер
	app.get('/badbrowser', function (req, res) {
		res.statusCode = 200;
		res.render('status/badbrowser', {agent: req.browser && req.browser.agent, title: 'Вы используете устаревшую версию браузера'});
	});
	//Отключенный javascript
	app.get('/nojs', function (req, res) {
		res.statusCode = 200;
		res.render('status/nojs', {agent: req.browser && req.browser.agent, title: 'Выключен JavaScript'});
	});
	//Мой user-agent
	app.get('/myua', function (req, res) {
		res.setHeader('Cache-Control', 'no-cache,no-store,max-age=0,must-revalidate');
		res.statusCode = 200;
		res.render('status/myua', {
			agent: req.browser && req.browser.agent,
			accept: req.browser && req.browser.accept,
			title: req.browser && req.browser.agent && req.browser.agent.source
		});
	});

	//ping-pong для проверки работы сервера
	app.all('/ping', function (req, res) {
		res.send(200, 'pong');
	});


};