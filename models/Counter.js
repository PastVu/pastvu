var mongoose = require('mongoose');

var CounterSchema = new mongoose.Schema({
    _id: String,
    next: {type: Number, default: 1}
});

CounterSchema.statics.findAndModify = function (query, sort, doc, options, callback) {
    return this.collection.findAndModify(query, sort, doc, options, callback);
};

CounterSchema.statics.increment = function (counter, callback) {
    return this.collection.findByIdAndUpdate(counter, { $inc: { next: 1 } }, {new: true, upsert: true, select: {next: 1}}, callback);
    //return this.collection.findAndModify({ _id: counter }, [], { $inc: { next: 1 } }, {}, callback);
};

module.exports.makeModel = function (db) {
    db.model('Counter', CounterSchema);
};