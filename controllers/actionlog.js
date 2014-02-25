'use strict';

var ActionLog,
	log4js = require('log4js'),
	logger;

function logIt(user, obj, objtype, type) {
	var callback = typeof arguments[arguments.length - 1] === 'function' ? arguments[arguments.length - 1] : undefined,
		argumentsLen = callback ? arguments.length - 1: arguments.length,
		reason = argumentsLen > 4 ? arguments[4]: undefined,
		roleregion = argumentsLen > 5 ? arguments[5]: undefined,
		action = new ActionLog({
			user: user,
			obj: obj,
			objtype: objtype,
			type: type,
			reason: reason,
			role: user.role,
			roleregion: roleregion
	});

	action.save(callback);
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("photo.js");

	ActionLog = db.model('ActionLog');
};
module.exports.logIt = logIt;