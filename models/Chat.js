'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var ChatSchema = new Schema(
		{
			cid: {type: Number, required: true, index: true},
			create: {type: Date, 'default': Date.now, required: true}, //Время создания чата
			last: {type: Date, 'default': Date.now, required: true, index: true}, //Время последней записи в чате
			multi: {type: Boolean}, //Флаг, что это мульти-чат
			closed: {type: Boolean}, //Флаг, что мультичат закрыт владельцем
			author: {type: Schema.Types.ObjectId, ref: 'User', index: true}, //Автор мультичата (он может его закрыть) или инициатор личной переписки
			members: [ //Текущие участники, которые читают чат
				{type: Schema.Types.ObjectId, ref: 'User'}
			],
			members_off: [ //Участники, покинувшие чат, но имеющие возможность самостоятельно присоединиться
				{type: Schema.Types.ObjectId, ref: 'User'}
			],
			members_del: [ //Удаленные владельцем участники, не могут вернуться сами
				{type: Schema.Types.ObjectId, ref: 'User'}
			]
		},
		{collection: 'chats', strict: true}
	),
	ChatRecordSchema = new Schema(
		{
			chat_cid: {type: Number, required: true, sparse: true},
			stamp: {type: Date, required: true, 'default': Date.now, index: true}, //Время записи
			type: {type: String, required: true, 'default': 'message'}, //Тип сообщения: 'message', 'action'

			from: {type: Schema.Types.ObjectId, ref: 'User'}, //Инициатор записи
			to: [new Schema({ //Получатели сообщения
				user: {type: Schema.Types.ObjectId, ref: 'User'},
				read: {type: Date}, //Время прочтения записи пользователем
				del: {type: Boolean} //Флаг, что запись удалена пользователем и он эту запись больше не видит
			})],
			txt: {type: String}, //Текст сообщения, если тип 'message'
			action: {type: Schema.Types.Mixed} //Информация о действии, если тип 'action'
		},
		{collection: 'chats_records', strict: true}
	);

ChatSchema.index({'members': 1});
ChatSchema.index({'members_off': 1});
ChatRecordSchema.index({'to.user': 1});

module.exports.makeModel = function (db) {
	db.model('Chat', ChatSchema);
	db.model('ChatRecord', ChatRecordSchema);
};
