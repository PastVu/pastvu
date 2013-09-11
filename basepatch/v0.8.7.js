/*global*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	//Присваиваем всем пользователям, у которых заполнен аватар, его заного
	saveSystemJSFunc(function pastvuPatch(byNumPerPackage) {
		byNumPerPackage = byNumPerPackage || 2000;

		var startTime = Date.now(),
			user,
			users = db.users.find({avatar: {$exists: true}}, {login: 1}).sort({cid: -1}).toArray(),
			userCounter = users.length,
			allCount = userCounter,
			allCounter = 0;

		print('Start to ' + allCount + ' users');
		while (userCounter--) {
			user = users[userCounter];

			db.users.update({login: user.login}, {$set: {avatar: user.login + '.png'}});

			allCounter++;
			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				print('Updated ' + allCounter + ' in ' + (Date.now() - startTime) / 1000 + 's');
			}
		}

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's'};
	});

	/**
	 * Save function to db.system.js
	 * @param func
	 */
	function saveSystemJSFunc(func) {
		if (!func || !func.name) {
			logger.error('saveSystemJSFunc: function name is not defined');
		}
		db.db.collection('system.js').save(
			{
				_id: func.name,
				value: new mongoose.mongo.Code(func.toString())
			},
			function saveCallback(err) {
				if (err) {
					logger.error(err);
				}
			}
		);
	}
};
