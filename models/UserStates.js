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

//Подписка пользователя на комментарии
var UserSubscrSchema = new mongoose.Schema(
	{
		obj: {type: Schema.Types.ObjectId, index: true},
		user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
		type: {type: String},
		cdate: {type: Date}, //Время создания подписки
		ndate: {type: Date}, //Время изменнения значения noty
		noty: {type: Boolean}
	},
	{
		strict: true,
		collection: 'users_subscr'
	}
);
UserSubscrSchema.index({obj: 1, user: 1}); //Составной индекс для запроса stamp по объекту и юзеру

//Подписка пользователя на комментарии
var UserSubscrNotySchema = new mongoose.Schema(
	{
		user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
		lastnoty: {type: Date},
		nextnoty: {type: Date, index: true} //Индексирование для сортировки
	},
	{
		strict: true,
		collection: 'users_subscr_noty'
	}
);

module.exports.makeModel = function (db) {
	db.model('UserCommentsView', UserCommentsViewSchema);
	db.model('UserSubscr', UserSubscrSchema);
	db.model('UserSubscrNoty', UserSubscrNotySchema);
};