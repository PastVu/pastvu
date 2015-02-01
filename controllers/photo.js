'use strict';

var _session = require('./_session.js'),
    Settings,
    User,
    UserSelfPublishedPhotos,
    Photo,
    PhotoMap,
    PhotoHistory,
    Comment,
    Counter,
    UserObjectRel,
    reasonController = require('./reason.js'),
    regionController = require('./region.js'),
    PhotoCluster = require('./photoCluster.js'),
    PhotoConverter = require('./photoConverter.js'),
    subscrController = require('./subscr.js'),
    commentController = require('./comment.js'),
    userObjectRelController = require('./userobjectrel'),

    fs = require('fs'),
    ms = require('ms'),
    _ = require('lodash'),
    moment = require('moment'),
    log4js = require('log4js'),
    Bluebird = require('bluebird'),
    Utils = require('../commons/Utils.js'),
    logger,
    incomeDir = global.appVar.storePath + 'incoming/',
    privateDir = global.appVar.storePath + 'private/photos/',
    publicDir = global.appVar.storePath + 'public/photos/',
    imageFolders = ['x/', 's/', 'q/', 'm/', 'h/', 'd/', 'a/'],

    constants = require('./constants.js'),

    maxRegionLevel = constants.region.maxLevel,

    msg = {
        deny: 'У вас нет прав на это действие',
        noUser: 'Запрашиваемый пользователь не существует',
        noPhoto: 'Запрашиваемой фотографии не существует или не доступна',
        noRegion: 'Такого региона не существует',
        badParams: 'Неверные параметры запроса',
        needReason: 'Необходимо указать причину операции',
        changed: 'С момента обновления вами страницы, информация на ней была кем-то изменена', // Две кнопки: "Посмотреть", "Продолжить <сохранение|изменение статуса>"
        anotherStatus: 'Фотография уже в другом статусе, обновите страницу',
        mustCoord: 'Фотография должна иметь координату или быть привязана к региону вручную'
    },

    status = constants.photo.status,
    parsingFields = constants.photo.parsingFields,
    parsingFieldsHash = parsingFields.reduce(function (result, field) {
        result[field] = field;
        return result;
    }, {}),
    historyFields = constants.photo.historyFields,
    historyFieldsDiff = constants.photo.historyFieldsDiff,
    historyFieldsDiffHash = historyFieldsDiff.reduce(function (result, field) {
        result[field] = field;
        return result;
    }, {}),

    shift10y = ms('10y'),
    compactFields = {
        _id: 0,
        cid: 1,
        file: 1,
        s: 1,
        title: 1,
        year: 1,
        ccount: 1,
        conv: 1,
        convqueue: 1,
        ready: 1
    },
    compactFieldsForReg = {
        _id: 1,
        cid: 1,
        file: 1,
        s: 1,
        ucdate: 1,
        title: 1,
        year: 1,
        ccount: 1,
        conv: 1,
        convqueue: 1,
        ready: 1
    },
    compactFieldsWithRegions = _.assign({ geo: 1 }, compactFields, regionController.regionsAllSelectHash),
    compactFieldsForRegWithRegions = _.assign({ geo: 1 }, compactFieldsForReg, regionController.regionsAllSelectHash),

    permissions = {
        // Определяет может ли модерировать фотографию пользователь
        // Если да, то в случае регионального модератора вернёт номер региона,
        // в случае, глобального модератора и админа - true
        canModerate: function (photo, usObj) {
            var photoRegion;
            var rhash;
            var i;

            if (usObj.isModerator) {
                // Если у пользователя роль модератора регионов, смотрим его регионы
                if (!usObj.user.mod_regions || !usObj.user.mod_regions.length) {
                    return true; // Глобальные модераторы могут модерировать всё
                }

                // Если фотография принадлежит одному из модерируемых регионов, значит пользователь может её модерировать
                // В этом случае возвращаем номер этого региона
                rhash = usObj.mod_rhash;
                for (i = 0; i <= maxRegionLevel; i++) {
                    photoRegion = photo['r' + i];
                    if (photoRegion && rhash[photoRegion] !== undefined) {
                        return photoRegion;
                    }
                }
            } else if (usObj.isAdmin) {
                // Если пользователь админ - то может
                return true;
            }
            return false;
        },
        getCan: function (photo, usObj, canModerate) {
            var can = {
                edit: false,
                ready: false,
                revision: false,
                revoke: false,
                reject: false,
                approve: false,
                activate: false,
                deactivate: false,
                remove: false,
                restore: false,
                convert: false,
                comment: false
            };
            var s = photo.s;
            var ownPhoto;

            if (usObj.registered) {
                ownPhoto = !!photo.user && photo.user.equals(usObj.user._id);
                if (canModerate !== undefined && canModerate !== null) {
                    canModerate = !!canModerate;
                } else {
                    canModerate = !!permissions.canModerate(photo, usObj);
                }

                // Редактировать может модератор и владелец, если оно не удалено и не отозвано. Администратор - всегда
                can.edit = usObj.isAdmin || s !== status.REMOVE && s !== status.REVOKE && (canModerate || ownPhoto);
                // Отправлять на премодерацию может владелец и фото новое или на доработке
                can.ready = (s === status.NEW || s === status.REVISION) && ownPhoto;
                // Отозвать может только владелец пока фото новое
                can.revoke = s < status.REVOKE && ownPhoto;
                // Модератор может отклонить не свое фото пока оно новое
                can.reject = s < status.REVOKE && canModerate && !ownPhoto;
                // Восстанавливать из удаленных может только администратор
                can.restore = s === status.REMOVE && usObj.isAdmin;
                // Отправить на конвертацию может только администратор
                can.convert = usObj.isAdmin;
                // Комментировать опубликованное может любой зарегистрированный, или модератор и владелец снятое с публикации
                can.comment = s === status.PUBLIC || s > status.PUBLIC && canModerate;

                if (canModerate) {
                    // Модератор может отправить на доработку
                    can.revision = s === status.READY;
                    // Модератор может одобрить новое фото
                    can.approve = s < status.REJECT;
                    // Модератор может активировать только деактивированное
                    can.activate = s === status.DEACTIVATE;
                    // Модератор может деактивировать только опубликованное
                    can.deactivate = s === status.PUBLIC;
                    // Модератор может удалить уже опубликованное и не удаленное фото
                    can.remove = s >= status.PUBLIC && s !== status.REMOVE;
                }
            }
            return can;
        },
        canSee: function (photo, usObj) {
            if (photo.s === status.PUBLIC) {
                return true;
            } else if (usObj.registered && photo.user) {
                // Владелец всегда может видеть свою фотографию
                if (photo.user.equals(usObj.user._id)) {
                    return true;
                }
                // Удаленную может видеть админ
                if (photo.s === status.REMOVE) {
                    return usObj.isAdmin;
                }
                return permissions.canModerate(photo, usObj);
            }

            return false;
        }
    };


/**
 * Находим фотографию с учетом прав пользователя
 * @param query
 * @param fieldSelect Выбор полей (обязательно должны присутствовать user, s, r0-rmaxRegionLevel)
 * @param usObj Объект пользователя
 */
function findPhoto(query, fieldSelect, usObj) {
    if (!usObj.registered) {
        query.s = status.PUBLIC; // Анонимам ищем только публичные
    }

    return Photo.findOneAsync(query, fieldSelect).then(function (photo) {
        if (!photo || !photo.user || !permissions.canSee(photo, usObj)) {
            throw { message: msg.noPhoto };
        }

        return photo;
    });
}

var core = {
    maxNewPhotosLimit: 1e4,
    getNewPhotosLimit: (function () {
        return function (user) {
            var canCreate = 0;
            var pfcount = user.pfcount;

            if (user.rules && _.isNumber(user.rules.photoNewLimit)) {
                canCreate = Math.max(0, Math.min(user.rules.photoNewLimit, core.maxNewPhotosLimit) - pfcount);
            } else if (user.ranks && (~user.ranks.indexOf('mec_silv') || ~user.ranks.indexOf('mec_gold'))) {
                canCreate = core.maxNewPhotosLimit - pfcount; //Серебряный и золотой меценаты имеют максимально возможный лимит
            } else if (user.ranks && ~user.ranks.indexOf('mec')) {
                canCreate = Math.max(0, 100 - pfcount); //Меценат имеет лимит 100
            } else if (user.pcount < 25) {
                canCreate = Math.max(0, 3 - pfcount);
            } else if (user.pcount < 50) {
                canCreate = Math.max(0, 5 - pfcount);
            } else if (user.pcount < 200) {
                canCreate = Math.max(0, 10 - pfcount);
            } else if (user.pcount < 1000) {
                canCreate = Math.max(0, 50 - pfcount);
            } else if (user.pcount >= 1000) {
                canCreate = Math.max(0, 100 - pfcount);
            }

            return canCreate;
        };
    }()),
    givePhoto: function (iAm, params) {
        var cid = params.cid;
        var defaultNoSelect = { sign: 0, sdate: 0 };
        var fieldNoSelect = {};

        if (params.noselect !== undefined) {
            _.assign(fieldNoSelect, params.noselect);
        }
        _.defaults(fieldNoSelect, defaultNoSelect);
        if (fieldNoSelect.frags === undefined) {
            fieldNoSelect['frags._id'] = 0;
        }

        return Photo.findOneAsync({ cid: cid }, fieldNoSelect)
            .bind({})
            .then(function (photo) {
                if (!photo || !permissions.canSee(photo, iAm)) {
                    throw { message: msg.noPhoto };
                }

                if (iAm.registered) {
                    // Права надо проверять до популяции пользователя
                    this.can = permissions.getCan(photo, iAm);
                }

                var userObj = _session.getOnline(null, photo.user);
                var promiseProps = {};
                var regionFields;

                if (userObj) {
                    photo = photo.toObject();
                    photo.user = {
                        login: userObj.user.login,
                        avatar: userObj.user.avatar,
                        disp: userObj.user.disp,
                        ranks: userObj.user.ranks || [],
                        sex: userObj.user.sex,
                        online: true
                    };
                    promiseProps.photo = photo;
                } else {
                    promiseProps.photo = photo.populateAsync({
                        path: 'user',
                        select: { _id: 0, login: 1, avatar: 1, disp: 1, ranks: 1, sex: 1 }
                    }).then(function (photo) {
                        if (!photo) {
                            throw { message: msg.noPhoto };
                        }
                        return photo.toObject();
                    });
                }

                if (photo.geo) {
                    regionFields = ['cid', 'title_local'];
                } else {
                    // Если у фото нет координаты, дополнительно берем домашнее положение региона и выбираем их из базы
                    regionFields = { _id: 0, cid: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 };
                }
                promiseProps.regions = regionController.getObjRegionList(photo, regionFields, !photo.geo);

                return Bluebird.props(promiseProps);
            })
            .then(function (result) {
                var regions = result.regions;
                var photo = result.photo;
                var frags;
                var frag;
                var i;

                //Не отдаем фрагменты удаленных комментариев
                if (photo.frags) {
                    frags = [];
                    for (i = 0; i < photo.frags.length; i++) {
                        frag = photo.frags[i];
                        if (!frag.del) {
                            frags.push(frag);
                        }
                    }
                    photo.frags = frags;
                }

                for (i = 0; i <= maxRegionLevel; i++) {
                    delete photo['r' + i];
                }
                if (regions.length) {
                    photo.regions = regions;
                }
                if (photo.geo) {
                    photo.geo = photo.geo.reverse();
                }

                if (iAm.registered) {
                    return userObjectRelController.fillObjectByRels(photo, iAm.user._id, 'photo', params.rel);
                }

                return photo;
            })
            .then(function (photo) {

                if (params.countView === true) {

                    // Инкрементируем кол-во просмотров только у публичных фото
                    if (photo.s === status.PUBLIC) {
                        photo.vdcount = (photo.vdcount || 0) + 1;
                        photo.vwcount = (photo.vwcount || 0) + 1;
                        photo.vcount = (photo.vcount || 0) + 1;

                        // В базе через инкремент, чтобы избежать race conditions
                        Photo.update({ cid: cid }, { $inc: { vdcount: 1, vwcount: 1, vcount: 1 } }).exec();
                    }

                    // Обновляем время просмотра объекта пользователем
                    if (iAm.registered) {
                        userObjectRelController.setObjectView(photo._id, iAm.user._id);
                    }
                }

                delete photo._id;

                return [photo, this.can];
            });
    },
    getBounds: function (data) {
        var yearCriteria;
        var year = false;
        var criteria;
        var promises;
        var promise;

        // Определяем, нужна ли выборка по границам лет
        if (_.isNumber(data.year) && _.isNumber(data.year2) && data.year >= 1826 && data.year <= 2000 && data.year2 >= data.year && data.year2 <= 2000) {
            year = true;
        }

        if (data.z < 17) {
            promise = year ? PhotoCluster.getBoundsByYear(data) : PhotoCluster.getBounds(data);
        } else {
            promises = [];

            if (year) {
                if (data.year === data.year2) {
                    yearCriteria = data.year;
                } else {
                    yearCriteria = { $gte: data.year, $lte: data.year2 };
                }
            }

            for (var i = data.bounds.length; i--;) {
                criteria = { geo: { $geoWithin: { $box: data.bounds[i] } } };
                if (year) {
                    criteria.year = yearCriteria;
                }
                promises.push(PhotoMap.findAsync(criteria, { _id: 0 }, { lean: true }));
            }

            promise = Bluebird.all(promises)
                .then(function (photos) {
                    return [photos.length > 1 ? _.flatten(photos) : photos[0]];
                });
        }

        return promise
            .tap(function (result) {
                var photos = result[0];

                // Реверсируем geo
                for (var i = photos.length; i--;) {
                    photos[i].geo.reverse();
                }
            });
    },

    giveNearestPhotos: function (data) {
        var query = { geo: { $near: data.geo }, s: status.PUBLIC };
        var options = { lean: true };

        if (typeof data.except === 'number' && data.except > 0) {
            query.cid = { $ne: data.except };
        }

        if (typeof data.distance === 'number' && data.distance > 0 && data.distance < 100000) {
            query.geo.$maxDistance = data.distance;
        } else {
            query.geo.$maxDistance = 2000;
        }

        if (typeof data.limit === 'number' && data.limit > 0 && data.limit < 30) {
            options.limit = data.limit;
        } else {
            options.limit = 30;
        }

        if (typeof data.skip === 'number' && data.skip > 0 && data.skip < 1000) {
            options.skip = data.skip;
        }

        return Photo.findAsync(query, compactFields, options);
    }
};

var giveNewPhotosLimit = Bluebird.method(function (iAm, data) {
    if (!iAm.registered || iAm.user.login !== data.login && !iAm.isAdmin) {
        throw { message: msg.deny };
    }
    var userObj = _session.getOnline(data.login);
    var promise;

    if (userObj) {
        promise = Bluebird.resolve(userObj.user);
    } else {
        promise = User.findOneAsync({ login: data.login });
    }

    return promise.then(function (user) {
        if (!user) {
            throw { message: msg.noUser };
        }

        return core.getNewPhotosLimit(user);
    });
});

/**
 * Создает фотографии в базе данных
 * @param socket Сессия пользователя
 * @param data Объект или массив фотографий
 */
//var dirs = ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'];
var createPhotos = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;
    if (!iAm.registered) {
        throw { message: msg.deny };
    }
    if (!Array.isArray(data) && !_.isObject(data)) {
        throw { message: msg.badParams };
    }

    if (!Array.isArray(data)) {
        data = [data];
    }

    var cids = [];
    var canCreate = core.getNewPhotosLimit(iAm.user);

    if (!canCreate || !data.length) {
        return { message: 'Nothing to save', cids: cids };
    }
    if (data.length > canCreate) {
        data = data.slice(0, canCreate);
    }

    return Bluebird.all(data.map(function (item) {
        item.fullfile = item.file.replace(/((.)(.)(.))/, "$2/$3/$4/$1");
        return fs.renameAsync(incomeDir + item.file, privateDir + item.fullfile);
    }))
        .then(function () {
            return Counter.incrementBy('photo', data.length);
        })
        .then(function savePhotos(count) {
            if (!count) {
                throw { message: 'Increment photo counter error' };
            }
            var now = Date.now();
            var next = count.next - data.length + 1;

            return Bluebird.all(data.map(function (item, i) {
                var photo = new Photo({
                    cid: next + i,
                    user: iAm.user,
                    file: item.fullfile,
                    ldate: new Date(now + i * 10), //Время загрузки каждого файла инкрементим на 10мс для правильной сортировки
                    sdate: new Date(now + i * 10 + shift10y), //Новые фотографии должны быть всегда сверху
                    type: item.type,
                    size: item.size,
                    geo: undefined,
                    s: 0,
                    title: item.name ? item.name.replace(/(.*)\.[^.]+$/, '$1') : undefined, //Отрезаем у файла расширение
                    frags: undefined,
                    convqueue: true
                    //geo: [_.random(36546649, 38456140) / 1000000, _.random(55465922, 56103812) / 1000000],
                    //dir: dirs[_.random(0, dirs.length - 1)],
                });
                item.photoObj = photo;

                cids.push({ cid: photo.cid });
                return photo.saveAsync();
            }));
        })
        .then(function () {
            PhotoConverter.addPhotos(cids);

            iAm.user.pfcount = iAm.user.pfcount + data.length;
            return _session.saveEmitUser(iAm, socket);
        })
        .then(function () {
            return { message: data.length + ' photo successfully saved', cids: cids };
        });
});

// Добавляет фото на карту
function photoToMap(photo, geoPhotoOld, yearPhotoOld) {
    var $update = {
        $setOnInsert: { cid: photo.cid },
        $set: {
            geo: photo.geo,
            file: photo.file,
            title: photo.title,
            year: photo.year,
            year2: photo.year2 || photo.year
        }
    };

    if (_.isString(photo.dir) && photo.dir.length) {
        $update.$set.dir = photo.dir;
    } else {
        $update.$unset = { dir: 1 };
    }

    return Bluebird.join(
        PhotoMap.updateAsync({ cid: photo.cid }, $update, { upsert: true }),
        // Отправляем на кластеризацию
        PhotoCluster.clusterPhoto(photo, geoPhotoOld, yearPhotoOld)
    );
}

// Удаляет фото с карты
function photoFromMap(photo) {
    return Bluebird.all([
        PhotoCluster.declusterPhoto(photo),
        PhotoMap.removeAsync({ cid: photo.cid })
    ]);
}

function getPhotoChangedFields(oldPhoto, newPhoto, parsedFileds) {
    var region;
    var diff = {};
    var fields = [];
    var oldValues = {};
    var newValues = {};
    var result = {};

    // Если хотя бы один регион изменился, записываем весь массив текущих регионов
    for (var i = 0; i <= maxRegionLevel; i++) {
        if (oldPhoto['r' + i] !== newPhoto['r' + i]) {
            oldValues.regions = [];
            newValues.regions = [];
            fields.push('regions');

            for (i = 0; i <= maxRegionLevel; i++) {
                region = oldPhoto['r' + i];
                if (region) {
                    oldValues.regions.push(region);
                }
                region = newPhoto['r' + i];
                if (region) {
                    newValues.regions.push(region);
                }
            }
            break;
        }
    }

    historyFields.forEach(function (field) {
        var oldValue = oldPhoto[field];
        var newValue = newPhoto[field];

        if (!_.isEqual(oldValue, newValue)) {
            // Если это строка и она "", обнуляем её
            if (!oldValue && _.isString(oldValue)) {
                oldValue = undefined;
            }
            if (!newValue && _.isString(newValue)) {
                newValue = undefined;
            }

            // Получаем форматированную разницу старого и нового текста (неформатированных)
            // для полей, для которых нужно вычислять разницу, и только если они не пустые
            if (historyFieldsDiffHash[field] && oldValue && newValue) {
                diff[field] = Utils.txtdiff(
                    Utils.txtHtmlToPlain(oldValue),
                    // Некоторые поля (описание, автор и др.) парсятся на предмет разметки и т.п.,
                    // разницу с последней версии при этом надо брать с plain
                    parsingFieldsHash[field] ? parsedFileds[field] ? parsedFileds[field].plain : Utils.txtHtmlToPlain(newValue) : newValue
                );
            }

            if (oldValue !== undefined) {
                oldValues[field] = oldValue;
            }
            if (newValue !== undefined) {
                newValues[field] = newValue;
            }
            fields.push(field);
        }
    });

    result.fields = fields;
    result.oldValues = oldValues;
    result.newValues = newValues;
    result.diff = diff;

    return result;
}

var savePhotoHistory = Bluebird.method(function (iAm, oldPhotoObj, photo, canModerate, reason, parsedFileds) {
    var changes = getPhotoChangedFields(oldPhotoObj, photo.toObject(), parsedFileds);

    if (_.isEmpty(changes.fields)) {
        return null;
    }

    return PhotoHistory.findAsync({ cid: oldPhotoObj.cid }, { _id: 1, values: 1 }, { lean: true, sort: { stamp: 1 } })
        .then(function (histories) {
            var add = [];
            var del = [];
            var reasonCid;
            var firstTime;
            var values = {};
            var promises = [];
            var firstEntryChanged;
            var newEntry = { cid: photo.cid, user: iAm.user._id, stamp: photo.cdate || new Date() };

            // Если это первое изменение объекта, создаем первую запись (по премени создания),
            // чтобы писать туда первоначальные значения полей, и сразу сохраняем её (массивый undefined, чтобы не сохранялись пустыми)
            if (_.isEmpty(histories)) {
                firstTime = true;
                histories = [{
                    cid: photo.cid,
                    user: photo.user,
                    stamp: photo.ldate.getTime(),
                    values: {},
                    add: undefined,
                    del: undefined
                }];
            }

            var lastFieldsIndexes = histories.reduce(function (result, historyEntry, historyIndex) {
                var del = historyEntry.del;
                var values = historyEntry.values;

                _.forEach(changes.fields, function (field) {
                    if (!historyIndex || values && values[field] || del && del.indexOf(field) >= 0) {
                        result[field] = historyIndex;
                    }
                });
                return result;
            }, {});

            _.forOwn(changes.newValues, function (value, field) {
                values[field] = value;
                // Если не было значения и новое значение не флаг, говорим что оно добавлено
                if (!_.isBoolean(value) && changes.oldValues[field] === undefined) {
                    add.push(field);
                    delete changes.oldValues[field];
                }
            });

            _.forOwn(changes.oldValues, function (value, field) {
                if (!lastFieldsIndexes[field]) {
                    firstEntryChanged = true;
                    histories[0].values[field] = value;
                }
                // Если нет нового значения и старое значение не флаг, говорим что оно удалено
                if (!_.isBoolean(value) && changes.newValues[field] === undefined) {
                    del.push(field);
                }
            });

            if (!_.isEmpty(values)) {
                newEntry.values = values;
            }
            if (!_.isEmpty(changes.diff)) {
                newEntry.diff = changes.diff;
            }
            newEntry.add = add.length ? add : undefined;
            newEntry.del = del.length ? del : undefined;

            if (reason) {
                newEntry.reason = {};
                reasonCid = Number(reason.cid);

                if (reasonCid >= 0) {
                    newEntry.reason.cid = reasonCid;
                }
                if (_.isString(reason.desc) && reason.desc.length) {
                    newEntry.reason.desc = Utils.inputIncomingParse(reason.desc).result;
                }
            }

            if (canModerate === undefined || canModerate === null) {
                // При проверке стоит смотреть на oldPhotoObj, так как права проверяются перед сохраннением
                canModerate = permissions.canModerate(oldPhotoObj, iAm);
            }

            if (canModerate && iAm.user.role) {
                // Если для изменения потребовалась роль модератора/адиминитратора, записываем её на момент удаления
                newEntry.role = iAm.user.role;

                // В случае с модератором региона, permissions.canModerate возвращает cid роли
                if (iAm.isModerator && _.isNumber(canModerate)) {
                    newEntry.roleregion = canModerate;
                }
            }

            promises.push(new PhotoHistory(newEntry).saveAsync());

            if (firstTime) {
                promises.push(new PhotoHistory(histories[0]).saveAsync());
            } else if (firstEntryChanged) {
                promises.push(PhotoHistory.updateAsync({ _id: histories[0]._id }, { $set: { values: histories[0].values } }));
            }

            return Bluebird.all(promises);
        });
});

/**
 * Выборка объекта фотографии для редактирования с проверкой прав на указанный can
 * Проверяет не редактировался ли объект после указанного времени cdate. Если да - бросит { changed: true }
 * Возвращает объект и свойство canModerate
 * @param iAm
 * @param data
 * @param can
 */
var photoEditPrefetch = Bluebird.method(function (iAm, data, can) {
    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }
    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    var cid = Number(data.cid);

    if (isNaN(cid) || cid < 1) {
        throw { message: msg.badParams };
    }

    return findPhoto({ cid: cid }, {}, iAm)
        .then(function (photo) {
            if (_.isNumber(data.s) && data.s !== photo.s) {
                throw { message: msg.anotherStatus };
            }

            var canModerate = permissions.canModerate(photo, iAm);

            if (can && permissions.getCan(photo, iAm, canModerate)[can] !== true) {
                throw { message: msg.deny };
            }

            // Если фотография изменилась после отображения и не стоит флаг игнорирования изменения,
            // то возвращаем статус, что изменено
            if (data.ignoreChange !== true && _.isDate(photo.cdate) && (!data.cdate || !_.isEqual(new Date(data.cdate), photo.cdate))) {
                throw { changed: true };
            }

            return [photo, canModerate];
        });
});

/**
 * Сохраняем объект фотографии с подъемом времени просмотра пользователем объекта
 * @param iAm
 * @param photo
 * @param [stamp] Принудительно устанавливает время просмотра
 */
var photoUpdate = function (iAm, photo, stamp) {
    return Bluebird.join(
        photo.saveAsync(),
        userObjectRelController.setObjectView(photo._id, iAm.user._id, 'photo', stamp),
        function (savedResult, rel) {
            return [savedResult[0], rel];
        }
    );
};

// Обновляем счетчики количества у пользователя
var userPCountUpdate = function (userId, newDelta, publicDelta, inactiveDelta) {
    var ownerObj = _session.getOnline(null, userId);

    if (ownerObj) {
        ownerObj.user.pfcount = ownerObj.user.pfcount + (newDelta || 0);
        ownerObj.user.pcount = ownerObj.user.pcount + (publicDelta || 0);
        ownerObj.user.pdcount = ownerObj.user.pdcount + (inactiveDelta || 0);
        return _session.saveEmitUser(ownerObj);
    } else {
        return User.updateAsync({ _id: userId }, {
            $inc: {
                pfcount: newDelta || 0,
                pcount: publicDelta || 0,
                pdcount: inactiveDelta || 0
            }
        });
    }
};

var changePublicPhotoExternality = Bluebird.method(function (photo, iAm, makePublic) {
    var promises = {};

    //Скрываем или показываем комментарии и пересчитываем их публичное кол-во у пользователей
    promises.hideComments = commentController.hideObjComments(photo._id, !makePublic, iAm);

    // Пересчитываем кол-во фото у владельца
    promises.pcount = userPCountUpdate(photo.user, 0, makePublic ? 1 : -1, makePublic ? -1 : 1);

    //Если у фото есть координаты, значит надо провести действие с картой
    if (Utils.geo.check(photo.geo)) {
        promises.mapOperaton = makePublic ? photoToMap(photo) : photoFromMap(photo);
    }

    return Bluebird.props(promises);
});

/**
 * Отзыв собственной фотографии
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var revokePhoto = function (socket, data) {
    var iAm = socket.handshake.usObj;

    return photoEditPrefetch(iAm, data, 'revoke')
        .bind({})
        .spread(function (photo) {
            this.oldPhotoObj = photo.toObject();

            photo.s = status.REVOKE;
            photo.sdate = photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Пересчитываем кол-во фото у владельца
            userPCountUpdate(photoSaved.user, -1, 0, 1);

            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, false);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
};


/**
 * Говорим, что фото готово к премодерации и публикации
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var readyPhoto = function (socket, data) {
    var iAm = socket.handshake.usObj;

    return photoEditPrefetch(iAm, data, 'ready')
        .bind({})
        .spread(function (photo, canModerate) {
            photoCheckPublickRequired(photo);

            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status.READY;
            photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.oldPhotoObj.user.equals(iAm.user._id) ? false : this.canModerate);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
};

/**
 * Отправить фотографию, ожидающую публикацию на доработку автору
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var toRevision = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;

    if (_.isEmpty(data.reason)) {
        throw { message: msg.needReason };
    }

    return photoEditPrefetch(iAm, data, 'revision')
        .bind({})
        .spread(function (photo, canModerate) {
            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status.REVISION;
            photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.canModerate, data.reason);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
});

/**
 * Отклонение фотографии
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var rejectPhoto = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;

    if (_.isEmpty(data.reason)) {
        throw { message: msg.needReason };
    }

    return photoEditPrefetch(iAm, data, 'reject')
        .bind({})
        .spread(function (photo, canModerate) {
            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status.REJECT;
            //TODO: При возврате на доработку возвращать sdate +shift10y
            photo.sdate = photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Пересчитываем кол-во фото у владельца
            userPCountUpdate(photoSaved.user, -1, 0, 1);

            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.canModerate, data.reason);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
});

/**
 * Публикация (подтверждение) новой фотографии
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var approvePhoto = function (socket, data) {
    var iAm = socket.handshake.usObj;

    return photoEditPrefetch(iAm, data, 'approve')
        .bind({})
        .spread(function (photo, canModerate) {
            photoCheckPublickRequired(photo);

            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status.PUBLIC;
            photo.stdate = photo.cdate = photo.adate = photo.sdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Пересчитываем кол-во фото у владельца
            userPCountUpdate(photoSaved.user, -1, 1, 0);

            //Подписываем автора фотографии на неё
            subscrController.subscribeUserByIds(photoSaved.user, photoSaved._id, 'photo');

            // Добавляем фото на карту
            if (Utils.geo.check(photoSaved.geo)) {
                photoToMap(photoSaved);
            }

            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.canModerate);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
};

/**
 * Активация/деактивация фото
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var activateDeactivate = function (socket, data) {
    var iAm = socket.handshake.usObj;
    var disable = !!data.disable;

    if (disable && _.isEmpty(data.reason)) {
        throw { message: msg.needReason };
    }

    return photoEditPrefetch(iAm, data, disable ? 'deactivate' : 'activate')
        .bind({})
        .spread(function (photo, canModerate) {
            if (!disable) {
                photoCheckPublickRequired(photo);
            }

            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status[disable ? 'DEACTIVATE' : 'PUBLIC'];
            photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            changePublicPhotoExternality(photoSaved, iAm, !disable);

            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.canModerate, disable && data.reason);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
};

/**
 * Удаляет из Incoming загруженное, но еще не созданное фото
 * @param {Object} iAm Объект пользователя
 * @param {Object} data
 */
var removePhotoIncoming = Bluebird.method(function (iAm, data) {
    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    return fs.unlinkAsync(incomeDir + data.file);
});

/**
 * Удаление фотографии
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var removePhoto = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;

    if (_.isEmpty(data.reason)) {
        throw { message: msg.needReason };
    }

    return photoEditPrefetch(iAm, data, 'remove')
        .bind({})
        .spread(function (photo, canModerate) {
            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status.REMOVE;
            photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.canModerate, data.reason);

            // Отписываем всех пользователей
            subscrController.unSubscribeObj(photoSaved._id);

            if (this.oldPhotoObj.s === status.PUBLIC) {
                changePublicPhotoExternality(photoSaved, iAm);
            }

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
});

/**
 * Восстановление фотографии
 * @param {Object} socket Сокет пользователя
 * @param {Object} data
 */
var restorePhoto = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;

    if (_.isEmpty(data.reason)) {
        throw { message: msg.needReason };
    }

    return photoEditPrefetch(iAm, data, 'restore')
        .bind({})
        .spread(function (photo, canModerate) {
            photoCheckPublickRequired(photo);

            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;

            photo.s = status.PUBLIC;
            photo.stdate = photo.cdate = new Date();

            return photoUpdate(iAm, photo);
        })
        .spread(function (photoSaved, rel) {
            // Сохраняем в истории предыдущий статус
            savePhotoHistory(iAm, this.oldPhotoObj, photoSaved, this.canModerate, data.reason);

            changePublicPhotoExternality(photoSaved, iAm, true);

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: photoSaved.cid, rel: rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            }
            throw err;
        });
});


/**
 * Отдаем фотографию для её страницы
 * @param {Object} iAm Объект пользователя
 * @param {Object} data
 */
var givePhotoForPage = Bluebird.method(function (iAm, data) {
    if (!_.isObject(data)) {
        throw ({ message: msg.badParams });
    }
    var cid = Number(data.cid);
    if (!cid || cid < 1) {
        throw ({ message: msg.badParams });
    }

    return core.givePhoto(iAm, { cid: cid, countView: true })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        });
});


/**
 * Отдаем полную галерею с учетом прав и фильтров в компактном виде
 * @param iAm Объект пользователя
 * @param filter Объект фильтра (распарсенный)
 * @param data Объект параметров, включая стринг фильтра
 * @param user_id _id пользователя, если хотим галерею только для него получить
 */
var givePhotos = Bluebird.method(function (iAm, filter, data, user_id) {
    var skip = Math.abs(Number(data.skip)) || 0;
    var limit = Math.min(data.limit || 40, 100);
    var buildQueryResult = buildPhotosQuery(filter, user_id, iAm);
    var query = buildQueryResult.query;
    var fieldsSelect;

    if (query) {
        if (filter.geo) {
            if (filter.geo[0] === '0') {
                query.geo = null;
            }
            if (filter.geo[0] === '1') {
                query.geo = { $size: 2 };
            }
        }
        if (user_id) {
            query.user = user_id;
        }

        // Для подсчета новых комментариев нужны _id, а для проверки на изменение - ucdate
        fieldsSelect = iAm.registered ? compactFieldsForRegWithRegions : compactFieldsWithRegions;

        return Bluebird.join(
            Photo.findAsync(query, fieldsSelect, { lean: true, skip: skip, limit: limit, sort: { sdate: -1 } }),
            Photo.countAsync(query)
        )
            .bind({})
            .spread(function (photos, count) {
                this.count = count;

                if (!iAm.registered || !photos.length) {
                    // Если аноним или фотографий нет, сразу возвращаем
                    return photos;
                } else {
                    // Если пользователь залогинен, заполняем кол-во новых комментариев для каждого объекта
                    return userObjectRelController.fillObjectByRels(photos, iAm.user._id, 'photo');
                }
            })
            .then(function (photos) {
                var photo;
                var shortRegionsHash;
                var shortRegionsParams;
                var i = photos.length;

                if (i) {
                    if (iAm.registered) {
                        while (i--) {
                            photo = photos[i];
                            delete photo._id;
                            delete photo.vdate;
                            delete photo.ucdate;
                        }
                    }

                    // Заполняем для каждой фотографии краткие регионы и хэш этих регионов
                    shortRegionsParams = regionController.getShortRegionsParams(buildQueryResult.rhash);
                    shortRegionsHash = regionController.genObjsShortRegionsArr(photos, shortRegionsParams.lvls, true);
                }

                return {
                    photos: photos,
                    filter: { r: buildQueryResult.rarr, rp: filter.rp, s: buildQueryResult.s, geo: filter.geo },
                    rhash: shortRegionsHash,
                    count: this.count,
                    skip: skip
                };
            });
    }
    return Bluebird.resolve({
        photos: [],
        filter: { r: buildQueryResult.rarr, rp: filter.rp, s: buildQueryResult.s, geo: filter.geo },
        count: 0,
        skip: skip
    });
});

// Отдаем последние публичные фотографии на главной
var givePhotosPublicIndex = (function () {
    var options = { skip: 0, limit: 30 };
    var filter = { s: [status.PUBLIC] };

    return function (iAm) {
        // Всегда выбираем заново, т.к. могут быть региональные фильтры
        return givePhotos(iAm, filter, options);
    };
}());

// Отдаем последние публичные "Где это?" фотографии для главной
var givePhotosPublicNoGeoIndex = (function () {
    var options = { skip: 0, limit: 30 };
    var filter = { geo: ['0'], s: [status.PUBLIC] };

    return function (iAm) {
        // Выбираем заново, т.к. могут быть региональные фильтры
        return givePhotos(iAm, filter, options);
    };
}());

var filterProps = { geo: [], r: [], rp: [], s: [] };
var delimeterParam = '_';
var delimeterVal = '!';
function parseFilter(filterString) {
    var filterParams = filterString && filterString.split(delimeterParam);
    var filterParam;
    var filterVal;
    var filterValItem;
    var dividerIndex;
    var result = {};
    var i;
    var j;

    if (filterParams) {
        for (i = filterParams.length; i--;) {
            filterParam = filterParams[i];
            dividerIndex = filterParam.indexOf(delimeterVal);

            if (dividerIndex > 0) {
                filterVal = filterParam.substr(dividerIndex + 1);
                filterParam = filterParam.substring(0, dividerIndex);
            }

            if (filterProps[filterParam] !== undefined) {
                if (typeof filterProps[filterParam] === 'boolean') {
                    result[filterParam] = true;
                } else if (filterParam === 'r') {
                    if (filterVal === '0') {
                        result.r = 0;
                    } else {
                        filterVal = filterVal.split(delimeterVal).map(Number);
                        if (Array.isArray(filterVal) && filterVal.length) {
                            result.r = [];
                            for (j = filterVal.length; j--;) {
                                filterValItem = filterVal[j];
                                if (filterValItem) {
                                    result.r.unshift(filterValItem);
                                }
                            }
                            if (!result.r.length) {
                                delete result.r;
                            }
                        }
                    }
                } else if (filterParam === 'rp') {
                    //Regions phantom. Неактивные регионы фильтра
                    filterVal = filterVal.split(delimeterVal).map(Number);
                    if (Array.isArray(filterVal) && filterVal.length) {
                        result.rp = [];
                        for (j = filterVal.length; j--;) {
                            filterValItem = filterVal[j];
                            if (filterValItem) {
                                result.rp.unshift(filterValItem);
                            }
                        }
                        if (!result.rp.length) {
                            delete result.rp;
                        }
                    }
                } else if (filterParam === 's') {
                    filterVal = filterVal.split(delimeterVal);
                    if (Array.isArray(filterVal) && filterVal.length) {
                        result.s = [];
                        for (j = filterVal.length; j--;) {
                            filterValItem = filterVal[j];
                            if (filterValItem) {
                                filterValItem = Number(filterValItem);
                                if (!isNaN(filterValItem)) { //0 должен входить, поэтому проверка на NaN
                                    result.s.unshift(filterValItem);
                                }
                            }
                        }
                        if (!result.s.length) {
                            delete result.s;
                        }
                    }
                } else if (filterParam === 'geo') {
                    filterVal = filterVal.split(delimeterVal);
                    if (Array.isArray(filterVal) && filterVal.length === 1) {
                        result.geo = filterVal;
                    }
                }
            }
        }
    }

    return result;
}

// Отдаем общую галерею
var givePhotosPS = Bluebird.method(function (iAm, data) {
    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }

    var filter = data.filter ? parseFilter(data.filter) : {};
    if (!filter.s) {
        filter.s = [status.PUBLIC];
    }

    return givePhotos(iAm, filter, data);
});

// Отдаем галерею пользователя
var giveUserPhotos = Bluebird.method(function (iAm, data) {
    if (!_.isObject(data) || !data.login) {
        throw { message: msg.badParams };
    }

    return User.getUserID(data.login)
        .then(function (user_id) {
            if (!user_id) {
                throw { message: msg.noUser };
            }
            var filter = data.filter ? parseFilter(data.filter) : {};

            // Если фильтр по регионам не установлен, это чужая галерея, есть свои регионы
            // и стоит настройка не фильтровать по ним галереи пользователя, то задаем весь мир
            if (filter.r === undefined && iAm.registered && iAm.user.login !== data.login && iAm.user.regions && iAm.user.regions.length && iAm.user.settings && !iAm.user.settings.r_f_user_gal) {
                filter.r = 0;
            }

            return givePhotos(iAm, filter, data, user_id);
        });
});

// Отдаем последние фотографии, ожидающие подтверждения
var givePhotosForApprove = Bluebird.method(function (iAm, data) {
    var query = { s: status.READY };

    if (!iAm.registered || iAm.user.role < 5) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }
    if (iAm.isModerator) {
        _.assign(query, iAm.mod_rquery);
    }

    return Photo.findAsync(query, compactFieldsWithRegions, {
        lean: true,
        sort: { sdate: -1 },
        skip: data.skip || 0,
        limit: Math.min(data.limit || 20, 100)
    })
        .then(function (photos) {
            if (!photos) {
                throw { message: msg.noPhoto };
            }
            var shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm.mod_rshortlvls, true);

            return { photos: photos, rhash: shortRegionsHash };
        });
});

/**
 * Берем массив до и после указанной фотографии пользователя указанной длины
 * @param {Object} iAm Объект пользователя
 * @param {Object} data
 */
var giveUserPhotosAround = Bluebird.method(function (iAm, data) {
    var cid = Number(data && data.cid);
    var limitL = Math.min(Number(data.limitL), 100);
    var limitR = Math.min(Number(data.limitR), 100);

    if (!cid || (!limitL && !limitR)) {
        throw { message: msg.badParams };
    }

    return findPhoto({ cid: cid }, null, iAm)
        .then(function (photo) {
            var filter = iAm.registered && iAm.user.settings && !iAm.user.settings.r_f_photo_user_gal ? { r: 0 } : {};
            var query = buildPhotosQuery(filter, photo.user, iAm).query;
            var promises = [];

            query.user = photo.user;

            if (limitL) {
                query.sdate = { $gt: photo.sdate };
                promises.push(Photo.findAsync(query, compactFields, { lean: true, sort: { sdate: 1 }, limit: limitL }));
            }

            if (limitR) {
                query.sdate = { $lt: photo.sdate };
                promises.push(Photo.findAsync(query, compactFields, { lean: true, sort: { sdate: -1 }, limit: limitR }));
            }

            return Bluebird.all(promises);
        })
        .spread(function (photosL, photosR) {
            return { left: photosL || [], right: photosR || [] };
        });
});

// Берем массив ближайших фотографий
var giveNearestPhotos = Bluebird.method(function (data) {
    if (!data || !Utils.geo.checkLatLng(data.geo)) {
        throw { message: msg.badParams };
    }
    data.limit = Number(data.limit);
    data.geo.reverse();

    return core.giveNearestPhotos(data)
        .then(function (photos) {
            return { photos: photos || [] };
        });
});

// Отдаем непубличные фотографии пользователя
var giveUserPhotosPrivate = Bluebird.method(function (iAm, data) {
    if (!iAm.registered || (iAm.user.role < 5 && iAm.user.login !== data.login)) {
        throw { message: msg.deny };
    }

    return User.getUserID(data.login)
        .then(function (userid) {
            var query = { user: userid, s: { $nin: [status.PUBLIC] } };

            if (iAm.isModerator) {
                query.s.$nin.push(status.REMOVE);
                _.assign(query, iAm.mod_rquery);
            }

            if (data.startTime || data.endTime) {
                query.sdate = {};
                if (data.startTime) {
                    query.sdate.$gte = new Date(data.startTime);
                }
                if (data.endTime) {
                    query.sdate.$lte = new Date(data.endTime);
                }
            }

            return Photo.find(query, compactFields, { lean: true, sort: { sdate: -1 } });
        })
        .then(function (photos) {
            return { photos: photos };
        });
});

// Отдаем новые фотографии
var givePhotosFresh = Bluebird.method(function (iAm, data) {
    if (!iAm.registered ||
        (!data.login && iAm.user.role < 5) ||
        (data.login && iAm.user.role < 5 && iAm.user.login !== data.login)) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }

    return (data.login ? User.getUserID(data.login) : Bluebird.resolve)
        .bind({})
        .then(function (userid) {
            var query = { s: status.NEW };
            this.asModerator = iAm.user.login !== data.login && iAm.isModerator;

            if (this.asModerator) {
                _.assign(query, iAm.mod_rquery);
            }
            if (userid) {
                query.user = userid;
            }
            if (data.after) {
                query.ldate = { $gt: new Date(data.after) };
            }

            return Photo.findAsync(
                query,
                compactFields,
                { lean: true, skip: data.skip || 0, limit: Math.min(data.limit || 100, 100) }
            );
        })
        .then(function (photos) {
            var shortRegionsHash = regionController.genObjsShortRegionsArr(
                photos || [],
                this.asModerator ? iAm.mod_rshortlvls : iAm.rshortlvls,
                true
            );
            return { photos: photos || [], rhash: shortRegionsHash };
        });
});

// Отдаем разрешенные can для фото
var giveCanPhoto = Bluebird.method(function (iAm, data) {
    var cid = Number(data.cid);

    if (!cid) {
        throw { message: msg.noPhoto };
    }

    if (iAm.registered) {
        return Photo.findOneAsync({ cid: cid })
            .then(function (photo) {
                return { can: permissions.getCan(photo, iAm) };
            });
    }

    return {};
});

function photoCheckPublickRequired(photo) {
    if (!photo.r0) {
        throw { message: msg.mustCoord };
    }

    if (_.isEmpty(photo.title)) {
        throw { message: 'Необходимо заполнить название фотографии' };
    }

    if (!_.isNumber(photo.year) || !_.isNumber(photo.year2) ||
        photo.year < 1826 || photo.year > 2000 ||
        photo.year2 < photo.year && photo.year2 > 2000) {
        throw {
            message: 'Опубликованные фотогрфии должны содержать предполагаемую датировку фотографии в интервале 1826—2000гг.'
        };
    }

    return true;
}

var photoValidate = function (values) {
    var result = {};

    if (!values) {
        return result;
    }

    // Validate geo
    if (values.geo && Utils.geo.checkLatLng(values.geo)) {
        result.geo = Utils.geo.geoToPrecisionRound(values.geo.reverse());
    } else if (values.geo === null) {
        result.geo = undefined;
    }

    if (_.isNumber(values.region) && values.region > 0) {
        result.region = values.region;
    } else if (values.region === null) {
        result.region = undefined;
    }

    // Both year fields must be felled and 1826-2000
    if (_.isNumber(values.year) && _.isNumber(values.year2) &&
        values.year >= 1826 && values.year <= 2000 &&
        values.year2 >= values.year && values.year2 <= 2000) {
        result.year = values.year;
        result.year2 = values.year2;
    } else if (values.year === null) {
        result.year = undefined;
        result.year2 = undefined;
    }

    if (_.isString(values.dir) && values.dir.length) {
        result.dir = values.dir.trim();
    } else if (values.dir === null) {
        result.dir = undefined;
    }

    // Trim and remove last dot in title, if it is not part of ellipsis
    if (_.isString(values.title) && values.title.length) {
        result.title = values.title.trim().substr(0, 120).replace(/([^\.])\.$/, '$1');
    } else if (values.title === null) {
        result.title = undefined;
    }

    if (_.isString(values.desc) && values.desc.length) {
        result.desc = values.desc.trim().substr(0, 4000);
    } else if (values.desc === null) {
        result.desc = undefined;
    }

    if (_.isString(values.source) && values.source.length) {
        result.source = values.source.trim().substr(0, 250);
    } else if (values.source === null) {
        result.source = undefined;
    }

    if (_.isString(values.author) && values.author.length) {
        result.author = values.author.trim().substr(0, 250);
    } else if (values.author === null) {
        result.author = undefined;
    }

    if (_.isString(values.address) && values.address.length) {
        result.address = values.address.trim().substr(0, 250);
    } else if (values.address === null) {
        result.address = undefined;
    }

    return result;
};

/**
 * Сохраняем информацию о фотографии
 * @param {Object} iAm Объект пользователя
 * @param {Object} data
 */
var savePhoto = function (iAm, data) {
    var oldGeo;
    var newGeo;
    var geoToNull;
    var newValues;
    var newRegions;


    return photoEditPrefetch(iAm, data, 'edit')
        .bind({})
        .spread(function (photo, canModerate) {
            var changes = photoValidate(data.changes);

            if (_.isEmpty(changes)) {
                throw { emptySave: true };
            }

            this.photo = photo;
            this.oldPhotoObj = photo.toObject();
            this.canModerate = canModerate;
            this.saveHistory = this.photo.s !== status.NEW;
            this.parsedFileds = {};

            // Сразу парсим нужные поля, чтобы далее сравнить их с существующим распарсеным значением
            parsingFields.forEach(function (filed) {
                if (changes[filed]) {
                    this.parsedFileds = Utils.inputIncomingParse(changes[filed]);
                    changes[filed] = this.parsedFileds.result;
                }
            }, this);

            // Новые значения действительно изменяемых свойств
            newValues = Utils.diff(_.pick(changes, 'geo', 'year', 'year2', 'dir', 'title', 'address', 'desc', 'source', 'author'), this.oldPhotoObj);
            if (_.isEmpty(newValues) && !changes.hasOwnProperty('region')) {
                throw { emptySave: true };
            }

            _.assign(this.photo, newValues);

            if (newValues.hasOwnProperty('geo') && newValues.geo === undefined) {
                geoToNull = true; // Флаг обнуления координат
            }

            oldGeo = this.oldPhotoObj.geo;
            newGeo = newValues.geo;

            // Если координата обнулилась или её нет, то должны присвоить регион
            if (geoToNull || _.isEmpty(oldGeo) && !newGeo) {
                if (changes.region) {
                    // Если регион присвоен вручную, определяем его родитлей и проставляем объекту
                    newRegions = regionController.setObjRegionsByRegionCid(
                        photo,
                        changes.region,
                        ['cid', 'parents', 'title_en', 'title_local']
                    );
                    // Если вернулся false, значит переданного региона не существует
                    if (!newRegions) {
                        throw { message: msg.noRegion };
                    }
                } else {
                    // Очищаем привязку к регионам
                    regionController.clearObjRegions(photo);
                    newRegions = [];
                }
            }

            // Если координата добавилась/изменилась, запрашиваем по ней новые регионы фотографии
            if (newGeo) {
                return regionController.setObjRegionsByGeo(
                    photo, newGeo,
                    { _id: 0, cid: 1, parents: 1, title_en: 1, title_local: 1 }
                )
                    .then(function (regionsArr) {
                        newRegions = regionsArr;
                        return null;
                    });
            }
        })
        .then(function () {
            // Проверяем, что заполненны обязательные поля для опубликованных
            if (this.photo.s === status.READY || this.photo.s === status.PUBLIC) {
                photoCheckPublickRequired(this.photo);
            }

            if (this.saveHistory) {
                this.photo.cdate = this.photo.ucdate = new Date();
            }

            var promise = photoUpdate(iAm, this.photo).bind(this);

            if (geoToNull && this.photo.s === status.PUBLIC) {
                // При обнулении координаты, если фото публичное, значит оно было на карте. Удаляем с карты.
                // Мы должны удалить с карты до удаления координаты, так как декластеризация смотрит на неё
                promise = promise.tap(function () {
                    photoFromMap(this.oldPhotoObj);
                });
            }

            return promise;
        })
        .spread(function (photoSaved, rel) {
            this.photo = photoSaved;
            this.rel = rel;

            var newKeys = Object.keys(newValues);
            var oldValues = {}; // Старые значения изменяемых свойств

            for (var i = newKeys.length; i--;) {
                oldValues[newKeys[i]] = this.oldPhotoObj[newKeys[i]];
            }

            if (
                photoSaved.s === status.PUBLIC && !_.isEmpty(photoSaved.geo) &&
                (newGeo || !_.isEmpty(_.pick(oldValues, 'dir', 'title', 'year', 'year2')))
            ) {
                // Если фото публичное, добавилась/изменилась координата или есть чем обновить постер кластера, то пересчитываем на карте
                // Здесь координата должна проверятся именно photoSaved.geo, а не newGeo,
                // так как случай newGeo undefined может означать, что координата не изменилась, но для постера данные могли измениться
                return photoToMap(photoSaved, oldGeo, this.oldPhotoObj.year);
            }
        })
        .then(function () {
            // Если это опубликованная фотография (не обязательно публичная) и изменились регионы,
            // устанавливаем их возможным комментариям
            if (this.photo.s >= status.PUBLIC && newRegions) {
                var commentAdditionUpdate = {};
                if (geoToNull) {
                    commentAdditionUpdate.$unset = { geo: 1 };
                } else if (newGeo) {
                    commentAdditionUpdate.$set = { geo: newGeo };
                }
                regionController.updateObjsRegions(Comment, { obj: this.photo._id }, newRegions, commentAdditionUpdate);
            }

            // Сохраняем в истории предыдущий статус
            if (this.saveHistory) {
                savePhotoHistory(iAm, this.oldPhotoObj, this.photo, this.oldPhotoObj.user.equals(iAm.user._id) ? false : this.canModerate, null, this.parsedFileds);
            }

            // Заново выбираем данные для отображения
            return core.givePhoto(iAm, { cid: this.photo.cid, rel: this.rel });
        })
        .spread(function (photo, can) {
            return { photo: photo, can: can };
        })
        .catch(function (err) {
            if (err.changed === true) {
                return { message: msg.changed, changed: true };
            } else if (err.emptySave === true) {
                return { emptySave: true };
            }
            throw err;
        });
};

// Фотографии и кластеры по границам
// {z: Масштаб, bounds: [[]]}
var getBounds = Bluebird.method(function (data) {
    if (!_.isObject(data) || !Array.isArray(data.bounds) || !data.z) {
        throw { message: msg.badParams };
    }
    // Реверсируем geo границы баунда
    for (var i = data.bounds.length; i--;) {
        data.bounds[i][0].reverse();
        data.bounds[i][1].reverse();
    }

    return core.getBounds(data)
        .spread(function (photos, clusters) {
            return { photos: photos, clusters: clusters, startAt: data.startAt, z: data.z };
        });
});

// Отправляет выбранные фото на конвертацию
var convertPhotos = Bluebird.method(function (iAm, data) {
    var cids = [];

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!Array.isArray(data) || !data.length) {
        throw { message: msg.badParams };
    }

    for (var i = data.length; i--;) {
        data[i].cid = Number(data[i].cid);
        data[i].variants = _.intersection(data[i].variants, ["a", "d", "h", "m", "q", "s", "x"]);
        if (data[i].cid && data[i].variants.length) {
            cids.push(data[i].cid);
        }
    }
    if (!cids.length) {
        throw { message: msg.badParams };
    }

    return Photo.updateAsync({ cid: { $in: cids } }, { $set: { convqueue: true } }, { multi: true })
        .then(function () {
            return PhotoConverter.addPhotos(data);
        });
});

// Отправляет все фото выбранных вариантов на конвертацию
var convertPhotosAll = Bluebird.method(function (iAm, data) {
    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }

    return PhotoConverter.addPhotosAll(data);
});

/**
 * Строим параметры запроса (query) для запроса фотографий с фильтром с учетом прав на статусы и регионы
 * @param filter
 * @param forUserId
 * @param iAm Объект пользователя сессии
 */
function buildPhotosQuery(filter, forUserId, iAm) {
    var query, //Результирующий запрос
        query_pub, //Запрос в рамках публичных регионов
        query_mod, //Запрос в рамках модерируемых регионов
        rquery_pub,
        rquery_mod,

        regions_cids = [],
        regions_arr = [],
        regions_arr_all = [],//Массив объектов регионов, включая неактивные (phantom в фильтре)
        regions_hash = {},

        squery_public_have = !filter.s || !filter.s.length || filter.s.indexOf(5) > -1,
        squery_public_only = !iAm.registered || filter.s && filter.s.length === 1 && filter.s[0] === status.PUBLIC,

        region,
        contained,
        result = { query: null, s: [], rcids: [], rarr: [] },

        someVar,
        i,
        j;

    if (!squery_public_only && filter.s && filter.s.length) {
        //Если есть публичный, убираем, так как непубличный squery будет использован только в rquery_mod
        filter.s = _.without(filter.s, status.PUBLIC, !iAm.isAdmin ? status.REMOVE : undefined);
    }

    if (Array.isArray(filter.r) && filter.r.length) {
        regions_arr_all = regionController.getRegionsArrFromCache(filter.r);

        if (Array.isArray(filter.rp) && filter.rp.length) {
            //Если есть массив неактивных (phantom) регионов фильтра, берем разницу
            regions_cids = _.difference(filter.r, filter.rp);
            regions_arr = regionController.getRegionsArrFromCache(regions_cids);
        } else {
            regions_cids = filter.r;
            regions_arr = regions_arr_all;
        }

        someVar = regionController.buildQuery(regions_arr);
        rquery_pub = rquery_mod = someVar.rquery;
        regions_hash = someVar.rhash;
    } else if (filter.r === undefined && iAm.registered && iAm.user.regions.length && (!forUserId || !forUserId.equals(iAm.user._id))) {
        regions_hash = iAm.rhash;
        regions_cids = _.pluck(iAm.user.regions, 'cid');
        regions_arr = regions_arr_all = regionController.getRegionsArrFromHash(regions_hash, regions_cids);
    }
    if (regions_cids.length) {
        regions_cids = regions_cids.map(Number);
    }

    if (squery_public_only) {
        query_pub = {};  //Анонимам или при фильтрации для публичных отдаем только публичные

        if (filter.r === undefined && iAm.registered && iAm.user.regions.length) {
            rquery_pub = iAm.rquery; //Если фильтр не указан - отдаем по собственным регионам
        }
    } else if (forUserId && forUserId.equals(iAm.user._id)) {
        //Собственную галерею отдаем без удаленных(не админам) и без регионов в настройках, только по filter.r
        query_mod = {};
    } else {
        if (filter.r === undefined && iAm.user.regions.length) {
            rquery_pub = rquery_mod = iAm.rquery; //Если фильтр не указан - отдаем по собственным регионам
        }

        if (iAm.isAdmin) {
            //Админам отдаем все статусы
            query_mod = {};
        } else if (!iAm.user.role || iAm.user.role < 5) {
            //Ниже чем модераторам региона отдаем только публичные
            query_pub = {};
        } else if (iAm.isModerator) {
            //Региональным модераторам отдаем в своих регионах без удаленных, в остальных - только публичные

            if (!iAm.user.mod_regions.length || iAm.mod_regions_equals) {
                //Глобальным модераторам и региональным, у которых совпадают регионы модерирования с собственными,
                //(т.е. область модерирования включает в себя пользовательскую)
                //отдаем пользовательскую область как модерируемую
                query_mod = {};
            } else if (filter.r === 0 || !iAm.user.regions.length) {
                //Если запрашиваются все пользовательские регионы (т.е. весь мир),
                //то делаем глобальный запрос по публичным, а со статусами по модерируемым
                query_pub = {};
                query_mod = {};
                rquery_mod = iAm.mod_rquery;
            } else {
                //В случае, когда массив пользовательских и модерируемых регионов различается,
                //"вычитаем" публичные из модерируемых, получая два новых чистых массива

                var regions_pub = [], //Чистый массив публичных регионов
                    regions_mod = []; //Чистый массив модерируемых регионов

                //Если сам пользовательский регион или один из его родителей является модерируемым,
                //то включаем его в массив модерируемых
                for (i = regions_arr.length; i--;) {
                    region = regions_arr[i];
                    contained = false;

                    if (iAm.mod_rhash[region.cid]) {
                        contained = true;
                    } else if (region.parents) {
                        for (j = region.parents.length; j--;) {
                            if (iAm.mod_rhash[region.parents[j]]) {
                                contained = true;
                                break;
                            }
                        }
                    }
                    if (contained) {
                        regions_mod.push(region);
                    } else {
                        regions_pub.push(region);
                    }
                }

                //Если один из модерируемых регионов является дочерним какому-либо пользовательскому региону,
                //то включаем такой модерируемый регион в массив модерируемых,
                //несмотря на то, что родительский лежит в массиве публичных
                for (i = iAm.user.mod_regions.length; i--;) {
                    region = iAm.mod_rhash[iAm.user.mod_regions[i].cid];
                    if (region.parents) {
                        for (j = region.parents.length; j--;) {
                            if (regions_hash[region.parents[j]]) {
                                regions_mod.push(region);
                            }
                        }
                    }
                }

                if (regions_pub.length) {
                    query_pub = {};
                    someVar = regionController.buildQuery(regions_pub);
                    rquery_pub = someVar.rquery;
                }
                if (regions_mod.length) {
                    query_mod = {};
                    someVar = regionController.buildQuery(regions_mod);
                    rquery_mod = someVar.rquery;
                }
            }
        }
    }

    if (query_pub && squery_public_have) {
        query_pub.s = status.PUBLIC;
        if (rquery_pub) {
            _.assign(query_pub, rquery_pub);
        }
        result.s.push(status.PUBLIC);
    }
    if (!squery_public_have) {
        //Если указан фильтр и в нем нет публичных, удаляем запрос по ним
        query_pub = undefined;
    }
    if (query_mod) {
        if (filter.s && filter.s.length) {
            if (!query_pub && squery_public_have) {
                //Если запроса по публичным нет, но должен, то добавляем публичные в модерируемые
                //Это произойдет с админами и глобальными модераторами, так как у них один query_mod
                filter.s.push(status.PUBLIC);
            }
            if (filter.s.length === 1) {
                query_mod.s = filter.s[0];
            } else {
                query_mod.s = { $in: filter.s };
            }
            Array.prototype.push.apply(result.s, filter.s);
        } else if (!iAm.isAdmin) {
            query_mod.s = { $ne: status.REMOVE };
        }

        if (rquery_mod) {
            _.assign(query_mod, rquery_mod);
        }
    }

    if (query_pub && query_mod) {
        query = {
            $or: [
                query_pub,
                query_mod
            ]
        };
    } else {
        query = query_pub || query_mod;
    }

    if (query) {
        result.query = query;
        result.rcids = regions_cids;
        result.rhash = regions_hash;
        result.rarr = regions_arr_all;
    }

    //console.log(JSON.stringify(query));
    return result;
}

//Обнуляет статистику просмотров за день и неделю
var planResetDisplayStat = (function () {
    function resetStat() {
        var setQuery = { vdcount: 0 },
            needWeek = moment().utc().day() === 1; //Начало недели - понедельник

        if (needWeek) {
            setQuery.vwcount = 0;
        }
        Photo.update({ s: { $in: [status.PUBLIC, status.DEACTIVATE, status.REMOVE] } }, { $set: setQuery }, { multi: true }, function (err, count) {
            planResetDisplayStat();
            if (err) {
                return logger.error(err);
            }
            logger.info('Reset day' + (needWeek ? ' and week ' : ' ') + 'display statistics for %s photos', count);
        });
    }

    return function () {
        setTimeout(resetStat, moment().utc().add('d', 1).startOf('day').diff(moment().utc()) + 2000);
    };
}());

/**
 * Возвращает историю редактирования объекта (фотографии)
 * @param iAm Объект пользователя сессии
 * @param data Объект
 */
var giveObjHist = Bluebird.method(function (iAm, data) {
    if (!_.isObject(data) || !Number(data.cid) || !Number(data.fetchId)) {
        throw { message: msg.badParams };
    }

    var cid = Number(data.cid);
    var showDiff = !!data.showDiff;

    return findPhoto({ cid: cid }, { _id: 0 }, iAm)
        .bind({})
        .then(function (photo) {
            var historySelect = { _id: 0, cid: 0 };

            if (!showDiff) {
                historySelect.diff = 0;
            }

            return Bluebird.join(
                User.findOneAsync({ _id: photo.user }, { _id: 0, login: 1, avatar: 1, disp: 1 }, { lean: true }),
                PhotoHistory
                    .find({ cid: cid }, historySelect, { lean: true, sort: { stamp: 1 } })
                    .populate({ path: 'user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } })
                    .execAsync()
            );
        })
        .spread(function (photoUser, histories) {
            if (_.isEmpty(histories)) {
                throw { message: 'Для объекта еще нет истории' };
            }
            var haveDiff;

            var regions = {};
            var reasons = {};
            var result = [];
            var history;
            var values;
            var del;
            var i;
            var j;

            for (i = 0; i < histories.length; i++) {
                history = histories[i];

                if (!history.user || !history.stamp) {
                    logger.warn('Object %d has corrupted %dth history entry', cid, i);
                    continue;
                }

                values = history.values;

                // Если это первая запись с пустыми значениям - пропускаем
                if (i === 0 && _.isEmpty(values)) {
                    continue;
                }

                if (values) {
                    // Если выбран режим показа разницы и в этой записи она есть, присваиваем значения из разницы
                    if (history.diff) {
                        haveDiff = true;
                        for (j in history.diff) {
                            values[j] = history.diff[j];
                        }
                        delete history.diff;
                    }

                    // Если в этой записи измененись регионы, добавляем каждый из них в хэш для последующей выборки
                    if (values.regions) {
                        for (j = values.regions.length; j--;) {
                            regions[values.regions[j]] = 1;
                        }
                    }
                }

                // Убираем из удаленных поля year, т.к. будет выведено поле y
                if (!_.isEmpty(history.del)) {
                    del = history.del;
                    history.del = [];
                    for (j = 0; j < del.length; j++) {
                        if (del[j] !== 'year' && del[j] !== 'year2') {
                            history.del.push(del[j]);
                        }
                    }
                    if (!history.del.length) {
                        delete history.del;
                    }
                }

                if (history.roleregion) {
                    regions[history.roleregion] = 1;
                }

                // Если в этой записи есть причина (не нулевая/свободная), добавляем её в хэш для последующей выборки
                if (!_.isEmpty(history.reason) && history.reason.cid) {
                    reasons[history.reason.cid] = 1;
                }

                history.stamp = history.stamp.getTime();

                result.push(history);
            }

            result = { hists: result, fetchId: data.fetchId, haveDiff: haveDiff };

            // Если есть регионы, запрашиваем их объекты
            if (Object.keys(regions).length) {
                result.regions = regionController.fillRegionsHash(regions, ['cid', 'title_local']);
            }

            // Если есть причины, запрашиваем их заголовки
            reasons = Object.keys(reasons);
            if (reasons.length) {
                result.reasons = reasonController.getReasonHashFromCache(reasons);
            }

            return result;
        });
});


module.exports.loadController = function (app, db, io) {
    logger = log4js.getLogger("photo.js");

    Settings = db.model('Settings');
    User = db.model('User');
    Photo = db.model('Photo');
    PhotoMap = db.model('PhotoMap');
    PhotoHistory = db.model('PhotoHistory');
    Counter = db.model('Counter');
    Comment = db.model('Comment');
    UserObjectRel = db.model('UserObjectRel');
    UserSelfPublishedPhotos = db.model('UserSelfPublishedPhotos');

    PhotoCluster.loadController(app, db, io);
    PhotoConverter.loadController(app, db, io);

    planResetDisplayStat(); //Планируем очистку статистики

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        socket.on('createPhoto', function (data) {
            createPhotos(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('createPhotoCallback', resultData);
                });
        });

        socket.on('revokePhoto', function (data) {
            revokePhoto(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('revokePhotoCallback', resultData);
                });
        });

        socket.on('readyPhoto', function (data) {
            readyPhoto(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('readyPhotoResult', resultData);
                });
        });

        socket.on('revisionPhoto', function (data) {
            toRevision(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('revisionPhotoResult', resultData);
                });
        });

        socket.on('rejectPhoto', function (data) {
            rejectPhoto(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('rejectPhotoResult', resultData);
                });
        });

        socket.on('approvePhoto', function (data) {
            approvePhoto(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('approvePhotoResult', resultData);
                });
        });

        socket.on('disablePhoto', function (data) {
            activateDeactivate(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('disablePhotoResult', resultData);
                });
        });

        socket.on('removePhoto', function (data) {
            removePhoto(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('removePhotoResult', resultData);
                });
        });

        socket.on('removePhotoInc', function (data) {
            removePhotoIncoming(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('removePhotoIncCallback', resultData);
                });
        });

        socket.on('restorePhoto', function (data) {
            restorePhoto(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('restorePhotoResult', resultData);
                });
        });

        socket.on('givePhoto', function (data) {
            givePhotoForPage(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takePhoto', resultData);
                });
        });

        socket.on('givePhotosPublicIndex', function () {
            givePhotosPublicIndex(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takePhotosPublicIndex', resultData);
                });
        });

        socket.on('givePhotosPublicNoGeoIndex', function () {
            givePhotosPublicNoGeoIndex(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takePhotosPublicNoGeoIndex', resultData);
                });
        });

        socket.on('givePhotos', function (data) {
            givePhotosPS(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takePhotos', resultData);
                });
        });

        socket.on('giveUserPhotos', function (data) {
            giveUserPhotos(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserPhotos', resultData);
                });
        });

        socket.on('givePhotosForApprove', function (data) {
            givePhotosForApprove(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takePhotosForApprove', resultData);
                });
        });

        socket.on('giveUserPhotosAround', function (data) {
            giveUserPhotosAround(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserPhotosAround', resultData);
                });
        });

        socket.on('giveUserPhotosPrivate', function (data) {
            giveUserPhotosPrivate(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserPhotosPrivate', resultData);
                });
        });

        socket.on('givePhotosFresh', function (data) {
            givePhotosFresh(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takePhotosFresh', resultData);
                });
        });

        socket.on('giveNearestPhotos', function (data) {
            giveNearestPhotos(data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeNearestPhotos', resultData);
                });
        });

        socket.on('giveCanPhoto', function (data) {
            giveCanPhoto(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeCanPhoto', resultData);
                });
        });

        socket.on('savePhoto', function (data) {
            savePhoto(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('savePhotoResult', resultData);
                });
        });

        socket.on('giveObjHist', function (data) {
            giveObjHist(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true, fetchId: data && data.fetchId };
                })
                .then(function (resultData) {
                    socket.emit('takeObjHist', resultData);
                });
        });

        socket.on('getBounds', function (data) {
            getBounds(data)
                .catch(function (err) {
                    return { message: err.message, error: true, startAt: data.startAt };
                })
                .then(function (resultData) {
                    socket.emit('getBoundsResult', resultData);
                });
        });

        socket.on('convertPhotos', function (data) {
            convertPhotos(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('convertPhotosResult', resultData);
                });
        });

        socket.on('convertPhotosAll', function (data) {
            convertPhotosAll(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('convertPhotosAllResult', resultData);
                });
        });

        socket.on('giveNewPhotosLimit', function (data) {
            giveNewPhotosLimit(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeNewPhotosLimit', resultData);
                });
        });
    });
};
module.exports.findPhoto = findPhoto;
module.exports.permissions = permissions;
module.exports.buildPhotosQuery = buildPhotosQuery;
module.exports.savePhotoHistory = savePhotoHistory;


module.exports.core = core;