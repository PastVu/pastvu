module.exports.loadController = function (app) {

	// Set custom X-Powered-By for non-static
	app.get('*', function (req, res, next) {
		res.setHeader('X-Powered-By', 'Paul Klimashkin | klimashkin@gmail.com');
		next();
	});

	// More complicated example: '/p/:cid?/*
	['/', '/p*', '/u*', '/photoUpload', '/news*', '/confirm/:key'].forEach(function (route) {
		app.get(route, appMainHandler);
	});
	function appMainHandler(req, res) {
		res.statusCode = 200;
		res.render('app.jade', {appName: 'Main'});
	}

	['/admin*'].forEach(function (route) {
		app.get(route, appAdminHandler);
	});
	function appAdminHandler(req, res) {
		res.statusCode = 200;
		res.render('app.jade', {appName: 'Admin'});
	}
};