var log4js = require('log4js'),
    File = require("file-utils").File,
    Utils = require('../commons/Utils.js'),
    tplFolder = new File('./views/client'),
    tpls = [];

tplFolder.list(function (e, files) {
    if (e) {
        console.dir(e);
        process.exit(1);
    }
    tpls = filesRecursive(files, '');
});

function filesRecursive(files, prefix) {
    'use strict';
    var result = [];

    Object.keys(files).forEach(function (element, index, array) {
        if (Utils.isObjectType('object', files[element])) {
            Array.prototype.push.apply(result, filesRecursive(files[element], prefix + element + '/'));
        } else {
            result.push(prefix + element);
        }
    });

    return result;
}

module.exports.loadController = function (app) {
    'use strict';
    var logger = log4js.getLogger("tpl.js");

    app.get('/tpl/*', function (req, res) {
        if (tpls.indexOf(req.route.params[0]) !== -1) {
            res.statusCode = 200;
            res.render('client/' + req.route.params[0], {});
        } else {
            res.send(404);
        }
    });

};