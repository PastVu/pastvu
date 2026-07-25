/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Settings = null;

registerModel(db => {
    Settings = db.model('Settings', new Schema({
        key: { type: String, uppercase: true, index: { unique: true } },
        val: { type: Schema.Types.Mixed, 'default': false },
        desc: { type: String, 'default': '' },
    }));
});
