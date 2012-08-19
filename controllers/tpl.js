/**
 * p.klimashkin
 */
var log4js = require('log4js'),
    File = require("file-utils").File,
    tplFolder = new File('./views/client'),
    tpls = [];

tplFolder.listFiles(function (e, files) {
    if (e) {
        console.dir(e);
        process.exit(1);
    }
    Object.keys(files).forEach(function (element, index, array) {
        tpls.push(files[element].getName());
    });
});

module.exports.loadController = function (app) {
    var logger = log4js.getLogger("tpl.js");

    app.get('/tpl/:name', function (req, res) {
        if (tpls.indexOf(req.route.params.name) !== -1) {
            res.render('client/' + req.route.params.name, {pretty: false});
        } else {
            res.send(404);
        }
    });

};