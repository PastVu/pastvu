/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Counter = null;

registerModel(db => {
    const CounterSchema = new Schema({
        _id: String,
        next: { type: Number, 'default': 1 },
    });

    CounterSchema.statics.increment = function (counter) {
        return this.findByIdAndUpdate(counter, { $inc: { next: 1 } }, {
            new: true,
            upsert: true,
            select: { next: 1 },
        }).exec();
    };

    CounterSchema.statics.incrementBy = function (counter, num) {
        return this.findByIdAndUpdate(counter, { $inc: { next: num } }, {
            new: true,
            upsert: true,
            select: { next: 1 },
        }).exec();
    };

    Counter = db.model('Counter', CounterSchema);
});
