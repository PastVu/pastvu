'use strict';

var logger = require('log4js').getLogger("error.js"),
	fs = require('fs'),
	sendHtml = (function () {
		var htmls;
		if (global.appVar.land === 'dev') {
			return function (status, res) {
				res.statusCode = status;
				res.render('status/' + status + '.jade');
			};
		} else {
			htmls = {
				'404': fs.readFileSync(__dirname + '/misc/404.html', 'utf8'),
				'500': fs.readFileSync(__dirname + '/misc/500.html', 'utf8')
			};
			return function (status, res) {
				res.statusCode = status;
				res.send(htmls[status]);
			};
		}
	}()),
	neoError = {
		e404: function e404(msgs) {
			this.message = msgs;
			Error.call(this);
			Error.captureStackTrace(this, e404);
		},
		e500: function e500(msgs) {
			this.message = msgs;
			Error.call(this);
			Error.captureStackTrace(this, e500);
		}
	};
neoError.e404.prototype = Object.create(Error.prototype);
neoError.e500.prototype = Object.create(Error.prototype);

function send404(req, res, err) {
	logger.error('404 for:\n\t' + JSON.stringify({url: req.url, method: req.method, ua: req.headers && req.headers['user-agent']}));
	if (req.xhr) {
		res.send(404, {error: 'Not found'});
	} else {
		sendHtml(404, res);
	}
}
function send500(req, res, err) {
	logger.error(err);
	if (req.xhr) {
		res.send(500, {error: err.message});
	} else {
		sendHtml(500, res);
	}
}

module.exports.err = neoError;
module.exports.registerErrorHandling = function (app) {

	//Последний get. Если дошли сюда, значит на запрос нет обработчика
	app.get('*', function (req, res) {
		throw new neoError.e404();
	});

	//Обработчик выброшенных ошибок
	app.use(function (err, req, res, next) { //аргумент next убирать нельзя - не выстрелит
		if (err instanceof neoError.e404 || err.code === 'ENOTDIR') {
			send404(req, res, err);
		} else if (err instanceof neoError.e500) {
			send500(req, res, err);
		} else {
			send500(req, res, err);
		}
	});

};