var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


var SessionSchema = new mongoose.Schema({
    key: {type: String, index: {unique: true}},
    stamp: {type: Date, 'default': Date.now, index: {expires: '14d'}},
    user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
    data: {type: Schema.Types.Mixed, 'default': {}}
});

module.exports.makeModel = function (db) {
    'use strict';
    db.model('Session', SessionSchema);
};
