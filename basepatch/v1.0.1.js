/*global, print: true, printjson: true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	saveSystemJSFunc(function pastvuPatch() {
		var startTime = Date.now();

		/*//Расчет новых параметров регионов
		regionsCalcBBOX();
		regionsCalcCenter(true);
		regionsCalcPointsNum();
		regionsCalcPolygonsNum();

		//Назначит всем пользователям домашний регион (_id региона в поле regionHome)
		//Если у пользователя есть регионы для фильтрации по умолчанию - берем оттуда первый. Если нет - Москву
		var mskId = db.regions.findOne({cid: 3}, {_id: 1})._id,
			setId;
		print('Filling regionHome for ' + db.users.count() + ' users');
		db.users.find({}, {_id: 0, cid: 1, regions: 1}).forEach(function (user) {
			if (user.regions && user.regions.length) {
				setId = user.regions[0];
			} else {
				setId = mskId;
			}
			db.users.update({cid: user.cid}, {$set: {regionHome: setId}});
		});

		//Добавляем настройку "Регион для фильтрации по умолчанию берётся из домашнего региона"
		db.user_settings.save({key: 'r_as_home', val: false, vars: [true, false], desc: 'Регион для фильтрации по умолчанию берётся из домашнего региона'});*/

		//Trim названий всех регионов
		print('Trim ' + db.regions.count() + ' regions titles ');
		db.regions.find({}, {_id: 0, cid: 1, title_en: 1, title_local: 1}).forEach(function (region) {
			db.regions.update({cid: region.cid}, {$set: {title_en: region.title_en.trim(), title_local: region.title_local.trim()}});
		});

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
