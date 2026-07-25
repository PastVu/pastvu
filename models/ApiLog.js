/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let ApiLog = null;

registerModel(db => {
    // Model for logging api requests
    ApiLog = db.model('ApiLog', new Schema(
        {
            app: { type: String, required: true, index: true }, // Application id
            stamp: { type: Date, 'default': Date.now, required: true, index: true }, // Request incoming time
            ms: { type: Number, index: true }, // Time of request processing in ms

            rid: { type: String }, // Request id
            rstamp: { type: Date }, // Time of request sent by client (parameter stamp)

            method: { type: String }, // Method of api
            data: { type: String }, // Parameter string data

            status: { type: Number }, // Response http code
            err_code: { type: Number }, // Possible error code
            err_msg: { type: String }, // Possible error string
        },
        { strict: true, collection: 'apilog' }
    ));
});
