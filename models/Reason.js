'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var ReasonSchema = new Schema(
    {
        cid: { type: Number, index: { unique: true } },

        title: { type: String, required: true },
        desc: {
            required: { type: Boolean },
            min: { type: Number },
            max: { type: Number },
            label: { type: String },
            placeholder: { type: String }
        }
    },
    {
        collection: 'reasons',
        strict: true
    }
);

module.exports.makeModel = function (db) {
    db.model('Reason', ReasonSchema);
};
