/*global*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	//Подписываем всех пользователей на свои фотографии
	saveSystemJSFunc(function pastvuPatch(byNumPerPackage) {
		byNumPerPackage = byNumPerPackage || 2000;

		var startTime = Date.now(),
			selectFields = {_id: 1, user: 1},
			owners = db.users.find({role: 11}, {_id: 1}).toArray(),
			iterator = function (photo) {
				db.users_subscr.save({obj: photo._id, user: photo.user, type : 'photo'});
			};

		print('Start to subscribe ' + db.photos.count() + ' public photos');
		db.photos.find({}, selectFields).sort({adate: 1}).forEach(iterator);

		print('Start to subscribe ' + db.photos_disabled.count() + ' disabled photos');
		db.photos_disabled.find({}, selectFields).sort({adate: 1}).forEach(iterator);

		print('Start to subscribe ' + db.photos_del.count() + ' deleted photos');
		db.photos_del.find({}, selectFields).sort({adate: 1}).forEach(iterator);

		//Подписываем владельцев на все новости
		print('Start to subscribe ' + db.news.count() + ' news');
		db.news.find({}, selectFields).forEach(function (news) {
			var toInsert = [],
				i = owners.length;

			while (i--) {
				toInsert.push({obj: news._id, user: owners[i]._id, type : 'news'});
			}
			db.users_subscr.insert(toInsert);
		});

		//Добавляем настройки
		db.user_settings.save({key: 'subscr_auto_reply', val: true, vars: [true, false], desc: 'Автоподписка при комментировании темы'});
		db.user_settings.save({key: 'subscr_throttle', val: 30000, vars: [5*60*1000, 30*60*1000, 60*60*1000, 6*60*60*1000, 24*60*60*1000], desc: 'Минимальный интервал между отправками письма с уведомлением'});

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
