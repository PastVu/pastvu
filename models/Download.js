import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Download = null;

registerModel(/* async */function (db) {
    Download = db.model('Download', new Schema(
        {
            stamp: { type: Date, 'default': Date.now, index: { expires: '10s' } }, // Download keys expired in 10 seconds
            key: { type: String, index: { unique: true } },
            data: { type: Schema.Types.Mixed }
        },
        { strict: true }
    ));
});

