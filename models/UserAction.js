/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let UserAction = null;

registerModel(db => {
    UserAction = db.model('UserAction', new Schema(
        {
            key: { type: String, index: { unique: true } },
            reasons: [Number],
            reason_text: { type: String },
        },
        { collection: 'user_actions', strict: true }
    ));
});
