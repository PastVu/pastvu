'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var SettingsSchema = new mongoose.Schema({
    key: { type: String, uppercase: true, index: { unique: true } },
    val: { type: Schema.Types.Mixed, 'default': false },
    desc: { type: String, 'default': '' }
});

module.exports.makeModel = function (db) {
    db.model('Settings', SettingsSchema);
};
