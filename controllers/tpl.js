'use strict';

var fs = require("fs"),
	path = require("path"),
	Utils = require('../commons/Utils.js'),
	tpls = [];


Utils.walkParallel(path.normalize('./views/module'), function (e, files) {
	if (e) {
		console.dir(e);
		process.exit(1);
	}
	tpls = Utils.filesListProcess(files, 'views/module/');
});

module.exports.loadController = function (app) {
	app.get('/tpl/*', function (req, res) {
		if (~tpls.indexOf(req.route.params[0])) {
			res.status(200).render('module/' + req.route.params[0]);
		} else {
			res.send(404);
		}
	});
};