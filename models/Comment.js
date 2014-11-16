'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

var delInfo = {
		user: {type: Schema.Types.ObjectId, ref: 'User'},
		stamp: {type: Date},
		reason: {
			cid: {type: Number}, //Номер причины удаления из справочника
			desc: {type: String} //Ручное описание причины удаления. Как основное, так и дополнительное в случае cid
		},
		origin: {type: Number}, //Если у удаляемого комментария есть дочерние, проставляем им ссылку (cid) непосредственно удаляемого, в этом случае reason дочерним можно не указывать
		role: {type: Number}, //Реализуемая на момент удаления роль пользователя. Например, если это модератор. При удалении своего комментария без потомков не заполняется
		roleregion: {type: Number} //Регион реализуемой роли
	},
	histSchema = {
		user: {type: Schema.Types.ObjectId, ref: 'User'},
		stamp: {type: Date, 'default': Date.now, required: true},
		frag: {type: Number},
		txt: {type: String},
		txtd: {type: String}, //Текст с подсветкой разницы
		del: { //Некоторые поля удаления из delInfo (остальные непосредственно в histSchema)
			reason: {
				cid: {type: Number},
				desc: {type: String}
			},
			origin: {type: Number}
		},
		restore: {type: Boolean}, //Восстановлен
		role: {type: Number}, //Реализуемая на момент операции роль пользователя. Например, если это модератор
		roleregion: {type: Number} //Регион реализуемой роли
	},
//Комментарии фотографий
	CommentPSchema = new Schema(
		{
			cid: {type: Number, index: {unique: true}},
			obj: {type: Schema.Types.ObjectId, ref: 'Photo', index: true},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
			stamp: {type: Date, 'default': Date.now, required: true, index: true},
			txt: {type: String},
			parent: {type: Number},
			level: {type: Number},
			frag: {type: Boolean},

			geo: {type: [Number], index: '2d'}, //Координаты [lng, lat] фотографии, которой принадлежит комментарий

			//Принадлежность к регионам, так же как в модели фотографий
			//необходимо, чтобы можно было фильтровать комментарии по регионам без запросов фотографйи
			r0: {type: Number, sparse: true},
			r1: {type: Number, sparse: true},
			r2: {type: Number, sparse: true},
			r3: {type: Number, sparse: true},
			r4: {type: Number, sparse: true},
			r5: {type: Number, sparse: true},

			lastChanged: {type: Date}, //Время последнего изменения
			hist: [new Schema(histSchema)],

			del: delInfo, //Удалённый
			hidden: {type: Boolean} //Скрытый комментарий, например, у неактивной фотографии. Не отображается в списке пользователя и не участвует в статистике
		},
		{
			strict: true
		}
	),
//Комментарии новостей
	CommentNSchema = new Schema(
		{
			cid: {type: Number, index: {unique: true}},
			obj: {type: Schema.Types.ObjectId, ref: 'News', index: true},
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true},
			stamp: {type: Date, 'default': Date.now, required: true, index: true},
			txt: {type: String},
			parent: {type: Number},
			level: {type: Number},

			lastChanged: {type: Date}, //Время последнего изменения
			hist: [new Schema(histSchema)],

			del: delInfo //Удалённый
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
