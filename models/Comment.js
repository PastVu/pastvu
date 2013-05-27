'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var histScheme = {
		user: {type: Schema.Types.ObjectId, ref: 'User'},
		stamp: {type: Date, 'default': Date.now, required: true},
		frag: {type: Number},
		txt: {type: String}
	},
	CommentPSchema = new Schema(
		{
			cid: {type: Number, index: { unique: true }},
			obj: {type: Schema.Types.ObjectId, ref: 'Photo', index: true},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
			stamp: {type: Date, 'default': Date.now, required: true, index: true},
			txt: {type: String},
			parent: {type: Number},
			level: {type: Number},
			frag: {type: Boolean},

			lastChanged: {type: Date}, //Время последнего редактирования
			hist: [new Schema(histScheme)]
		},
		{
			strict: true
		}
	),
//Комментарии новостей
	CommentNSchema = new Schema(
		{
			cid: {type: Number, index: { unique: true }},
			obj: {type: Schema.Types.ObjectId, ref: 'News', index: true},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
			stamp: {type: Date, 'default': Date.now, required: true, index: true},
			txt: {type: String},
			parent: {type: Number},
			level: {type: Number},

			lastChanged: {type: Date}, //Время последнего редактирования
			hist: [new Schema(histScheme)]
		},
		{
			strict: true,
			collection: 'commentsn'
		}
	);

CommentPSchema.index({ user: 1, stamp: -1 }); // Составной индекс для запроса комментариев фотографий пользователя
//CommentSchema.index({ photo: 1, stamp: 1 }); // Составной индекс для запроса комментариев фотографии. (Пока не нужен)

module.exports.makeModel = function (db) {
	db.model('Comment', CommentPSchema);
	db.model('CommentN', CommentNSchema);
};
