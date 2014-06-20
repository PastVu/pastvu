'use strict';

var auth = require('./auth.js'),
	Settings,
	UserSettingsDef,
	_ = require('lodash'),
	step = require('step'),
	logger = require('log4js').getLogger("settings.js"),
	appvar,
	appEnv = {},

	clientSettings,
	userSettingsDef,
	userSettingsVars = {},
	userRanks,
	userRanksHash = {};

/**
 * Заполняем объект для параметров клиента
 */
function fillClientParams() {
	var params = {
		server: appEnv.serverAddr,
		appHash: appEnv.hash,
		appVersion: appEnv.version
	};
	step(
		function () {
			Settings.find({}, {_id: 0, key: 1, val: 1}, {lean: true}, this);
		},
		function (err, settings) {
			if (err) {
				return logger.error(err);
			}
			for (var i = settings.length; i--;) {
				params[settings[i].key] = settings[i].val;
			}
			clientSettings = params;
		}
	);
}

/**
 * Заполняем объект для параметров пользователя по умолчанию
 */
function fillUserSettingsDef() {
	var params = {};
	step(
		function () {
			UserSettingsDef.find({key: {$ne: 'ranks'}}, {_id: 0, key: 1, val: 1, vars: 1}, {lean: true}, this);
		},
		function (err, settings) {
			if (err) {
				return logger.error(err);
			}
			for (var i = settings.length; i--;) {
				params[settings[i].key] = settings[i].val;
				userSettingsVars[settings[i].key] = settings[i].vars;
			}
			userSettingsDef = params;
		}
	);
}

/**
 * Заполняем объект для возможных званий пользователя
 */
function fillUserRanks() {
	step(
		function () {
			UserSettingsDef.findOne({key: 'ranks'}, {_id: 0, vars: 1}, {lean: true}, this);
		},
		function (err, row) {
			if (err) {
				return logger.error(err);
			}
			for (var i = 0; i < row.vars.length; i++) {
				userRanksHash[row.vars[i]] = 1;
			}
			userRanks = row.vars;
		}
	);
}

module.exports.getClientParams = function () {
	return clientSettings;
};
module.exports.getUserSettingsDef = function () {
	return userSettingsDef;
};
module.exports.getUserSettingsVars = function () {
	return userSettingsVars;
};
module.exports.getUserRanks = function () {
	return userRanks;
};
module.exports.getUserRanksHash = function () {
	return userRanksHash;
};

module.exports.loadController = function (app, db, io) {
	appvar = app;
	appEnv = app.get('appEnv');

	Settings = db.model('Settings');
	UserSettingsDef = db.model('UserSettingsDef');
	fillClientParams();
	fillUserSettingsDef();
	fillUserRanks();

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveClientParams', function () {
			socket.emit('takeClientParams', clientSettings);
		});

		socket.on('giveUserSettingsVars', function () {
			socket.emit('takeUserSettingsVars', userSettingsVars);
		});

		socket.on('giveUserAllRanks', function () {
			socket.emit('takeUserAllRanks', userRanks);
		});
	});
};