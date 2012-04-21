var mongoose = require('mongoose'),
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

var User = new mongoose.Schema({
    login: {type: String, index: { unique: true }},
    salt: String,
    pass: String,
    role: String,
    comment: String,
    dateFormat: {"type": String, "default": "dd.mm.yyyy"}
});

User.path('role').validate(function (role) {
  return Object.keys(userRoles).indexOf(role) != -1;
}, 'Incorrect role');

User.path('pass').set(function (pass) {
  pass = pass.toString();
  if (pass.length === 0) return this.pass;
  return pass;
});

User.pre('save', function (next) {
  var doc = this.toObject();

  for (var key in doc) {
    if (doc.hasOwnProperty(key) &&
        !User.paths[key]) {
      next(new Error('Save failed: Trying to add doc with wrong field(s)'));
      return;
    }
  }
  next();
});      

var UserModel = mongoose.model ('User', User);

/**
 * Get all available roles
 * @static
 * @return {Object}
 */
UserModel.getRoles = function() {
  return userRoles;
};

/**
 * Get all roles available for user
 * @static
 * @return {Object}
 */
UserModel.getAvailRoles = function(user) {
  var result = Utils.clone(userRoles);

  for (var roleId in result) {
    if (!UserModel.checkRole(user, roleId)) {
      delete result[roleId];
    }
  }
  return result;
};

/**
 * Get role by id
 * @static
 * @param {string} roleId Role Id
 * @return {Object}
 */
UserModel.getRole = function(roleId) {
  return userRoles[roleId] || null;
};

/**
 * Checks if pass is right for current user
 * @static
 * @param {Object} user
 * @param {string} pass
 */
UserModel.checkPass = function(user, pass) {
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

UserModel.prototype.hashPassword = function() {
  if (!this.pass) return;
  this.salt = Math.random() + '';
  var pass = this.pass;
  this.pass = md5(pass + this.salt);
};