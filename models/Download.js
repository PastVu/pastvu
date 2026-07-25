/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Download = null;

registerModel(/* async */db => {
    Download = db.model('Download', new Schema(
        {
            stamp: { type: Date, 'default': Date.now, index: { expires: '10s' } }, // Download keys expired in 10 seconds
            key: { type: String, index: { unique: true } },
            data: { type: Schema.Types.Mixed },
        },
        { strict: true }
    ));
});

