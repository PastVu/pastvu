var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var RoleSchema = new Schema({
    _id: {type: String},
    level: {type: Number, min: 0},
    comment: {type: String, default: '11'}
});

module.exports.makeModel = function (db) {

    var RoleModel = db.model('Role', RoleSchema);

    RoleModel.saveUpsert({_id: 'anonymous'}, {level: 0, comment: 'Role for unregistered users'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({_id: 'registered'}, {level: 1, comment: 'Registered user'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({_id: 'spec'}, {level: 4, comment: 'Special account'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({_id: 'moderator'}, {level: 10, comment: 'Moderator'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({_id: 'admin'}, {level: 50, comment: 'Administrator'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
    RoleModel.saveUpsert({_id: 'super_admin'}, {level: 101, comment: 'Super Administrator'}, function (err, numberAffected, raw) {
        if (err) console.log('Role ' + err);
    });
};



