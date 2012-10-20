var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var RoleSchema = new Schema({
    name: {type: String, index: { unique: true }},
    level: {type: Number, min: 0, default: 0},
    comment: {type: String, default: '11'}
});
mongoose.model('Role', RoleSchema);

module.exports.makeModel = function (db) {

    var RoleModel = db.model('Role', RoleSchema);

    RoleModel.saveUpsert({name: 'anonymous'}, {level: 0, comment: 'Role for unregistered users'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({name: 'registered'}, {level: 1, comment: 'Registered user'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({name: 'spec'}, {level: 4, comment: 'Special account'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({name: 'moderator'}, {level: 10, comment: 'Moderator'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({name: 'admin'}, {level: 50, comment: 'Administrator'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({name: 'super_admin'}, {level: 100, comment: 'Super Administrator'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
};



