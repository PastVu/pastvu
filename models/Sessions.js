'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,

	SessionSchema = new mongoose.Schema({
			key: {type: String, index: {unique: true}}, //Ключ сессии
			previous: {type: String}, //Ключ предыдущей сессии
			created: {type: Date, 'default': Date.now}, //Время создании сессии
			stamp: {type: Date, 'default': Date.now}, //Время последней активности сессии
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true}, //Ссылка на зарегистрированного пользователя
			anonym: require('./User').AnonymScheme, //Объект анонимного пользователя, сохраняется непосредственно в сессию
			data: {type: Schema.Types.Mixed, 'default': {}} //Данные сессии
		},
		{
			collection: 'sessions',
			strict: true //Строгий режим, сохраняет только то, что есть в модели
		}
	),
	SessionArchiveSchema = new mongoose.Schema({
			key: {type: String, index: {unique: true}}, //Ключ сессии
			previous: {type: String}, //Ключ предыдущей сессии
			created: {type: Date, 'default': Date.now}, //Время создании сессии
			stamp: {type: Date, 'default': Date.now}, //Время последней активности сессии
			archived: {type: Date, 'default': Date.now}, //Время архивации сессии
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true}, //Ссылка на зарегистрированного пользователя
			anonym: require('./User').AnonymScheme, //Объект анонимного пользователя, сохраняется непосредственно в сессию
			data: {type: Schema.Types.Mixed, 'default': {}} //Данные сессии
		},
		{
			collection: 'sessions_archive',
			strict: true //Строгий режим, сохраняет только то, что есть в модели
		}
	);

module.exports.makeModel = function (db) {
	db.model('Session', SessionSchema);
	db.model('SessionArchive', SessionArchiveSchema);
};