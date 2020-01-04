import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let News = null;

registerModel(db => {
    News = db.model('News', new Schema(
        {
            cid: { type: Number, index: { unique: true } },
            user: { type: Schema.Types.ObjectId, ref: 'User' },
            cdate: { type: Date, 'default': Date.now, required: true }, // Creation time
            pdate: { type: Date, 'default': Date.now, required: true, index: true }, // Time of news appeared
            tdate: { type: Date }, // Time before notice on main page is shown
            title: { type: String, 'default': '' },
            notice: { type: String }, // Notice short text
            txt: { type: String, required: true }, // Full text

            nocomments: { type: Boolean }, // Prohibit commenting
            ccount: { type: Number }, // Number of comments
        },
        { strict: true }
    ));
});
