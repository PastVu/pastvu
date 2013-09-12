'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

//Настройки пользователя
var UserSettingsDefSchema = new mongoose.Schema(
	{
		key: {type: String, lowercase: true, index: {unique: true}},
		val: {type: Schema.Types.Mixed}, //Значение по умолчанию
		vars: {type: Schema.Types.Mixed}, //Справочник возможных значений, если нужен
		desc: {type: String, default: ''}
	},
	{
		strict: true,
		collection: 'user_settings'
	}
);

module.exports.makeModel = function (db) {
	db.model('UserSettingsDef', UserSettingsDefSchema);
};