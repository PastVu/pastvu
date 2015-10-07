import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Settings = null;

registerModel(db => {
    Settings = db.model('Settings', new Schema({
        key: { type: String, uppercase: true, index: { unique: true } },
        val: { type: Schema.Types.Mixed, 'default': false },
        desc: { type: String, 'default': '' }
    }));
});