'use strict';

var mongoose = require('mongoose');

var CounterSchema = new mongoose.Schema({
    _id: String,
    next: {type: Number, 'default': 1}
});

CounterSchema.statics.increment = function (counter, callback) {
    return this.findByIdAndUpdateAsync(counter, { $inc: { next: 1 } }, {new: true, upsert: true, select: {next: 1}}).nodeify(callback);
};
CounterSchema.statics.incrementBy = function (counter, num, callback) {
    return this.findByIdAndUpdateAsync(counter, { $inc: { next: num } }, {new: true, upsert: true, select: {next: 1}}).nodeify(callback);
};

module.exports.makeModel = function (db) {
    db.model('Counter', CounterSchema);
};