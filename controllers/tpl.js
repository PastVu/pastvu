var File = require("file-utils").File,
	Utils = require('../commons/Utils.js'),
	tplFolder = new File('./views/module'),
	tpls = [];

tplFolder.list(function (e, files) {
	'use strict';
	if (e) {
		console.dir(e);
		process.exit(1);
	}
	tpls = Utils.filesRecursive(files, '');
});

module.exports.loadController = function (app) {
	'use strict';

	app.get('/tpl/*', function (req, res) {
		if (tpls.indexOf(req.route.params[0]) !== -1) {
			res.statusCode = 200;
			res.render('module/' + req.route.params[0], {});
		} else {
			res.send(404);
		}
	});
};