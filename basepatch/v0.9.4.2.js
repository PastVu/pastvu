/*global, print: true, printjson: true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	//Исправляем ошибку неотправки уведомлений из-за отстутсвия записи в users_comments_view
	//Заполняем users_comments_view (если нет) для всех подписок пользователей
	saveSystemJSFunc(function pastvuPatch() {
		var startTime = Date.now(),
			stampDate = new Date(),
			countBegin = db.users_comments_view.count();

		db.users_subscr.find({}, {_id: 0, obj: 1, user: 1}).forEach(function (subscr) {
			db.users_comments_view.update({obj: subscr.obj, user: subscr.user}, {$setOnInsert: {stamp: stampDate}}, {upsert: true});
		});

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', updated: db.users_comments_view.count() - countBegin};
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
