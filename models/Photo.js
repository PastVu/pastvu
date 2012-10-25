var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    Counter = require('mongoose').model('Counter');

var PhotoSheme = new mongoose.Schema(
    {
        cid: {type: Number, index: { unique: true }},
        user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
        album: {type: Number},
        stack: {type: String},
        stack_order: {type: Number},

        lat: {type: String},
        lng: {type: String},
        direction: {type: String},

        file: {type: String},
        loaded: {type: Date, default: Date.now, required: true},
        format: {type: String},
        size: {type: Number},
        w: {type: Number},
        h: {type: Number},

        title: {type: String, default: 'No title yet'},
        year: {type: String},
        year_from: {type: Number},
        year_to: {type: Number},
        address: {type: String},
        description: {type: String},
        source: {type: String},
        author: {type: String},

        stats_day: {type: Number},
        stats_week: {type: Number},
        stats_all: {type: Number},
        comments_count: {type: Number},

        fresh: {type: Boolean, default: true},
        active: {type: Boolean, default: false}
    },
    {
        strict: true
    }
);

module.exports.makeModel = function (db) {
    db.model('Photo', PhotoSheme);
};

/*
 Counter.findOne({_id: 'photo'}, function (err, doc) {
 if (!doc) {
 Counter.update({_id: 'photo'}, {$inc: { next: 1 }}, {upsert: true}, function (err) { if (err) { console.log('Counter photo' + err); } });
 }
 });*/
