'use strict';

var util = require('util'),
	logger = require('log4js').getLogger("error.js"),
	logger404 = require('log4js').getLogger("404.js"),
	neoError = {
		e404: function e404(message) {
			this.message = message;
			Error.captureStackTrace(this, e404);
		},
		e500: function e500(message) {
			this.message = message;
			Error.captureStackTrace(this, e500);
		}
	};
util.inherits(neoError.e404, Error);
util.inherits(neoError.e500, Error);
neoError.e404.prototype.name = 'HTTP404Error';
neoError.e500.prototype.name = '500Error';

function send404(req, res, err) {
	logger404.error(JSON.stringify({url: req.url, method: req.method, ua: req.headers && req.headers['user-agent'], referer: req.headers && req.headers.referer}));
	if (req.xhr) {
		res.send(404, {error: 'Not found'});
	} else {
		res.statusCode = 404;
		res.render('status/404');
	}
}
function send500(req, res, err) {
	logger.error(err);
	if (req.xhr) {
		res.send(500, {error: err.message});
	} else {
		res.statusCode = 500;
		res.render('status/500');
	}
}

module.exports.err = neoError;
module.exports.registerErrorHandling = function (app) {

	//Последний. Если дошли сюда, значит на запрос нет обработчика
	app.all('*', function (req, res) {
		throw new neoError.e404('No such resource');
	});

	//Обработчик выброшенных ошибок
	app.use(function (err, req, res, next) { //аргумент next убирать нельзя - не выстрелит
		if (err instanceof neoError.e404 || err.code === 'ENOENT' || err.code === 'ENOTDIR') {
			send404(req, res, err);
		} else if (err instanceof neoError.e500) {
			send500(req, res, err);
		} else {
			send500(req, res, err);
		}
	});

};