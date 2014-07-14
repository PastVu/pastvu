'use strict';

var _ = require('lodash'),
	Utils = require('../commons/Utils.js'),
	settings = require('./settings.js'),
	_session = require('./_session.js');

module.exports.loadController = function (app) {
	var genInitDataString = (function () {
			var clientParamsJSON = JSON.stringify(settings.getClientParams());
			return function (usObj) {
				var resultString = 'var init={settings:' + clientParamsJSON + ', user:' + JSON.stringify(_session.getPlainUser(usObj.user));

				if (usObj.registered) {
					resultString += ',registered:true';
				}

				resultString += '};';

				return resultString;
			};
		}()),

	//Проверка на выключенный у клиенты js. В этом случае клиент передаст параметр _nojs=1 в url
		checkNoJS = function (req) {
			var nojsShow = req.query._nojs === '1',
				nojsUrl;

			//Если страница уже не для "отсутствует javascript", вставляем в noscript ссылку на редирект в случае отсутствия javascript
			if (!nojsShow) {
				nojsUrl = req._parsedUrl.pathname + '?' + (req._parsedUrl.query ? req._parsedUrl.query + '&' : '') + '_nojs=1';
			}
			return {nojsUrl: nojsUrl, nojsShow: nojsShow};
		},

	//Для путей, которым не нужна установка сессии напрямую парсим браузер
		getReqBrowser = function (req, res, next) {
			var ua = req.headers['user-agent'];
			if (ua) {
				req.browser = _session.checkUserAgent(ua);
			}
			next();
		},

	//Заполняем некоторые заголовки для полностью генерируемых страниц
		setStaticHeaders = (function () {
			var cacheControl = 'no-cache',
				xFramePolicy = 'SAMEORIGIN',
				xPoweredBy = 'Paul Klimashkin | klimashkin@gmail.com',
				xUA = 'IE=edge';

			return function (req, res, next) {
				//Директива ответа для указания браузеру правила кеширования
				//no-cache - браузеру и прокси разрешено кешировать, с обязательным запросом актуальности
				//(в случае с наличием etag в первом ответе, в следующем запросе клиент для проверки актуальности передаст этот etag в заголовке If-None-Match)
				res.setHeader('Cache-Control', cacheControl);

				//The page can only be displayed in a frame on the same origin as the page itself https://developer.mozilla.org/en-US/docs/Web/HTTP/X-Frame-Options
				res.setHeader('X-Frame-Options', xFramePolicy);

				if (req.browser && req.browser.agent.family === 'IE') {
					//X-UA-Compatible header has greater precedence than Compatibility View http://msdn.microsoft.com/en-us/library/ff955275(v=vs.85).aspx
					res.setHeader('X-UA-Compatible', xUA);
				}

				res.setHeader('X-Powered-By', xPoweredBy);
				if (typeof next === 'function') {
					next();
				}
			};
		}());

	[
		'/', //Корень
		/^\/(?:photoUpload)\/?$/, // Пути строгие (/example без или с завершающим слешом)
		/^\/(?:ps|u|news)(?:\/.*)?$/, // Пути с возможным продолжением (/example/*)
		/^\/(?:p|confirm)\/.+$/ // Пути обязательным продолжением (/example/*)
	]
		.forEach(function (route) {
			app.get(route, _session.handleHTTPRequest, setStaticHeaders, appMainHandler);
		});
	function appMainHandler(req, res) {
		var nojs = checkNoJS(req);
		res.statusCode = 200;
		res.render('app', {appName: 'Main', initData: genInitDataString(req.handshake.usObj), nojsUrl: nojs.nojsUrl, nojsShow: nojs.nojsShow, agent: req.browser && req.browser.agent});
	}


	[/^\/(?:admin)(?:\/.*)?$/].forEach(function (route) {
		app.get(route, _session.handleHTTPRequest, setStaticHeaders, appAdminHandler);
	});
	function appAdminHandler(req, res) {
		var nojs = checkNoJS(req);
		res.statusCode = 200;
		res.render('app', {appName: 'Admin', initData: genInitDataString(req.handshake.usObj), nojsUrl: nojs.nojsUrl, nojsShow: nojs.nojsShow, agent: req.browser && req.browser.agent});
	}


	//Устаревший браузер
	app.get('/badbrowser', getReqBrowser, setStaticHeaders, function (req, res) {
		res.statusCode = 200;
		res.render('status/badbrowser', {agent: req.browser && req.browser.agent, title: 'Вы используете устаревшую версию браузера'});
	});

	//Мой user-agent
	app.get('/myua', getReqBrowser, function (req, res) {
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