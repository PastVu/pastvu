var auth = require('./auth.js');

module.exports.loadController = function (app) {

	// More complicated example: '/p/:cid?/*
	app.get('/', appMainHandler);
	app.get('/p/*', appMainHandler);
	app.get('/u', appMainHandler);
	app.get('/u/*', appMainHandler);
	app.get('/photoUpload', appMainHandler);
	app.get('/confirm/:key', appMainHandler);

	app.get('/admin', auth.restrictToRoleLevel(50), function (req, res) {
		res.statusCode = 200;
		res.render('adminUser.jade', {});
	});

	function appMainHandler(req, res) {
		res.statusCode = 200;
		res.render('appMain.jade', {});
	}
};