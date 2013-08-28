'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ms = require('ms');

//Время последнего просмотра пользователем комментария объекта
var UserCommentsViewSchema = new mongoose.Schema(
	{
	obj: {type: Schema.Types.ObjectId, index: true},
	user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
	stamp: {type: Date, 'default': Date.now, required: true, index: true}
},
	{
		strict: true,
		collection: 'user_comments_view'
	}
);

module.exports.makeModel = function (db) {
	db.model('UserCommentsView', UserCommentsViewSchema);
};