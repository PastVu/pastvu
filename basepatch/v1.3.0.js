'use strict';

var log4js = require('log4js'),
    mongoose = require('mongoose'),
    logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger("systemjs.js");

    //Подписываем всех пользователей на свои фотографии
    saveSystemJSFunc(function pastvuPatch(byNumPerPackage) {
        var startTime = Date.now();
        var relsWithoutObject = {};
        var BULK_SIZE = 1000;
        var subscrIds = [];
        var insertBulk;
        var fullcount;
        var counter;

        // Переименовываем коллекцию отправки уведомлений пользователям
        db.users_noty.drop();
        db.users_subscr_noty.renameCollection('users_noty');

        db.users_objects_rel.drop();

        // На основе коллекции подписки пользвателей делаем коллекцию связки пользователей и фотографий/новостей
        fullcount = db.users_comments_view.count();
        insertBulk = [];
        counter = 0;
        print('Start merging users_comments_view ' + fullcount + ' and users_subscr' + db.users_subscr.count() + ' into users_objects_rel');
        db.users_comments_view.find({}, { _id: 0 }).forEach(function (row) {
            var user_rel = { obj: row.obj, user: row.user, view: row.stamp, comments: row.stamp };
            var user_subscr = db.users_subscr.findOne({ obj: row.obj, user: row.user });

            counter++;

            if (db.photos.findOne({ _id: row.obj }, { _id: 1 })) {
                user_rel.type = 'photo';
            } else if (db.news.findOne({ _id: row.obj }, { _id: 1 })) {
                user_rel.type = 'news';
            }

            if (user_subscr) {
                subscrIds.push(user_subscr._id);
            }

            if (user_rel.type) {
                if (user_subscr && user_subscr.cdate) {
                    user_rel.sbscr_create = user_subscr.cdate;

                    if (user_subscr.ndate) {
                        user_rel.sbscr_noty_change = user_subscr.ndate;
                    }

                    if (user_subscr.noty === true) {
                        user_rel.sbscr_noty = true;
                    }
                }

                insertBulk.push(user_rel);
            } else {
                relsWithoutObject[row.obj] = 1;
            }

            if (insertBulk.length >= BULK_SIZE || counter >= fullcount && insertBulk.length) {
                db.users_objects_rel.insert(insertBulk);
                insertBulk = [];
                print('Inserted ' + counter + ' rels from users_comments_view ' + ((Date.now() - startTime) / 1000 + 's'));
            }
            if (subscrIds.length >= BULK_SIZE || counter >= fullcount && subscrIds.length) {
                print('Removing another ' + BULK_SIZE + ' from users_subscr ' + ((Date.now() - startTime) / 1000 + 's'));
                db.users_subscr.remove({ _id: { $in: subscrIds } });
                subscrIds = [];
            }
        });
        db.users_comments_view.drop();

        fullcount = db.users_subscr.count();
        insertBulk = [];
        counter = 0;
        print('Start inserting from users_subscr ' + fullcount + ' into users_objects_rel');
        db.users_subscr.find({}, { _id: 0 }).forEach(function (row) {
            var user_rel = { obj: row.obj, user: row.user, sbscr_create: row.cdate, sbscr_noty_change: row.ndate };

            counter++;

            if (db.photos.findOne({ _id: row.obj }, { _id: 1 })) {
                user_rel.type = 'photo';
            } else if (db.news.findOne({ _id: row.obj }, { _id: 1 })) {
                user_rel.type = 'news';
            }

            if (user_rel.type) {
                if (row.noty === true) {
                    user_rel.sbscr_noty = true;
                }

                insertBulk.push(user_rel);
            } else {
                relsWithoutObject[row.obj] = 1;
            }

            if (insertBulk.length >= BULK_SIZE || counter >= fullcount && insertBulk.length) {
                db.users_objects_rel.insert(insertBulk);
                insertBulk = [];
                print('Inserted ' + counter + ' rels from users_subscr ' + ((Date.now() - startTime) / 1000 + 's'));
            }
        });
        db.users_subscr.drop();

        print('relsWithoutObject:');
        Object.keys(relsWithoutObject).forEach(function (obj) {
            print(obj);
        });

        print('Building index of users_objects_rel ' + ((Date.now() - startTime) / 1000 + 's'));
        db.users_objects_rel.ensureIndex({ obj: 1 });
        db.users_objects_rel.ensureIndex({ user: 1 });
        db.users_objects_rel.ensureIndex({ obj: 1, user: 1 });

        print('users_objects_rel OK ' + ((Date.now() - startTime) / 1000 + 's'));

        // Проставляем поле 'y' для всех фотографий
        db.photos.find({}, { year: 1, year2: 1 }).forEach(function (photo) {
            db.photos.update({ _id: photo._id }, { $set: { y: photo.year === photo.year2 ? String(photo.year) : photo.year + '—' + photo.year2 } });
        });

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
