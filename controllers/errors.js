
var neoError = {
	e404: function (msg) {
		this.errTitle = 'NotFound';
		this.errMsg = msg;
		Error.call(this);
		Error.captureStackTrace(this, arguments.callee);
	},
	e500: function (msg) {
		this.errTitle = 'Oldmos Error';
		this.errMsg = msg;
		Error.call(this);
		Error.captureStackTrace(this, arguments.callee);
	}
};
neoError.e404.prototype.__proto__ = Error.prototype;
module.exports.err = neoError;

module.exports.loadController = function (app) {

	app.get('/404', function(req, res) {
		throw new neoError.e404();
	});
	app.get('/500', function(req, res) {
		throw new neoError.e500();
	});

	app.error(function(err, req, res, next) {
		console.dir(err);
		if (err instanceof neoError.e404) {
			res.render('404.jade', {prettyprint:true, pageTitle:err.errTitle || 'Not found', mess: err.errMsg || 'The page you requested was not found'});
		} else if (err instanceof neoError.e500) {
			res.render('500.jade', {prettyprint:true, pageTitle:err.errTitle || 'Oldmos error', mess: err.errMsg || 'Sorry, server failed to fulfill an apparently request'});
		}else {
			next(err);
		}
	});

};