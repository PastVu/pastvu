var mongoose = require('mongoose');

var Counter = new mongoose.Schema({
    _id: String,
    next: {type: Number, default: 0}
});

Counter.statics.findAndModify = function (query, sort, doc, options, callback) {
    return this.collection.findAndModify(query, sort, doc, options, callback);
};

Counter.statics.increment = function (counter, callback) {
    return this.collection.findAndModify({ _id: counter }, [], { $inc: { next: 1 } }, {}, callback);
};

var CounterModel = mongoose.model('Counter', Counter);