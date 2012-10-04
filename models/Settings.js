var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var Settings = new mongoose.Schema({
    key: {type: String, uppercase: true, index: { unique: true }},
    val: {type: Schema.Types.Mixed},
    desc: {type: String}
});


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

var SettingsModel = mongoose.model('Settings', Settings);

new SettingsModel({
    key: 'use_osm_api',
    val: true,
    desc: 'OSM Active'
}).save();
new SettingsModel({
    key: 'use_yandex_api',
    val: false,
    desc: 'Yandex Active'
}).save();
new SettingsModel({
    key: 'Registration_Allowed',
    val: true,
    desc: 'Opene self-registration of new users'
}).save();