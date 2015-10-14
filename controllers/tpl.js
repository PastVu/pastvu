import path from 'path';
import Utils from '../commons/Utils';

let tpls = [];

Utils.walkParallel(path.normalize('./views/module'), function (err, files) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    tpls = Utils.filesListProcess(files, 'views/module/');
});

module.exports.loadController = function (app) {
    app.get('/tpl/*', function (req, res) {
        if (tpls.includes(req.params[0])) {
            res.status(200).render('module/' + req.params[0]);
        } else {
            res.sendStatus(404);
        }
    });
};