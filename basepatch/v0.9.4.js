/*global, print: true, printjson: true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	//Подписываем всех пользователей на публичные фотографии, в которых они оставляли комментарии
	saveSystemJSFunc(function pastvuPatch() {
		var startTime = Date.now(),
			usersStat = {},
			calcTime = startTime,
			userArr,
			toInsert;

		print('Start to subscribe ' + db.photos.count({ccount: {$gt: 0}}) + ' public photos with comments');
		db.photos.find({}, {_id: 1, cid: 1, ccount: 1}).sort({cid: 1}).forEach(function (photo) {
			if (photo.ccount) {
				userArr = db.comments.distinct('user', {obj: photo._id});

				if (userArr.length) {
					if (userArr.length > 29) {
						print(photo.cid + ': ' + userArr.length);
					}
					calcTime++;
					toInsert = [];
					usersStat[userArr.length] = (usersStat[userArr.length] || 0) + 1;

					for (var i = userArr.length; i--;) {
						if (!db.users_subscr.findOne({obj: photo._id, user: userArr[i]})) {
							toInsert.push({obj: photo._id, user: userArr[i], type: 'photo', cdate: calcTime});
						}
					}

					if (toInsert.length) {
						db.users_subscr.insert(toInsert);
					}
				}
			}
		});
		print('~~~');
		printjson(usersStat);

		//Добавляем интервал 3 часа и делаем его по умолчанию
		db.user_settings.update({key: 'subscr_throttle'}, {$set: {val: 3*60*60*1000,vars: [5*60*1000, 30*60*1000, 60*60*1000, 3*60*60*1000, 6*60*60*1000, 24*60*60*1000] }});

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
