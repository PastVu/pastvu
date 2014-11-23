'use strict';

var log4js = require('log4js'),
    mongoose = require('mongoose'),
    logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger("systemjs.js");

    //Подписываем всех пользователей на свои фотографии
    saveSystemJSFunc(function pastvuPatch(byNumPerPackage) {
        var startTime = Date.now();

        // Раньше статус 1 - ожидает публикации. Теперь 1 - на доработке, 2 - ожидает публикации
        db.photos.update({ s: 1 }, { $set: { s: 2 } }, { multi: true });

        // Добавляем причины
        db.reasons.save({
            cid: 0,
            title: 'Свободное описание причины',
            desc: { required: true, min: 5, max: 1000, placeholder: 'Опишите причину' }
        });
        db.reasons.save({ cid: 1, title: 'Нарушение Правил', desc: { required: true, min: 3, max: 1000, label: 'Укажите пункты правил' } });
        db.reasons.save({ cid: 2, title: 'Спам' });
        db.reasons.save({ cid: 3, title: 'Необходимо исправить название' });
        db.reasons.save({ cid: 4, title: 'Необходимо указать источник' });
        db.reasons.save({ cid: 5, title: 'Фотография не соответствует тематике сайта' });
        db.reasons.save({ cid: 6, title: 'Фотография сделана после 2000 года' });
        db.reasons.save({ cid: 7, title: 'Мат, брань или переход на личности' });
        db.reasons.save({ cid: 8, title: 'Не относится к обсуждаемой теме (совсем)' });
        db.reasons.save({ cid: 9, title: 'Удовлетворенная просьба по оформлению' });
        db.reasons.save({
            cid: 10,
            title: 'Дубликат/Повтор',
            desc: { required: true, min: 3, max: 200, label: 'Укажите ссылку на присутствующую на сайте фотографию' }
        });
        db.reasons.save({
            cid: 11,
            title: 'Претензия возможного правообладателя',
            desc: { required: true, min: 5, max: 500, label: 'Суть претензии', placeholder: 'Краткое и емкое описание' }
        });
        db.reasons.save({
            cid: 12,
            title: 'Обоснованная претензия правообладателя',
            desc: { required: true, min: 5, max: 500, label: 'Суть претензии', placeholder: 'Краткое и емкое описание' }
        });
        db.reasons.save({ cid: 13, title: 'По требованию автора фотографии' });

        // Добавляем пользовательские действия с причинами
        db.user_actions.save({
            key: 'comment.remove',
            reasons: [7, 8, 9, 1, 2, 0],
            reason_text: 'Ветка комментариев будет удалена вместе с содержащимися в ней фрагментами<br>Укажите причину и подтвердите операцию'
        });
        db.user_actions.save({
            key: 'comment.remove.own',
            reasons: [0],
            reason_text: 'Комментарий будет удален<br>Укажите причину и подтвердите операцию'
        });
        db.user_actions.save({
            key: 'photo.revision',
            reasons: [3, 4, 0],
            reason_text: 'Фотография будет отправлена на доработку загрузившему её пользователю<br>Укажите, что нужно изменить, чтобы фотография прошла публикацию'
        });
        db.user_actions.save({
            key: 'photo.reject',
            reasons: [5, 10, 6, 1, 2, 0],
            reason_text: 'Фотография будет отклонена<br>Укажите причину'
        });
        db.user_actions.save({
            key: 'photo.deactivate',
            reasons: [11, 10, 5, 6, 1, 2, 0],
            reason_text: 'Фотография будет деактивирована с возможностью обратной активации<br>Укажите причину'
        });
        db.user_actions.save({
            key: 'photo.remove',
            reasons: [12, 13, 10, 5, 6, 1, 2, 0],
            reason_text: 'Фотография будет удалена с возможностью восстановления только администратором<br>Укажите причину'
        });
        db.user_actions.save({
            key: 'photo.restore',
            reasons: [0],
            reason_text: 'Фотография будет восстановлена и станет публичной<br>Укажите причину'
        });

        // Переименовываем key причин удаления комментариев в cid и проставляем cid=0 свободным причинам
        db.comments.update({ 'del.reason.key': { $exists: true } }, { $rename: { 'del.reason.key': 'del.reason.cid' } }, { multi: true });
        db.comments.update({
            'del': { $exists: true },
            'del.reason.cid': { $exists: false }
        }, { $set: { 'del.reason.cid': 0 } }, { multi: true });
        db.comments.update({ 'hist.del.reason.key': { $exists: true } }, { $rename: { 'hist.del.reason.key': 'hist.del.reason.cid' } }, { multi: true });
        db.comments.update({
            'hist.del': { $exists: true },
            'hist.del.reason.cid': { $exists: false }
        }, { $set: { 'hist.del.reason.cid': 0 } }, { multi: true });

        return { message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's' };
    });

    /**
     * Save function to db.system.js
     * @param func
     */
    function saveSystemJSFunc(func) {
        if (!func || !func.name) {
            logger.error('saveSystemJSFunc: function name is not defined');
        }
        db.db.collection('system.js').save(
            {
                _id: func.name,
                value: new mongoose.mongo.Code(func.toString())
            },
            function saveCallback(err) {
                if (err) {
                    logger.error(err);
                }
            }
        );
    }
};
