'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    Counter = require('mongoose').model('Counter'),
    _ = require('lodash');

var PhotoSheme = new mongoose.Schema(
        {
            cid: {type: Number, index: { unique: true }},
            user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
            album: {type: Number},
            stack: {type: String},
            stack_order: {type: Number},

            file: {type: String, index: { unique: true }},
            loaded: {type: Date, default: Date.now, required: true},
            type: {type: String},
            format: {type: String},
            sign: {type: String},
            size: {type: Number},
            w: {type: Number},
            h: {type: Number},

            lat: {type: String},
            lng: {type: String},
            dir: {type: String},

            title: {type: String},
            year: {type: Number},
            year2: {type: Number},
            address: {type: String},
            desc: {type: String},
            source: {type: String},
            author: {type: String},

            stats_day: {type: Number},
            stats_week: {type: Number},
            stats_all: {type: Number},
            ccount: {type: Number},  //Кол-во комментариев

            conv: {type: Boolean}, //Конвертируется
            convqueue: {type: Boolean}, //В очереди на конвертацию
            fresh: {type: Boolean, default: true}, //Новое
            active: {type: Boolean},  //Активное
            del: {type: Boolean} //К удалению
        },
        {
            strict: true
        }
    ),
    PhotoConveyerSheme = new mongoose.Schema(
        {
            file: {type: String},
            added: {type: Date, default: Date.now, required: true},
            converting: {type: Boolean}
        },
        {
            strict: true
        }
    );


/**
 * Перед каждым сохранением делаем проверки
 * @instance
 * @param {string}
 * @param {function} cb
 */
PhotoSheme.pre('save', function (next) {

    // check year2
    if (this.isModified('year') || this.isModified('year2')) {
        if (!this.year2 || this.year2 < this.year) {
            this.year2 = this.year;
        }
    }

    return next();
});

PhotoSheme.statics.getPhoto = function (query, cb) {
    if (!query || !query.cid) {
        cb(null, 'cid is not specified');
    }
    this.findOne(query).populate('user', 'login avatar avatarW avatarH').select('-_id -__v').exec(cb);
};

PhotoSheme.statics.getPhotoCompact = function (query, options, cb) {
    if (!query || !query.cid) {
        cb(null, 'cid is not specified');
    }
    options = options || {};
    this.findOne(query, null, options).select('-_id -__v cid file title year ccount fresh active conv convqueue del').exec(cb);
};

PhotoSheme.statics.getPhotosCompact = function (query, options, cb) {
    if (!query) {
        cb(null, 'query is not specified');
    }
    options = options || {};
    this.find(query, null, options).sort('-loaded').select('-_id -___v cid file title year ccount fresh active conv convqueue del').exec(cb);
};



module.exports.makeModel = function (db) {
    db.model('Photo', PhotoSheme);
    db.model('PhotoConveyer', PhotoConveyerSheme);
};

/*
 Counter.findOne({_id: 'photo'}, function (err, doc) {
 if (!doc) {
 Counter.update({_id: 'photo'}, {$inc: { next: 1 }}, {upsert: true}, function (err) { if (err) { console.log('Counter photo' + err); } });
 }
 });*/
