'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

//Модель логирования действий пользователей
var ActionLogSchema = new Schema(
		{
			app: {type: String, required: true, index: true}, //Application id
			stamp: {type: Date, 'default': Date.now, required: true}, //Время поступления запроса
			rstamp: {type: Date}, //Время отправки запроса клиентом (параметр stamp)
			rid: {type: String}, //Request id

			method: {type: String, sparse: true}, //Метод api
			data: {type: String}, //Строка параметров data
			error: {type: String} //Возможная строка ошибки
		},
		{
			strict: true,
			collection: 'apilog'
		}
	);

ActionLogSchema.index({user: 1, stamp: -1});
ActionLogSchema.index({obj: 1, stamp: -1});

module.exports.makeModel = function (db) {
	db.model('ActionLog', ActionLogSchema);
};
