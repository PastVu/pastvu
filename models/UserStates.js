'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Схема отношений пользователя и объекта
var UserObjectRelSchema = new mongoose.Schema(
    {
        obj: { type: Schema.Types.ObjectId, index: true }, // id объекта
        user: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // id пользователя
        type: { type: String }, // Тип объекта

        view: { type: Date }, // Время последнего просмотра самого объекта
        comments: { type: Date }, // Время последнего просмотра комментариев объекта
        ccount_new: { type: Number }, // Кол-во новых комментариев
        sbscr_create: { type: Date }, // Время создания подписки
        sbscr_noty_change: { type: Date }, // Время изменнения значения флага отправки уведомления sbscr_noty
        sbscr_noty: { type: Boolean } // Флаг, что нужно отправить уведомление
    },
    {
        strict: true,
        collection: 'users_objects_rel'
    }
);
// Составной индекс для запроса по объекту и юзеру
UserObjectRelSchema.index({ obj: 1, user: 1 });
// Составной индекс для запроса подписок пользователя
UserObjectRelSchema.index({ user: 1, ccount_new: 1, sbscr_create: 1 });

// Время отправки уведомления пользователю
var UserNotySchema = new mongoose.Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        lastnoty: { type: Date }, // Предыдущая отправка
        nextnoty: { type: Date, index: true } // Следующая отправка. Индексирование для сортировки
    },
    {
        strict: true,
        collection: 'users_noty'
    }
);

// Список "самоопубликованных" снимков без модератора
var UserSelfPublishedPhotosSchema = new mongoose.Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', index: { unique: true } },
        photos: [Schema.Types.ObjectId] // Массив фотографий, которые они опубликовали сами
    },
    {
        strict: true,
        collection: 'users_selfpublished_photos'
    }
);

module.exports.makeModel = function (db) {
    db.model('UserObjectRel', UserObjectRelSchema);
    db.model('UserNoty', UserNotySchema);
    db.model('UserSelfPublishedPhotos', UserSelfPublishedPhotosSchema);
};