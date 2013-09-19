'use strict';

var auth = require('./auth.js'),
	Settings,
	UserSettingsDef,
	UserRanks,
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	logger = require('log4js').getLogger("settings.js"),
	appvar,
	appEnv = {},

	clientSettings,
	userSettingsDef,
	userSettingsVars = {},
	userRanks;

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
			UserSettingsDef.find({}, {_id: 0, key: 1, val: 1, vars: 1}, {lean: true}, this);
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
	var params = {};
	step(
		function () {
			UserRanks.find({}, {_id: 0, key: 1}, {lean: true}, this);
		},
		function (err, ranks) {
			if (err) {
				return logger.error(err);
			}
			for (var i = ranks.length; i--;) {
				params[ranks[i].key] = 1;
			}
			userRanks = params;
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

module.exports.loadController = function (app, db, io) {
	appvar = app;
	appEnv = app.get('appEnv');

	Settings = db.model('Settings');
	UserSettingsDef = db.model('UserSettingsDef');
	UserRanks = db.model('UserRanks');
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