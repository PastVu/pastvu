'use strict';

var ActionLog,
	log4js = require('log4js'),
	logger;

function logIt(appid, rid, rstamp, method, type) {
	var argumentsLen = arguments.length,
		stamp = argumentsLen > 4 ? arguments[4]: undefined,
		reason = argumentsLen > 5 ? arguments[5]: undefined,
		roleregion = argumentsLen > 6 ? arguments[6]: undefined,
		addinfo = argumentsLen > 7 ? arguments[7]: undefined,
		action = new ActionLog({
			user: user,
			stamp: stamp,
			obj: obj,
			objtype: objtype,
			type: type,
			reason: reason,
			role: user.role,
			roleregion: roleregion,
			addinfo: addinfo
	});
	action.save();
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("photo.js");

	ActionLog = db.model('ActionLog');
};
module.exports.logIt = logIt;
module.exports.OBJTYPES = {
	USER: 1,
	PHOTO: 2,
	COMMENT: 3
};
module.exports.TYPES = {
	CREATE: 1,
	RESTORE: 8,
	REMOVE: 9
};