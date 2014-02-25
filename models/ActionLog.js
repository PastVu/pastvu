'use strict';

var mongoose = require('mongoose'),
	Schema = mongoose.Schema;

//Модель логирования действий пользователей
var ActionLogSchema = new Schema(
		{
			user: {type: Schema.Types.ObjectId, ref: 'User', index: true}, //Субъект действия
			stamp: {type: Date, 'default': Date.now, required: true}, //Время действия

			obj: {type: Schema.Types.ObjectId, index: true}, //Объект действия
			objtype: {type: Number, index: true}, //Тип объекта. 1 - пользователь, 2 - фото, 3 - комментарий
			action: {type: Number}, //Тип действия. 1 - создал, 9 - удалил

			reason: {type: String}, //Причина действия
			role: {type: Number}, //Реализуемая на момент действия роль пользователя, если она необходима для действия
			roleregion: {type: Number} //Регион реализуемой роли
		},
		{
			strict: true,
			collection: 'actionlog'
		}
	);

ActionLogSchema.index({user: 1, stamp: -1});
ActionLogSchema.index({obj: 1, stamp: -1});

module.exports.makeModel = function (db) {
	db.model('ActionLog', ActionLogSchema);
};
