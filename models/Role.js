var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var Role = new Schema({
	name: {type: String, index: { unique: true }},
	level: {type: Number, min: 0, index: false},
    comment: {type: String, index: false}
});

Role.pre('save', function (next) {
  var doc = this.toObject();

  /*for (var key in doc) {
    if (doc.hasOwnProperty(key) && !Role.paths[key]) {
      next(new Error('Save failed: Trying to add doc with wrong field(s)'));
      console.log('Save failed: Trying to add doc with wrong field(s)');
      return;
    }
  }*/
  next();
});      

var RoleModel = mongoose.model('Role', Role);

RoleModel.update({name: 'anonymous'}, {level:0, comment:'Role for unregistered users'}, {upsert: true}, function(err){if (err) console.log('Role '+err);});
RoleModel.update({name: 'registered'}, {level:1, comment:'Registered user'}, {upsert: true}, function(err){if (err) console.log('Role '+err);});
RoleModel.update({name: 'spec'}, {level:4, comment:'Special account'}, {upsert: true}, function(err){if (err) console.log('Role '+err);});
RoleModel.update({name: 'moderator'}, {level:10, comment:'Moderator'}, {upsert: true}, function(err){if (err) console.log('Role '+err);});
RoleModel.update({name: 'admin'}, {level:50, comment:'Administrator'}, {upsert: true}, function(err){if (err) console.log('Role '+err);});
RoleModel.update({name: 'super_admin'}, {level:100, comment:'Super Administrator'}, {upsert: true}, function(err){if (err) console.log('Role '+err);});