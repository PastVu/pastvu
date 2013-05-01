'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var CommentSheme = new mongoose.Schema(
	{
		cid: {type: Number, index: { unique: true }},
		photo: {type: Schema.Types.ObjectId, ref: 'Photo', index: true},
		user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
		stamp: {type: Date, 'default': Date.now, required: true, index: true},
		txt: {type: String},
		parent: {type: Number},
		level: {type: Number},
		frag: {type: Boolean}
	},
	{
		strict: true
	}
);
CommentSheme.index({ user: 1, stamp: -1 }); // Составной индекс для запроса комментариев пользователя
//CommentSheme.index({ photo: 1, stamp: 1 }); // Составной индекс для запроса комментариев фотографии. (Пока не нужен)

module.exports.makeModel = function (db) {
	db.model('Comment', CommentSheme);
};
