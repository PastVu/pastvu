var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


var SettingsSchema = new mongoose.Schema({
    key: {type: String, uppercase: true, index: { unique: true }},
    val: {type: Schema.Types.Mixed, default: false},
    desc: {type: String, default: ''}
});

module.exports.makeModel = function (db) {
    db.model('Settings', SettingsSchema);
};


/*User.pre('save', function (next) {
 var doc = this.toObject();

 for (var key in doc) {
 if (doc.hasOwnProperty(key) &&
 !User.paths[key]) {
 next(new Error('Save failed: Trying to add doc with wrong field(s)'));
 return;
 }
 }
 next();
 });*/

