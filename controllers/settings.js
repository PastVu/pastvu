'use strict';

var auth = require('./auth.js'),
	Settings,
	UserSettingsDef,
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	logger = require('log4js').getLogger("settings.js"),
	appvar,
	appEnv = {},

	clientSettings,
	userSettingsDef,
	userSettingsVars = {};

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
				logger.error(err);
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
				logger.error(err);
			}
			for (var i = settings.length; i--;) {
				params[settings[i].key] = settings[i].val;
				userSettingsVars[settings[i].key] = settings[i].vars;
			}
			userSettingsDef = params;
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

module.exports.loadController = function (app, db, io) {
	appvar = app;
	appEnv = app.get('appEnv');

	Settings = db.model('Settings');
	UserSettingsDef = db.model('UserSettingsDef');
	fillClientParams();
	fillUserSettingsDef();

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveClientParams', function () {
			socket.emit('takeClientParams', clientSettings);
		});

		socket.on('giveUserSettingsVars', function () {
			socket.emit('takeUserSettingsVars', userSettingsVars);
		});
	});
};