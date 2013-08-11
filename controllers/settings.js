'use strict';

var auth = require('./auth.js'),
	Settings,
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	logger = require('log4js').getLogger("settings.js"),
	appvar,
	appEnv = {},

	clientSettings;

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

module.exports.getClientParams = function () {
	return clientSettings;
};

module.exports.loadController = function (app, db, io) {
	appvar = app;
	appEnv = app.get('appEnv');

	Settings = db.model('Settings');
	fillClientParams();

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveClientParams', function () {
			socket.emit('takeClientParams', clientSettings);
		});
	});
};