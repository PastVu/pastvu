var Utils = require('../commons/Utils.js');

var ms404 = {
		title: 'NotFound',
		body: 'The page you requested was not found'
	},
	ms500 = {
		title: 'Oldmos Error',
		body: 'Sorry, server failed to fulfill an apparently request'
	},
	appHash = '';

var neoError = {
	e404: function (msgs) {
		this.msgs = msgs;
		Error.call(this);
		Error.captureStackTrace(this, arguments.callee);
	},
	e404Virgin: function (req, res, msgss) {
		var msgs = ms404; if (msgss) msgs = {}.extend(ms404).extend(msgss);
		res.render('404.jade', { locals: {prettyprint:false, pageTitle:msgs.title, mess: msgs.body, appHash: appHash}, status: 404 });
	},
	e500: function (msg) {
		this.msgs = msgs;
		Error.call(this);
		Error.captureStackTrace(this, arguments.callee);
	},
	e500Virgin: function (req, res, msgss) {
		var msgs = ms500; if (msgss) msgs = {}.extend(ms500).extend(msgss);
		res.render('500.jade', { locals: {prettyprint:false, pageTitle:msgs.title, mess: msgs.body, appHash: appHash}, status: 500 });
	},
};
neoError.e404.prototype.__proto__ = Error.prototype;
neoError.e500.prototype.__proto__ = Error.prototype;
module.exports.err = neoError;

module.exports.loadController = function (app) {
	appHash = app.hash;
	
	app.get('/404', function(req, res) {
		throw new neoError.e404();
	});
	app.get('/500', function(req, res) {
		throw new neoError.e500();
	});

	app.error(function(err, req, res, next) {
		if (err instanceof neoError.e404 || err.code=='ENOTDIR') {
			neoError.e404Virgin(req, res, err.msgs);
		} else if (err instanceof neoError.e500) {
			neoError.e500Virgin(req, res, err.msgs);
		}else {
			neoError.e500Virgin(req, res, err.msgs);
		}
	});

};