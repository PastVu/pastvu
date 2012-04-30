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

/*var anonymous = new RoleModel();
anonymous.name = 'anonymous';
anonymous.level = 0;
anonymous.comment = 'good role';
anonymous.save(function (err) {
  console.log('WOW '+err);
});

var registered = new RoleModel();
registered.name = 'registered';
registered.level = 1;
registered.comment = 'good role2';
registered.save(function (err) {
  console.log('WOW '+err);
});*/