/*global, print: true, printjson: true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	//Создаем звания пользователей
	saveSystemJSFunc(function pastvuPatch() {
		var startTime = Date.now();

		db.user_ranks.save({key: 'mec', desc: 'Меценат'});
		db.user_ranks.save({key: 'mec_silv', desc: 'Меценат серебряный'});
		db.user_ranks.save({key: 'mec_gold', desc: 'Меценат золотой'});

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
