'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var NewsSchema = new Schema(
		{
			cid: {type: Number, index: {unique: true}},
			user: {type: Schema.Types.ObjectId, ref: 'User'},
			cdate: {type: Date, 'default': Date.now, required: true}, // Время создания
			pdate: {type: Date, 'default': Date.now, required: true, index: true}, // Время появления новости
			title: {type: String}, // Заголовок
			notice: {type: String}, // Анонс, краткий текст
			txt: {type: String} // Полный текст
		},
		{
			strict: true
		}
	);

module.exports.makeModel = function (db) {
	db.model('News', NewsSchema);
};
