var mongoose = require('mongoose'),
	//roleModel = mongoose.model('Role'),
	Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId,
    crypto = require('crypto');

//Used to generate a hash of the plain-text password + salt
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

var userRoles = {
  user: {
    name: 'operator',
    level: 1
  },
  admin: {
    name: 'administrator',
    level: 3
  },
  sadmin: {
    name: 'superadministrator',
    level: 10
  }
};

var sexes = {
	m: 'male',
	f: 'famale'
}

var User = new mongoose.Schema({
    login: {type: String, index: { unique: true }, select: true},
	email: {type: String, index: { unique: true }, select: true},
    pass: {type: String, select: false},
	salt: {type: String, select: false},
	
	//Profile
	avatar: {type: String, select: true},
	firstName: {type: String, select: true},
	lastName: {type: String, select: true},
	birthdate: {type: String, select: true},
	sex: {type: String, select: true},
	country: {type: String, select: true},
	city: {type: String, select: true},
	work: {type: String, select: true},
	www: {type: String, select: true},
	icq: {type: String, select: true},
	skype: {type: String, select: true},
	aim: {type: String, select: true},
	lj: {type: String, select: true},
	flickr: {type: String, select: true},
	blogger: {type: String, select: true},
	aboutme: {type: String, select: true},
	
	//Service
    roles: [ObjectId],
	regdate: {type: Date, default: Date.now, select: true},
    
    dateFormat: {"type": String, "default": "dd.mm.yyyy", select: true},
	active: {type: Boolean, default: false, select: false},
	activatedate: {type: Date, default: Date.now, select: false}
});

User.path('sex').validate(function (sex) {
  return Object.keys(sexes).indexOf(sex) != -1;
}, 'Incorrect sex');

User.path('pass').set(function (pass) {
  pass = pass.toString();
  if (pass.length === 0) return this.pass;
  return pass;
});

User.pre('save', function (next) {
  var doc = this.toObject();

  /*for (var key in doc) {
    if (doc.hasOwnProperty(key) &&
        !User.paths[key]) {
      next(new Error('Save failed: Trying to add doc with wrong field(s)'));
      return;
    }
  }*/
  next();
});      

var UserModel = mongoose.model ('User', User);

/**
 * Checks if pass is right for current user
 * @static
 * @param {Object} user
 * @param {string} pass
 */
UserModel.checkPass = function(user, pass) {
	console.log(pass+' '+user.salt);
	console.log(md5(pass + user.salt));
	console.log(user.pass);
  return (user.pass === md5(pass + user.salt));
};

/**
 * Checks if role is right for current user
 * @static
 * @param {Object} user
 * @param {string} role
 */
UserModel.checkRole = function(user, role) {
  if (!user) return false;
  var roleLevel = (role && userRoles[role]) ? userRoles[role].level : 0;
  return userRoles[user.role].level >= roleLevel;
};

/**
 * getPublicUser
 * @static
 * @param {string} login
 * @param {function} callback
 */
UserModel.getUserPublic = function(login, callback) {
  if (!login) callback(null, 'Login is not specified');
  UserModel.findOne({ $and: [ {login : new RegExp(login, 'i')}, { active: true } ] }).select('login').exec(callback);
};

/**
 * getAllUser
 * @static
 * @param {string} login
 * @param {function} callback
 */
UserModel.getUserAll = function(login, callback) {
  if (!login) callback(null, 'Login is not specified');
  UserModel.findOne({ $and: [ {login : new RegExp(login, 'i')}, { active: true } ] }).select('pass', 'salt', 'active').exec(callback);
};
UserModel.getUserAllLoginMail = function(login, callback) {
  if (!login) callback(null, 'Login is not specified');
  UserModel.findOne({ $and: [ { $or : [ { login : new RegExp(login, 'i') } , { email : login.toLowerCase() } ] }, { active: true } ] }).select('pass', 'salt', 'active').exec(callback);
};

UserModel.prototype.hashPassword = function() {
  if (!this.pass) return;
  this.salt = Math.random() + '';
  this.pass = md5(this.pass + this.salt);
};
UserModel.hashPasswordExternal = function() {
  if (!this.pass) return;
  this.salt = Math.random() + '';
  this.pass = md5(this.pass + this.salt);
};

/*var anonymous = new UserModel();
anonymous.login = 'neo';
anonymous.pass = 'energy';
anonymous.hashPassword();
anonymous.city = 'NY';
anonymous.comment = 'good role';
anonymous.save(function (err) {
  console.log('USER '+err);
});*/


var UserConfirm = new mongoose.Schema({
	key: {type: String, index: { unique: true }},
    login: {type: String, index: { unique: true }},
	created: {type: Date, default: Date.now}
});

var UserConfirmModel = mongoose.model ('UserConfirm', UserConfirm);