import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

export let Counter = null;

registerModel(db => {
    const CounterSchema = new Schema({
        _id: String,
        next: { type: Number, 'default': 1 }
    });

    CounterSchema.statics.increment = function (counter, callback) {
        return this.findByIdAndUpdateAsync(counter, { $inc: { next: 1 } }, {
            new: true,
            upsert: true,
            select: { next: 1 }
        }).nodeify(callback);
    };

    CounterSchema.statics.incrementBy = function (counter, num, callback) {
        return this.findByIdAndUpdateAsync(counter, { $inc: { next: num } }, {
            new: true,
            upsert: true,
            select: { next: 1 }
        }).nodeify(callback);
    };

    Counter = db.model('Counter', CounterSchema);
});