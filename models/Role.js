var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var RoleSchema = new Schema({
    name: {type: String, index: { unique: true }},
    level: {type: Number, min: 0, default: 0},
    comment: {type: String, default: '11'}
});
mongoose.model('Role', RoleSchema);

module.exports.makeModel = function (db) {
    db.model('Role', RoleSchema);
};



