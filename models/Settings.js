var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


var SettingsSchema = new mongoose.Schema({
    key: {type: String, uppercase: true, index: { unique: true }},
    val: {type: Schema.Types.Mixed, default: false},
    desc: {type: String, default: ''}
});

module.exports.makeModel = function (db) {
    var SettingsModel = db.model('Settings', SettingsSchema);

    SettingsModel.saveUpsert({key: 'USE_OSM_API'}, {val: true, desc: 'OSM Active'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
    SettingsModel.saveUpsert({key: 'USE_YANDEX_API'}, {val: false, desc: 'Yandex Active'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
    SettingsModel.saveUpsert({key: 'REGISTRATION_ALLOWED'}, {val: true, desc: 'Open self-registration of new users'}, function (err) {
        if (err) console.log('Settings ' + err);
    });
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

