'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	ms = require('ms');

//Время последнего просмотра пользователем комментария объекта
var UserCommentsViewSchema = new mongoose.Schema(
	{
		obj: {type: Schema.Types.ObjectId},
		user: {type: Schema.Types.ObjectId, ref: 'User'},
		stamp: {type: Date, 'default': Date.now, required: true}
	},
	{
		strict: true,
		collection: 'users_comments_view'
	}
);
UserCommentsViewSchema.index({obj: 1, user: 1}); //Составной индекс для запроса stamp по объекту и юзеру

module.exports.makeModel = function (db) {
	db.model('UserCommentsView', UserCommentsViewSchema);
};