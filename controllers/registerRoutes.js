var auth = require('./auth.js');

module.exports.loadController = function (app) {

	// More complicated example: '/p/:cid?/*
	['/', '/clusterCalc', '/p/*', '/u*', '/photoUpload', '/confirm/:key'].forEach(function (route) {
		app.get(route, appMainHandler);
	});
	function appMainHandler(req, res) {
		res.statusCode = 200;
		res.render('appMain.jade', {});
	}

	app.get('/admin', auth.restrictToRoleLevel(50), function (req, res) {
		res.statusCode = 200;
		res.render('adminUser.jade', {});
	});

};