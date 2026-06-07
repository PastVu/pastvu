/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import path from 'path';
import Utils from '../commons/Utils';

let tpls = [];

Utils.walkParallel({ dir: path.normalize('./views/module'), onDone: (err, files) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    tpls = Utils.filesListProcess(files, 'views/module/');
} });

export function loadController(app) {
    app.get('/tpl/{*path}', (req, res) => {
        const tplPath = req.params.path.join('/');

        if (tpls.includes(tplPath)) {
            res.status(200).render('module/' + tplPath);
        } else {
            res.sendStatus(404);
        }
    });
}
