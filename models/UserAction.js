'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var UserActionSchema = new Schema(
    {
        key: { type: String, index: { unique: true } },
        reasons: [Number],
        reason_text: { type: String }
    },
    {
        collection: 'user_actions',
        strict: true
    }
);

module.exports.makeModel = function (db) {
    db.model('UserAction', UserActionSchema);
};
