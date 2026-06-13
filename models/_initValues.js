/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Model } from 'mongoose';
import { Settings } from './Settings';
import { waitDb } from '../controllers/connection';

Model.saveUpsert = async function (findQuery, properties) {
    let doc = await this.findOne(findQuery).exec();

    if (!doc) {
        doc = new this(findQuery);
    }

    for (const p in properties) {
        if (properties.hasOwnProperty(p)) {
            doc[p] = properties[p];
        }
    }

    return doc.save();
};

waitDb.then(() => {
    Settings.saveUpsert({ key: 'USE_OSM_API' }, { val: true, desc: 'OSM Active' })
        .catch(err => console.log('Settings ' + err));
    Settings.saveUpsert({ key: 'USE_YANDEX_API' }, { val: true, desc: 'Yandex Active' })
        .catch(err => console.log('Settings ' + err));
    Settings.saveUpsert({ key: 'REGISTRATION_ALLOWED' }, {
        val: true,
        desc: 'Open self-registration of new users',
    }).catch(err => console.log('Settings ' + err));
});
