/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Model } from 'mongoose';
import { Settings } from './Settings';
import { waitDb } from '../controllers/connection';

Model.saveUpsert = function (findQuery, properties, cb) {
    this.findOne(findQuery, (err, doc) => {
        if (err && cb) {
            cb(err);
        }

        if (!doc) {
            doc = new this(findQuery);
        }

        for (const p in properties) {
            if (properties.hasOwnProperty(p)) {
                doc[p] = properties[p];
            }
        }

        doc.save(!cb ? undefined : (err, doc) => {
            if (err) {
                cb(err);

                return;
            }

            cb(null, doc);
        });
    });
};

waitDb.then(() => {
    Settings.saveUpsert({ key: 'USE_OSM_API' }, { val: true, desc: 'OSM Active' }, err => {
        if (err) {
            console.log('Settings ' + err);
        }
    });
    Settings.saveUpsert({ key: 'USE_YANDEX_API' }, { val: true, desc: 'Yandex Active' }, err => {
        if (err) {
            console.log('Settings ' + err);
        }
    });
    Settings.saveUpsert({ key: 'REGISTRATION_ALLOWED' }, {
        val: true,
        desc: 'Open self-registration of new users',
    }, err => {
        if (err) {
            console.log('Settings ' + err);
        }
    });
});
