/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let UserSettings = null;

registerModel(db => {
    UserSettings = db.model('UserSettingsDef', new Schema(
        {
            key: { type: String, lowercase: true, index: { unique: true } },
            val: { type: Schema.Types.Mixed }, // Value by default
            vars: { type: Schema.Types.Mixed }, // Array of possible values, if applicable
            desc: { type: String, default: '' },
        },
        { collection: 'user_settings', strict: true }
    ));
});
