'use strict';

var fs = require('fs'),
    _ = require('lodash'),
    path = require('path'),
    jade = require('jade'),
    Bluebird = require('bluebird'),
    _session = require('./_session.js'),
    settings = require('./settings.js'),
    Settings,
    User,
    UserObjectRel,
    UserNoty,
    News,
    Photo,
    Utils = require('../commons/Utils.js'),
    logger = require('log4js').getLogger("subscr.js"),
    mailController = require('./mail.js'),
    photoController = require('./photo.js'),
    userObjectRelController = require('./userobjectrel'),

    msg = {
        deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
        noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
        nouser: 'Requested user does not exist'
    },

    noticeTpl,

    declension = {
        comment: [' новый комментарий', ' новых комментария', ' новых комментариев'],
        commentUnread: [' непрочитанный', ' непрочитанных', ' непрочитанных']
    },

    sendFreq = 1500, //Частота шага конвейера отправки в ms
    sendPerStep = 10; //Кол-во отправляемых уведомлений за шаг конвейера

/**
 * Подписка/Отписка объекта (внешняя, для текущего пользователя по cid объекта)
 * @param iAm
 * @param data
 */
function subscribeUser(iAm, data) {
    if (!iAm.registered) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data) || !Number(data.cid)) {
        throw { message: 'Bad params' };
    }

    var cid = Number(data.cid);
    var promise;

    if (data.type === 'news') {
        promise = News.findOneAsync({ cid: cid }, { _id: 1 });
    } else {
        promise = photoController.findPhoto({ cid: cid }, null, iAm);
    }

    return promise
        .then(function (obj) {
            if (!obj) {
                throw { message: msg.noObject };
            }
            if (data.do) {
                // TODO: Подумать, что делать с новыми комментариями появившимися после просмотра объекта, но до подписки
                return UserObjectRel.updateAsync(
                    { obj: obj._id, user: iAm.user._id, type: data.type },
                    { $set: { sbscr_create: new Date() } },
                    { upsert: true }
                );
            } else {
                return UserObjectRel.updateAsync(
                    { obj: obj._id, user: iAm.user._id, type: data.type },
                    { $unset: { sbscr_create: 1, sbscr_noty_change: 1, sbscr_noty: 1 } }
                );
            }
        })
        .then(function () {
            return { subscr: data.do };
        });
}

/**
 * Подписка объекта по id пользователя и объекта (внутренняя, например, после подтверждения фото)
 * @param userId
 * @param objId
 * @param type
 */
function subscribeUserByIds(userId, objId, type) {
    return UserObjectRel.updateAsync(
        { obj: objId, user: userId, type: type },
        { $set: { sbscr_create: new Date() } },
        { upsert: true }
    )
        .catch(function (err) {
            logger.error(err.message);
            return null;
        });
}

/**
 * Удаляет подписки на объект, если указан _id пользователя, то только его подписку
 * @param objId
 * @param [userId] Опционально. Без этого параметра удалит подписки на объект у всех пользователей
 */
function unSubscribeObj(objId, userId) {
    var query = { obj: objId };
    if (userId) {
        query.user = userId;
    }
    return UserObjectRel.updateAsync(query, { $unset: { sbscr_create: 1, sbscr_noty_change: 1, sbscr_noty: 1 } });
}

/**
 * Устанавливает готовность уведомления для объекта по событию добавления комментария
 * @param objId
 * @param user
 */
function commentAdded(objId, user, stamp) {
    if (!stamp) {
        stamp = new Date();
    }

    // Находим всех пользователей, кроме создающего, подписанных на комментарии объекта, но еще не ожидающих уведомления
    return UserObjectRel.findAsync(
        { obj: objId, user: { $ne: user._id }, sbscr_create: { $exists: true }, sbscr_noty: { $exists: false } },
        { _id: 1, user: 1 },
        { lean: true }
    )
        .bind({})
        .then(function (objs) {
            if (_.isEmpty(objs)) {
                return []; // Если никто на этот объект не подписан - выходим
            }
            this.users = [];
            var ids = [];

            for (var i = objs.length; i--;) {
                ids.push(objs[i]._id);
                this.users.push(objs[i].user);
            }

            // Устанавливаем флаг готовности уведомления по объекту, для подписанных пользователей
            return UserObjectRel.updateAsync(
                { _id: { $in: ids } },
                { $set: { sbscr_noty_change: stamp, sbscr_noty: true } },
                { multi: true }
            );
        })
        .then(function () {
            // Вызываем планировщик отправки уведомлений для подписанных пользователей
            scheduleUserNotice(this.users);
            return this.users;
        });
}

/**
 * Устанавливает объект комментариев как просмотренный, т.е. ненужный для уведомления
 * @param objId
 * @param user
 * @param [setInRel]
 */
function commentViewed(objId, user, setInRel) {
    var promise;

    if (setInRel) {
        promise = UserObjectRel.updateAsync(
            { obj: objId, user: user._id },
            { $unset: { sbscr_noty: 1 }, $set: { sbscr_noty_change: new Date() } },
            { upsert: false }
        )
            .spread(function (numberAffected) {
                return numberAffected;
            });
    } else {
        promise = Bluebird.resolve();
    }

    return promise
        .then(function (numberAffected) {
            if (numberAffected === 0) {
                return;
            }
            // Считаем кол-во оставшихся готовых к отправке уведомлений для пользователя
            return UserObjectRel.countAsync({ user: user._id, sbscr_noty: true });
        })
        .then(function (count) {
            if (count === 0) {
                // Если уведомлений, готовых к отправке больше нет, то сбрасываем запланированное уведомление для пользователя
                UserNoty.update({ user: user._id }, { $unset: { nextnoty: 1 } }).exec();
            }
        });
}

/**
 * При изменении пользователем своего throttle, надо поменять время заплонированной отправки, если оно есть
 * @param userId
 * @param newThrottle
 */
function userThrottleChange(userId, newThrottle) {
    if (!newThrottle) {
        return;
    }
    UserNoty.findOne({ user: userId, nextnoty: { $exists: true } }, { _id: 0 }, { lean: true }, function (err, userNoty) {
        if (err) {
            return logger.error(err.message);
        }
        if (!userNoty) {
            return;
        }
        var newNextNoty;
        var nearestNoticeTimeStamp = Date.now() + 10000;

        if (userNoty.lastnoty && userNoty.lastnoty.getTime) {
            newNextNoty = Math.max(userNoty.lastnoty.getTime() + newThrottle, nearestNoticeTimeStamp);
        } else {
            newNextNoty = nearestNoticeTimeStamp;
        }

        UserNoty.update({ user: userId }, { $set: { nextnoty: new Date(newNextNoty) } }).exec();
    });
}

/**
 * Планируем отправку уведомлений для пользователей
 * @param users Массив _id пользователй
 */
function scheduleUserNotice(users) {
    return Bluebird.join(
        // Находим для каждого пользователя параметр throttle
        User.findAsync({ _id: { $in: users } }, { _id: 1, 'settings.subscr_throttle': 1 }, { lean: true }),
        // Находим noty пользователей из списка, и берем даже запланированных,
        // если их не возьмем, то не сможем понять, кто уже запланирован, а кто первый раз планируется
        UserNoty.findAsync({ user: { $in: users } }, { _id: 0 }, { lean: true })
    )
        .spread(function (usersThrottle, usersNoty) {
            var usersNotyHash = {};
            var usersTrottleHash = {};
            var defThrottle = settings.getUserSettingsDef().subscr_throttle;
            var nearestNoticeTimeStamp = Date.now() + 10000; // Ближайшее уведомление для пользователей, у которых не было предыдущих
            var lastnoty;
            var nextnoty;
            var userId;
            var i;

            for (i = usersThrottle.length; i--;) {
                usersTrottleHash[usersThrottle[i]._id] = usersThrottle[i].settings && usersThrottle[i].settings.subscr_throttle;
            }

            for (i = usersNoty.length; i--;) {
                if (usersNoty[i].nextnoty) {
                    // Значит у этого пользователя уже запланированно уведомление и ничего делать не надо
                    usersNotyHash[usersNoty[i].user] = false;
                } else {
                    // Если у пользователя еще не установленно время следующего уведомления, расчитываем его
                    lastnoty = usersNoty[i].lastnoty;

                    // Если прошлого уведомления еще не было или с его момента прошло больше времени,
                    // чем throttle пользователя или осталось менее 10сек, ставим ближайший
                    if (lastnoty && lastnoty.getTime) {
                        nextnoty = Math.max(lastnoty.getTime() + (usersTrottleHash[usersNoty[i].user] || defThrottle), nearestNoticeTimeStamp);
                    } else {
                        nextnoty = nearestNoticeTimeStamp;
                    }
                    usersNotyHash[usersNoty[i].user] = nextnoty;
                }
            }

            for (i = users.length; i--;) {
                userId = users[i];
                if (usersNotyHash[userId] !== false) {
                    UserNoty.update(
                        { user: userId },
                        { $set: { nextnoty: new Date(usersNotyHash[userId] || nearestNoticeTimeStamp) } },
                        { upsert: true }
                    ).exec();
                }
            }
        })
        .catch(function (err) {
            logger.error(err.message);
        });
}

// Конвейер отправки уведомлений
// Каждые sendFreq ms отправляем sendPerStep уведомлений
var notifierConveyer = (function () {
    function conveyerStep() {
        // Находим уведомления, у которых прошло время nextnoty
        UserNoty.findAsync(
            { nextnoty: { $lte: new Date() } },
            { _id: 0 },
            { lean: true, limit: sendPerStep, sort: { nextnoty: 1 } }
        )
            .bind({})
            .then(function (usersNoty) {
                if (_.isEmpty(usersNoty)) {
                    throw { code: 'EMPTY' };
                }
                this.userIds = [];
                this.nowDate = new Date();

                return Bluebird.all(usersNoty.map(function (noty) {
                    this.userIds.push(noty.user);
                    return sendUserNotice(noty.user, noty.lastnoty);
                }, this));
            })
            .then(function () {
                return UserNoty.updateAsync(
                    { user: { $in: this.userIds } },
                    { $set: { lastnoty: this.nowDate }, $unset: { nextnoty: 1 } },
                    { multi: true }
                );
            })
            .catch(function (err) {
                if (err.code !== 'EMPTY') {
                    logger.error(err.message);
                }
                return null;
            })
            .then(function () {
                return notifierConveyer();
            });
    }

    return function () {
        setTimeout(conveyerStep, sendFreq);
    };
}());

/**
 * Формируем письмо для пользователя из готовых уведомлений (noty: true) и отправляем его
 * @param userId
 * @param lastsend Время прошлой отправки уведомления пользователя для подсчета кол-ва новых
 */
function sendUserNotice(userId, lastsend) {
    var userObj = _session.getOnline(null, userId);
    var promise = userObj ?
        Bluebird.resolve(userObj.user) :
        User.findOneAsync({ _id: userId }, { _id: 1, login: 1, disp: 1, email: 1 }, { lean: true });

    return promise
        .bind({})
        .then(function (user) {
            if (!user) {
                throw { message: msg.nouser };
            }
            this.user = user;

            // Ищем все готовые к уведомлению (sbscr_noty: true) подписки пользователя
            return UserObjectRel.findAsync(
                { user: userId, sbscr_noty: true },
                { user: 0, sbscr_noty: 0 },
                { lean: true }
            );
        })
        .then(function (rels) {
            if (_.isEmpty(rels)) {
                throw { code: 'EMPTY' };
            }

            this.relIds = []; // Массив _id уведомлений, который мы обработаем и сбросим в случае успеха отправки

            var objsIdPhotos = [];
            var objsIdNews = [];
            var promises = {};
            var relHash = {};
            var rel;

            for (var i = rels.length; i--;) {
                rel = rels[i];
                relHash[rel.obj] = rel;

                this.relIds.push(rel._id);
                if (rel.type === 'news') {
                    objsIdNews.push(rel.obj);
                } else {
                    objsIdPhotos.push(rel.obj);
                }
            }

            // Выбираем каждый объект и кол-во непрочитанных и новых комментариев по нему
            if (objsIdNews.length) {
                promises.news = News
                    .findAsync({ _id: { $in: objsIdNews }, ccount: { $gt: 0 } }, { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true })
                    .then(function (news) {
                        return userObjectRelController.getNewCommentsBrief(news, relHash, userId, 'news');
                    });
            }
            if (objsIdPhotos.length) {
                promises.photos = Photo
                    .findAsync({ _id: { $in: objsIdPhotos }, ccount: { $gt: 0 } }, { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true })
                    .then(function (photos) {
                        return userObjectRelController.getNewCommentsBrief(photos, relHash, userId);
                    });
            }

            return Bluebird.props(promises);
        })
        .then(function (result) {
            var photos = result.photos || [];
            var news = result.news || [];

            if (_.isEmpty(news) && _.isEmpty(photos)) {
                throw { code: 'EMPTY' };
            }

            var totalNewestComments = 0;
            var photosResult = [];
            var newsResult = [];
            var obj;
            var i;

            // Оставляем только те объекты, у который кол-во новых действительно есть.
            // Если пользователь успел зайти в объект, например, в период выполнения этого шага конвейера,
            // то новые обнулятся и уведомлять об этом объекте уже не нужно
            for (i = news.length; i--;) {
                obj = news[i];
                if (obj.brief && obj.brief.newest) {
                    totalNewestComments += obj.brief.newest;
                    newsResult.push(objProcess(obj));
                }
            }
            for (i = photos.length; i--;) {
                obj = photos[i];
                if (obj.brief && obj.brief.newest) {
                    totalNewestComments += obj.brief.newest;
                    photosResult.push(objProcess(obj));
                }
            }

            function objProcess(obj) {
                obj.briefFormat = {};
                obj.briefFormat.newest = obj.brief.newest + Utils.format.wordEndOfNum(obj.brief.newest, declension.comment);
                if (obj.brief.newest !== obj.brief.unread) {
                    obj.briefFormat.unread = obj.brief.unread + Utils.format.wordEndOfNum(obj.brief.unread, declension.commentUnread);
                }
                return obj;
            }

            if (newsResult.length || photosResult.length) {
                //Отправляем письмо с уведомлением, только если есть новые комментарии

                //Сортируем по количеству новых комментариев
                newsResult.sort(sortNotice);
                photosResult.sort(sortNotice);

                return mailController.send(
                    {
                        sender: 'noreply',
                        receiver: { alias: String(this.user.disp), email: this.user.email },
                        subject: 'Новое уведомление',
                        head: true,
                        body: noticeTpl({
                            username: String(this.user.disp),
                            greeting: 'Уведомление о событиях на PastVu',
                            addr: global.appVar.serverAddr,
                            user: this.user,
                            news: newsResult,
                            photos: photosResult
                        }),
                        text: totalNewestComments + (totalNewestComments === 1 ? ' новый коментарий' : ' новых ' + (totalNewestComments < 5 ? 'комментария' : 'комментариев'))
                    }
                );
            } else {
                throw { code: 'EMPTY' };
            }
        })
        .catch(function (err) {
            if (err.code === 'EMPTY') {
                return null;
            }
            throw err;
        })
        .then(function () {
            if (!_.isEmpty(this.relIds)) {
                // Сбрасываем флаг готовности к уведомлению (sbscr_noty) у всех отправленных объектов
                UserObjectRel.update(
                    { _id: { $in: this.relIds } },
                    { $unset: { sbscr_noty: 1 }, $set: { sbscr_noty_change: new Date() } },
                    { multi: true }
                ).exec();
            }
        });
}
function sortNotice(a, b) {
    return a.brief.newest < b.brief.newest ? 1 : (a.brief.newest > b.brief.newest ? -1 : 0);
}

var subscrPerPage = 24;
function sortSubscr(a, b) {
    var a_date = a.sbscr_create;
    var b_date = b.sbscr_create;
    return a_date < b_date ? 1 : a_date > b_date ? -1 : 0;
}
// Отдача постраничного списка подписанных объектов пользователя
var getUserSubscr = Bluebird.method(function (iAm, data) {
    if (!_.isObject(data)) {
        throw { message: 'Bad params' };
    }
    if (!iAm.registered || iAm.user.login !== data.login && !iAm.isAdmin) {
        throw { message: msg.deny };
    }

    var page = (Math.abs(Number(data.page)) || 1) - 1;
    var skip = page * subscrPerPage;

    return User.getUserID(data.login)
        .bind({})
        .then(function (user_id) {
            if (!user_id) {
                throw { message: msg.nouser };
            }

            this.user_id = user_id;

            return UserObjectRel.findAsync(
                { user: user_id, type: data.type, sbscr_create: { $exists: true } },
                { _id: 0, user: 0, type: 0, sbscr_noty_change: 0 },
                { lean: true, skip: skip, limit: subscrPerPage, sort: { sbscr_create: -1 } });
        })
        .then(function (rels) {
            if (!rels || !rels.length) {
                return;
            }
            this.rels = rels;

            var query;
            var objIds = [];

            this.relHash = {};

            for (var i = rels.length; i--;) {
                this.relHash[rels[i].obj] = rels[i];
                objIds.push(rels[i].obj);
            }

            if (data.type === 'news') {
                return News.findAsync({ _id: { $in: objIds } }, { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true });
            } else {
                query = photoController.buildPhotosQuery({ r: 0 }, null, iAm).query;
                query._id = { $in: objIds };
                return Photo.findAsync(query, { _id: 1, cid: 1, title: 1, ccount: 1, file: 1 }, { lean: true });
            }
        })
        .then(function (objs) {
            if (!objs || !objs.length) {
                return [];
            }

            return Bluebird.join(
                // Ищем кол-во новых комментариев для каждого объекта
                userObjectRelController.fillObjectByRels(objs, this.user_id, data.type, this.rels),
                // Считаем общее кол-во фотографий в подписках
                UserObjectRel.countAsync({ user: this.user_id, type: 'photo', sbscr_create: { $exists: true } }),
                // Считаем общее кол-во новостей в подписках
                UserObjectRel.countAsync({ user: this.user_id, type: 'news', sbscr_create: { $exists: true } }),
                // Берем время следующего запланированного уведомления
                UserNoty.findOneAsync({ user: this.user_id, nextnoty: { $exists: true } }, { _id: 0, nextnoty: 1 }, { lean: true })
            );
        })
        .spread(function (objs, countPhoto, countNews, nextNoty) {
            var obj;
            var rel;

            for (var i = objs.length; i--;) {
                obj = objs[i];
                rel = this.relHash[obj._id];

                if (rel.sbscr_noty) {
                    obj.sbscr_noty = true;
                }
                obj.sbscr_create = rel.sbscr_create.getTime();

                delete obj.subscr;
                delete obj._id;
            }
            objs.sort(sortSubscr);

            return {
                subscr: objs,
                countPhoto: countPhoto || 0,
                countNews: countNews || 0,
                nextNoty: nextNoty && nextNoty.nextnoty,
                page: page + 1,
                perPage: subscrPerPage,
                type: data.type
            };
        });
});


module.exports.loadController = function (app, db, io) {
    Settings = db.model('Settings');
    User = db.model('User');
    UserObjectRel = db.model('UserObjectRel');
    UserNoty = db.model('UserNoty');
    News = db.model('News');
    Photo = db.model('Photo');

    fs.readFile(path.normalize('./views/mail/notice.jade'), 'utf-8', function (err, data) {
        if (err) {
            return logger.error('Notice jade read error: ' + err.message);
        }
        noticeTpl = jade.compile(data, { filename: path.normalize('./views/mail/notice.jade'), pretty: false });
        notifierConveyer();
    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        socket.on('subscr', function (data) {
            subscribeUser(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('subscrResult', resultData);
                });
        });
        socket.on('giveUserSubscr', function (data) {
            getUserSubscr(hs.usObj, data)
                .catch(function (err) {
                    logger.error(err);
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserSubscr', resultData);
                });
        });
    });
};
module.exports.subscribeUserByIds = subscribeUserByIds;
module.exports.unSubscribeObj = unSubscribeObj;
module.exports.commentAdded = commentAdded;
module.exports.commentViewed = commentViewed;
module.exports.userThrottleChange = userThrottleChange;