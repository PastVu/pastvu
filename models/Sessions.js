'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,

	SessionSchema = new mongoose.Schema({
			key: {type: String, index: {unique: true}},
			stamp: {type: Date, 'default': Date.now, index: {expires: '30d'}},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true}, //Ссылка на зарегистрированного пользователя
			anonym: require('./User').AnonymScheme, //Объект анонимного пользователя, сохраняется непосредственно в сессию
			data: {type: Schema.Types.Mixed, 'default': {}},

			regions: [{type: Schema.Types.ObjectId, ref: 'Region'}]

			/*popdata: {} - поле для данных, которое не должны быть сохранены в базе, например, вручную спопулированные регионы*/
		},
		{
			strict: true //Строгий режим, сохраняет только то, что есть в модели
		}
	);

module.exports.makeModel = function (db) {
	db.model('Session', SessionSchema);
};
