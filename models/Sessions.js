'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,

	SessionSchema = new mongoose.Schema({
			key: {type: String, index: {unique: true}},
			stamp: {type: Date, 'default': Date.now, index: {expires: '14d'}},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
			data: {type: Schema.Types.Mixed, 'default': {}}

			/*popdata: {} - поле для данных, которое не должны быть сохранены в базе, например, вручную спопулированные регионы*/
		},
		{
			strict: true //Строгий режим, сохраняет только то, что есть в модели
		}
	);

module.exports.makeModel = function (db) {
	db.model('Session', SessionSchema);
};
