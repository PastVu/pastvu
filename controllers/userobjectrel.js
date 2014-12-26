'use strict';

var Bluebird = require('bluebird');
var _ = require('lodash');
var UserObjectRel;
var User;
var Comment;
var CommentN;

/**
 * Находим количество новых комментариев для списка объектов для пользователя
 * @param objIds Массив _id объектов
 * @param userId _id пользователя
 * @param type Тип объекта
 * @param [rels] Уже выбранные записи (например в отдаче подписок пользователя)
 */
var getRel = function (objIds, userId, type, rels) {
    var objIdsWithCounts = [];
    var relHash = Object.create(null);
    var promise = rels ? Bluebird.resolve(rels) : UserObjectRel.findAsync(
        { obj: { $in: objIds }, user: userId },
        { _id: 0, obj: 1, view: 1, comments: 1, sbscr_create: 1 },
        { lean: true }
    );

    return promise.then(function (rels) {
        var commentModel = type === 'news' ? CommentN : Comment;
        var promises = [];
        var rel;
        var i;

        // Собираем хеш { idPhoto: stamp }
        for (i = rels.length; i--;) {
            relHash[rels[i].obj] = rels[i];
        }

        // Запоняем массив id объектов теми у которых действительно просмотры пользователем,
        // и по каждому считаем кол-во комментариев с этого посещения
        for (i = objIds.length; i--;) {
            rel = relHash[objIds[i]];
            if (rel && rel.comments) {
                objIdsWithCounts[rel.obj] = 1;
                promises.push(commentModel.countAsync({ obj: rel.obj, del: null, stamp: { $gt: rel.comments }, user: { $ne: userId } }));
            }
        }

        return Bluebird.all(promises);
    })
        .then(function (counts) {
            var countsHash = {};
            var result = {};
            var res;
            var rel;
            var i;

            // Собираем объекты, имеющие новые комментарии
            for (i = 0; i < objIdsWithCounts.length; i++) {
                countsHash[objIdsWithCounts[i]] = counts[i] || 0;
            }

            for (i in relHash) {
                rel = relHash[i];
                res = {
                    view: rel.view,
                    ccount_new: countsHash[i]
                };
                if (rel.sbscr_create) {
                    res.subscr = true;
                }
                result[i] = res;
            }

            return result;
        });
};

/**
 * Заполняет для каждого из массива переданных объектов кол-во новых комментариев - поле ccount_new
 * И флаг changed, если изменился ucdate с момента последнего просмотра объекта
 * Т.е. модифицирует исходные объекты
 * @param objs Массив объектов
 * @param userId _id пользователя
 * @param type Тип объекта
 */
var fillObjectByRels = function (objs, userId, type, rels) {
    var single = !Array.isArray(objs);
    var objIds = [];

    if (single) {
        objs = [objs];
    }

    // Составляем массив id объектов
    for (var i = objs.length; i--;) {
        objIds.push(objs[i]._id);
    }

    return getRel(objIds, userId, type, rels)
        .then(function (relHash) {
            var obj;
            var rel;

            for (var i = objs.length; i--;) {
                obj = objs[i];
                rel = relHash[obj._id];
                if (rel !== undefined) {
                    if (rel.view && obj.ucdate && rel.view > obj.ucdate) {
                        obj.changed = true;
                    }
                    if (rel.subscr) {
                        obj.subscr = true;
                    }
                    if (rel.ccount_new) {
                        obj.ccount_new = rel.ccount_new;
                    }
                }
            }
            return single ? objs[0] : objs;
        });
};


/**
 * Находим количество новых комментариев для формирования письма уведомления пользователю
 * @param objs Массив _id объектов
 * @param relHash
 * @param userId _id пользователя
 * @param [type] Тип объекта
 */
function getNewCommentsBrief(objs, relHash, userId, type) {
    if (_.isEmpty(objs)) {
        return [];
    }

    var commentModel = type === 'news' ? CommentN : Comment;
    var promises = [];
    var commentFrom;
    var objId;
    var rel;
    var i;

    // По каждому объекту выбираем комментарии со времени последнего просмотра комментариев или подписки
    for (i = objs.length; i--;) {
        objId = objs[i]._id;
        rel = relHash[objId];
        commentFrom = rel && (rel.comments || rel.sbscr_noty_change || rel.sbscr_create);
        if (!commentFrom) {
            continue;
        }
        promises.push(
            commentModel.find(
                { obj: objId, del: null, stamp: { $gt: commentFrom }, user: { $ne: userId } },
                { _id: 0, obj: 1, user: 1, stamp: 1 },
                { lean: true, sort: { stamp: 1 } })
                .populate({ path: 'user', select: { _id: 0, login: 1, disp: 1 } })
                .execAsync()
        );
    }
    return Bluebird
        .all(promises)
        .then(function (objComments) {
            var briefsHash = objComments.reduce(function (result, comments) {
                result[comments.obj] = comments.reduce(function (brief, comment) {
                    if (comment.stamp > relHash[comments.obj].sbscr_noty_change) {
                        brief.newest++;
                        brief.users[comment.user.login] = comment.user.disp;
                    }
                    return brief;
                }, { unread: comments.length, newest: 0, users: {} });
                return result;
            }, {});

            // Присваиваем каждому объекту его brief
            return _.forEach(objs, function (obj) {
                obj.brief = briefsHash[obj._id];
            });
        });
}


module.exports.loadController = function (app, db, io) {
    User = db.model('User');
    Comment = db.model('Comment');
    CommentN = db.model('CommentN');
    UserObjectRel = db.model('UserObjectRel');
};

module.exports.getViewCommentsRel = getRel;
module.exports.fillObjectByRels = fillObjectByRels;
module.exports.getNewCommentsBrief = getNewCommentsBrief;