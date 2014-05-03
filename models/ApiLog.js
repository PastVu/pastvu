'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

//Модель логирования запросов api
var ApiLogSchema = new Schema(
	{
		app: {type: String, required: true, index: true}, //Application id
		stamp: {type: Date, 'default': Date.now, required: true, index: true}, //Время поступления запроса
		ms: {type: Number, index: true}, //Время обработки запроса в ms

		rid: {type: String}, //Request id
		rstamp: {type: Date}, //Время отправки запроса клиентом (параметр stamp)

		method: {type: String}, //Метод api
		data: {type: String}, //Строка параметров data

		status: {type: Number}, //Response http code
		err_code: {type: Number}, //Возможный код ошибки
		err_msg: {type: String} //Возможная строка ошибки
	},
	{
		strict: true,
		collection: 'apilog'
	}
);

module.exports.makeModel = function (db) {
	db.model('ApiLog', ApiLogSchema);
};
