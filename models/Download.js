var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Download keys expired in 10 seconds
var DownloadSchema = new Schema(
    {
        stamp: { type: Date, 'default': Date.now, index: { expires: '10s' } },
        key: { type: String, index: { unique: true } },
        data: { type: Schema.Types.Mixed }
    },
    {
        strict: true
    }
);

module.exports.makeModel = function (db) {
    db.model('Download', DownloadSchema);
};