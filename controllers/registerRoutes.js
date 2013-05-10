module.exports.loadController = function (app) {

	// More complicated example: '/p/:cid?/*
	['/', '/clusterCalc', '/p/*', '/u*', '/photoUpload', '/confirm/:key'].forEach(function (route) {
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