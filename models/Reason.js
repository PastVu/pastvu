import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Reason = null;

registerModel(db => {
    Reason = db.model('Reason', new Schema(
        {
            cid: { type: Number, index: { unique: true } },
            title: { type: String, required: true },
            desc: {
                required: { type: Boolean },
                min: { type: Number },
                max: { type: Number },
                label: { type: String },
                placeholder: { type: String },
            },
        },
        { collection: 'reasons', strict: true }
    ));
});
