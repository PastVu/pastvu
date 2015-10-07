'use strict';

var _session = require('./_session.js'),
    User,
    Photo,
    Region,
    Comment,
    Counter,
    dbNative,
    dbEval,
    _ = require('lodash'),
    step = require('step'),
    Bluebird = require('bluebird'),
    Utils = require('../commons/Utils.js'),
    msg = {
        badParams: 'Bad params',
        deny: 'You do not have permission for this action',
        nouser: 'Requested user does not exist',
        noregion: 'Requested region does not exist'
    },
    async = require('async'),
    logger = require('log4js').getLogger("region.js"),
    loggerApp = require('log4js').getLogger("app.js"),

    DEFAULT_REGION,

    constants = require('./constants.js'),
    maxRegionLevel = constants.region.maxLevel,
    regionsAllSelectHash = Object.create(null),

    regionCacheHash = {}, // Хэш-кэш регионов из базы 'cid': {_id, cid, parents}
    regionCacheArr = [], // Массив-кэш регионов из базы [{_id, cid, parents}]

    nogeoRegion = { cid: 0, title_en: 'Where is it?', title_local: 'Где это?' },
    i;

import getDbAsync from './connection';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Region } from '../models/Region';
import { Comment } from '../models/Comment';
import { Counter } from '../models/Counter';

for (i = 0; i <= maxRegionLevel; i++) {
    regionsAllSelectHash['r' + i] = 1;
}

// Заполняем кэш (массив и хэш) регионов в память
function fillCache(cb) {
    return Region.findAsync(
        {},
        { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1 },
        { lean: true, sort: { cid: 1 } }
    )
        .then(function (regions) {
            const hash = {};
            let i = regions.length;

            while (i--) {
                hash[regions[i].cid] = regions[i];
            }
            hash['0'] = nogeoRegion; // Нулевой регион обозначает отсутствие координат

            regionCacheHash = hash;
            regionCacheArr = regions;

            module.exports.DEFAULT_REGION = DEFAULT_REGION = regions[0];
            logger.info('Region cache filled with ' + regions.length);
            loggerApp.info('Region cache filled with ' + regions.length);
        })
        .catch(function (err) {
            err.message = `FillCache: ${err.message}`;
            throw err;
        })
        .nodeify(cb);
}

function getRegionFromCache(cid) {
    return regionCacheHash[cid];
}
function getRegionsArrFromCache(cids) {
    var result = [];
    var region;

    for (var i = cids.length; i--;) {
        region = regionCacheHash[cids[i]];
        if (region !== undefined) {
            result.unshift(region);
        }
    }

    return result;
}

function getRegionsHashFromCache(cids) {
    var result = {};
    var region;

    for (var i = cids.length; i--;) {
        region = regionCacheHash[cids[i]];
        if (region !== undefined) {
            result[region.cid] = region;
        }
    }

    return result;
}
function getRegionsArrFromHash(hash, cids) {
    var result = [],
        i;

    if (cids) {
        for (i = 0; i < cids.length; i++) {
            result.push(hash[cids[i]]);
        }
    } else {
        for (i in hash) {
            if (hash[i] !== undefined) {
                result.push(hash[i]);
            }
        }
    }

    return result;
}
function fillRegionsHash(hash, fileds) {
    var i;
    if (fileds) {
        var j, len = fileds.length, region;
        for (i in hash) {
            region = regionCacheHash[i];
            hash[i] = {};
            for (j = 0; j < len; j++) {
                hash[i][fileds[j]] = region[fileds[j]];
            }
        }
    } else {
        for (i in hash) {
            hash[i] = regionCacheHash[i];
        }
    }
    return hash;
}


/**
 * Возвращает список регионов по массиву cid в том же порядке, что и переданный массив
 * @param cidArr Массив номеров регионов
 * @param [fields]
 */
var getOrderedRegionList = (function () {
    var defFields = { _id: 0, geo: 0, __v: 0 };

    return Bluebird.method(function (cidArr, fields) {
        if (_.isEmpty(cidArr)) {
            return [];
        }

        return Region.findAsync({ cid: { $in: cidArr } }, fields || defFields, { lean: true })
            .then(function (regions) {
                var parentsSortedArr = [];
                var parent;
                var i = cidArr.length;
                var parentfind = function (parent) {
                    return parent.cid === cidArr[i];
                };

                if (cidArr.length === regions.length) {
                    // $in не гарантирует такой же сортировки результата как искомого массива, поэтому приводим к сортировке искомого
                    while (i--) {
                        parent = _.find(regions, parentfind);
                        if (parent) {
                            parentsSortedArr.unshift(parent);
                        }
                    }
                }
                return parentsSortedArr;
            });
    });
}());

/**
 * Возвращает массив cid регионов объекта
 * @param obj Объект (фото, комментарий и т.д.)
 */
function getObjRegionCids(obj) {
    var result = [];
    var rcid;

    for (i = 0; i <= maxRegionLevel; i++) {
        rcid = obj['r' + i];
        if (rcid) {
            result.push(rcid);
        }
    }

    return result;
}

/**
 * Возвращает спопулированный массив регионов для заданного объекта
 * @param obj Объект (фото, комментарий и т.д.)
 * @param fields Выбранные поля регионов. Массив, а в случае fromDb - объект
 * @param [fromDb] Выбирать ли из базы (не все поля есть в кеше)
 */
var getObjRegionList = Bluebird.method(function (obj, fields, fromDb) {
    if (fromDb) {
        return getOrderedRegionList(getObjRegionCids(obj), fields);
    }

    var cidArr = [];
    var rcid;

    for (var i = 0; i <= maxRegionLevel; i++) {
        rcid = obj['r' + i];
        if (rcid) {
            cidArr.push(fields ? _.pick(regionCacheHash[rcid], fields) : regionCacheHash[rcid]);
        }
    }

    return cidArr;
});


//Выделяем максимальные уровни регионов, которые надо отображать в краткой региональной принадлежности фотографий/комментариев
//Максимальный уровень - тот, под которым у пользователя фильтруется по умолчанию более одного региона
//Например, при глобальной фильтрации максимальный уровень - страна, т.к. их множество
//При фильтрации по стране - максимальный уровень - субъект, т.к. их множество в стране, сл-но, надо отображать принадлежность к субъектам.
//Если в фильтрации несколько регионов разный стран, значит стран несколько и максимальный уровень - страна
//@returns {lvls: ['rn'], sel: {rn: 1, rn+1: 1, ..., rmax: 1}}
var getShortRegionsParams = (function () {
    var globalFilterParams = { lvls: ['r0', 'r1'], sel: regionsAllSelectHash };

    return function (rhash) {
        //Если хеша нет (например, аноним) или передан пустой хеш (значит глобальный фильтр), отдаём глобальные параметры
        if (!rhash || !Object.keys(rhash).length) {
            return globalFilterParams;
        }

        var regionLevels = new Array(maxRegionLevel + 1),
            regionLevelHash,
            regionParents,
            region,
            cid,
            i, j,
            result;

        for (cid in rhash) {
            region = rhash[cid];
            regionParents = region.parents;

            regionLevelHash = regionLevels[regionParents.length];
            if (regionLevelHash === undefined) {
                regionLevelHash = regionLevels[regionParents.length] = {};
            }
            regionLevelHash[cid] = true;

            for (i = 0; i < regionParents.length; i++) {
                regionLevelHash = regionLevels[i];
                if (regionLevelHash === undefined) {
                    regionLevelHash = regionLevels[i] = {};
                }
                regionLevelHash[regionParents[i]] = true;
            }
        }
        //Максимальный уровень для отображения, это тот на котором несколько регионов либо undefined (т.е. любое кол-во регионов)
        for (i = 0; i < regionLevels.length; i++) {
            if (!regionLevels[i] || Object.keys(regionLevels[i]).length > 1) {
                if (i === 0) {
                    //Если это нулевой уровень (т.е. отображаем страны), то берем глобальную преднастройку
                    result = globalFilterParams;
                } else {
                    result = { lvls: ['r' + i], sel: Object.create(null) };

                    //Начиная с этого уровня заполняем хэш выбираемых уровней регионов у объекта ({rn: 1, rn+1: 1, ..., rmax: 1}),
                    //просто чтобы не выбирать лишние вышестоящие в каждом запросе к объекту
                    for (j = i; j <= maxRegionLevel; j++) {
                        result.sel['r' + j] = 1;
                    }
                }
                break;
            }
        }
        //Если в прошлом цикле не нашли уровень, значит выбран последний уровень ветки и надо отдать пустые объекты
        if (!result) {
            result = { lvls: [], sel: Object.create(null) };
        }

        return result;
    };
}());

//Бежит по массиву переданных объектов и для каждого создает массив cid регионов,
//которые соответствуют переданным уровням для краткого отображения регионов
//Изменяет элементы переданного массива и возвращает хеш попавших регионов
var genObjsShortRegionsArr = (function () {
    var defalutLevels = ['r0', 'r1'];

    return function (objs, showlvls, dropRegionsFields) {
        var shortRegionsHash = {},
            i = objs.length,
            level,
            cid,
            obj,
            j, k;

        if (!showlvls) {
            showlvls = defalutLevels;
        }

        while (i--) {
            obj = objs[i];

            for (j = maxRegionLevel; j--;) {
                level = 'r' + j;
                cid = obj[level];
                if (cid !== undefined) {
                    shortRegionsHash[cid] = true;
                    obj.rs = [cid];

                    for (k = showlvls.length; k--;) {
                        if (showlvls[k] !== level) {
                            cid = obj[showlvls[k]];
                            if (cid !== undefined) {
                                shortRegionsHash[cid] = true;
                                obj.rs.push(cid);
                            }
                        }
                    }
                    break;
                }
            }
            //Если у объекта нет координаты, значит он относится к "где это?" и
            //добавляем для информирования об этом 0 в начале краткого списка регионов
            //Если регионов нет (без координат и регионов могут быть новые), то в списке будет только 0
            if (!obj.geo) {
                if (!obj.rs) {
                    obj.rs = [0];
                } else {
                    obj.rs.unshift(0);
                }
                shortRegionsHash['0'] = true;
            }
            //Если передан флаг, что надо удалить поля rn, делаем это
            if (dropRegionsFields === true) {
                delete obj.geo;
                for (j = 0; j <= maxRegionLevel; j++) {
                    delete obj['r' + j];
                }
            }
        }
        if (Object.keys(shortRegionsHash).length) {
            fillRegionsHash(shortRegionsHash, ['cid', 'title_local']);
        } else {
            shortRegionsHash = undefined;
        }
        return shortRegionsHash;
    };
}());

/**
 * Пересчет входящих объектов в переданный регион.
 * Сначала очищается текущее присвоение всех объектов данному региону, затем заново ищутся объекты, входящие в полигон региона
 * @param cidOrRegion
 * @param cb
 */
function calcRegionIncludes(cidOrRegion, cb) {
    if (!cb) {
        cb = Utils.dummyFn;
    }

    if (typeof cidOrRegion === 'number') {
        Region.findOne({ cid: cidOrRegion }, { _id: 0, cid: 1, parents: 1, geo: 1 }, { lean: true }, doCalc);
    } else {
        doCalc(null, cidOrRegion);
    }

    function doCalc(err, region) {
        if (err || !region) {
            return cb({
                message: ('Region [' + cidOrRegion + '] find for calcRegionIncludes error: ' + (err && err.message) || 'doesn\'t exists'),
                error: true
            });
        }
        var level = 'r' + region.parents.length,
            queryObject = { geo: { $exists: true } },
            setObject,
            resultStat = {};

        queryObject[level] = region.cid;
        step(
            function () {
                //Сначала очищаем присвоение текущего региона объектам с координатой,
                //чтобы убрать те объекты, которые больше не будут в него попадать
                setObject = { $unset: {} };

                setObject.$unset[level] = 1;
                Photo.update(queryObject, setObject, { multi: true }, this.parallel());
                Comment.update(queryObject, setObject, { multi: true }, this.parallel());
            },
            function (err, photosCountBefore, commentsCountBefore) {
                if (err) {
                    return cb(err);
                }
                resultStat.photosCountBeforeGeo = photosCountBefore || 0;
                resultStat.commentsCountBefore = commentsCountBefore || 0;

                //Теперь присваиваем этот регион всем, входящим в его полигон
                setObject = { $set: {} };
                setObject.$set[level] = region.cid;

                Photo.update({ geo: { $geoWithin: { $geometry: region.geo } } }, setObject, { multi: true }, this.parallel());
                Comment.update({ geo: { $geoWithin: { $geometry: region.geo } } }, setObject, { multi: true }, this.parallel());
            },
            function (err, photosCountAfter, commentsCountAfter) {
                if (err) {
                    return cb(err);
                }
                resultStat.photosCountAfterGeo = photosCountAfter || 0;
                resultStat.commentsCountAfter = commentsCountAfter || 0;
                cb(null, resultStat);
            }
        );
    }
}
const calcRegionIncludesPromised = Bluebird.promisify(calcRegionIncludes); // TODO: hack, make async calcRegionIncludes

/**
 * Пересчет входящих объектов в переданный список регионов. Если список пуст - пересчет всех регионов
 * @param iAm
 * @param cids Массив cid регионов
 */
var calcRegionsIncludes = Bluebird.method(function (iAm, cids) {
    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!Array.isArray(cids)) {
        throw { message: msg.badParams };
    }

    if (!cids.length) {
        //Если массив пуст - пересчитываем все фотографии
        return dbEval('function () {regionsAssignObjects()', [], { nolock: true })
            .then(function (ret) {
                if (ret && ret.error) {
                    throw { message: ret.message };
                }

                return ret;
            });
    } else {
        return new Promise(function (resolve, reject) {
            //Проходим по каждому региону и пересчитываем
            (function iterate(i) {
                calcRegionIncludes(cids[i], function (err) {
                    if (err) {
                        reject({ message: err.message });
                    }

                    if (++i < cids.length) {
                        iterate();
                    } else {
                        resolve({ message: 'ok' });
                    }
                });
            }(0));
        });
    }
});

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов
 * @param region Объект региона
 * @param [cb]
 */
var getChildsLenByLevel = Bluebird.method(function (region, cb) {
    var level = region.parents && region.parents.length || 0; // Уровень региона равен кол-ву родительских
    var childrenQuery = {};
    var promises = [];

    if (level < maxRegionLevel) {
        // Ищем кол-во потомков по уровням
        // У таких регионов на позиции текущего уровня будет стоять этот регион
        // и на кажой итераци кол-во уровней будет на один больше текущего
        // Например, потомки региона 77, имеющего одного родителя, будут найдены так:
        // {'parents.1': 77, parents: {$size: 2}}
        // {'parents.1': 77, parents: {$size: 3}}
        // {'parents.1': 77, parents: {$size: 4}}
        childrenQuery['parents.' + level] = region.cid;
        while (level++ < maxRegionLevel) { // level инкрементируется после сравнения
            childrenQuery.parents = { $size: level };
            promises.push(Region.countAsync(childrenQuery));
        }
    }

    // Если уровень максимальный - просто переходим на следующий шаг
    return Bluebird.all(promises)
        .then(function (childCounts) {
            var childLenArr = [];

            for (var i = 0; i < childCounts.length; i++) {
                if (childCounts[i]) {
                    childLenArr.push(childCounts[i]);
                }
            }

            return childLenArr;
        })
        .nodeify(cb);
});

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов по уровням
 * @param region Объект региона
 * @param cb
 */
var getParentsAndChilds = function (region, cb) {
    var level = region.parents && region.parents.length || 0; // Уровень региона равен кол-ву родительских
    var promises = [getChildsLenByLevel(region)];

    // Если есть родительские регионы - вручную их "популируем"
    if (level) {
        promises.push(getOrderedRegionList(region.parents));
    }

    return Bluebird.all(promises).nodeify(cb, { spread: true });
};

function changeRegionParentExternality(region, oldParentsArray, childLenArray, cb) {
    var moveTo,
        levelWas = oldParentsArray.length,
        levelNew = region.parents.length,
        levelDiff = Math.abs(levelWas - levelNew), //Разница в уровнях
        regionsDiff, //Массив cid добавляемых/удаляемых регионов
        childLen = childLenArray.length,
        resultData = {},
        i;

    if (!levelNew ||
        (levelNew < levelWas && _.isEqual(oldParentsArray.slice(0, levelNew), region.parents))) {
        moveTo = 'up';
        regionsDiff = _.difference(oldParentsArray, region.parents);
    } else if (levelNew > levelWas && _.isEqual(region.parents.slice(0, levelWas), oldParentsArray)) {
        moveTo = 'down';
        regionsDiff = _.difference(region.parents, oldParentsArray);
    } else {
        moveTo = 'anotherBranch';
    }

    if (moveTo === 'up') {
        step(
            function () {
                countAffectedPhotos(this.parallel());
                //Удаляем убранные родительские регионы у потомков текущего региона, т.е. поднимаем их тоже
                Region.update({ parents: region.cid }, { $pull: { parents: { $in: regionsDiff } } }, { multi: true }, this.parallel());
            },
            function (err, affected) {
                if (err) {
                    return cb(err);
                }
                resultData.affectedPhotos = affected.photos || 0;
                resultData.affectedComments = affected.comments || 0;

                if (!resultData.affectedPhotos) {
                    return cb(null, resultData);
                }
                //Последовательно поднимаем фотографии на уровни регионов вверх
                pullPhotosRegionsUp(this);
            },
            function (err) {
                cb(err, resultData);
            }
        );
    } else if (moveTo === 'down') {
        step(
            function () {
                countAffectedPhotos(this.parallel());
                //Вставляем добавленные родительские регионы у потомков текущего региона, т.е. опускаем их тоже
                Region.collection.update({ parents: region.cid }, {
                    $push: {
                        parents: {
                            $each: regionsDiff,
                            $position: levelWas
                        }
                    }
                }, { multi: true }, this.parallel());
            },
            function (err, affected) {
                if (err) {
                    return cb(err);
                }
                resultData.affectedPhotos = affected.photos || 0;
                resultData.affectedComments = affected.comments || 0;

                if (!resultData.affectedPhotos) {
                    return this();
                }
                //Последовательно опускаем фотографии на уровни регионов вниз
                pushPhotosRegionsDown(this);
            },
            function (err) {
                if (err) {
                    return cb(err);
                }
                //Вставляем на место сдвинутых новые родительские
                refillPhotosRegions(levelWas, levelNew, this);
            },
            function (err) {
                if (err) {
                    return cb(err);
                }
                //Удаляем подписки и модерирование дочерних, если есть на родительские
                dropChildRegionsForUsers(region.parents, region.cid, this);
            },
            function (err, result) {
                if (err) {
                    return cb(err);
                }
                _.assign(resultData, result);
                cb(null, resultData);
            }
        );
    } else if (moveTo === 'anotherBranch') {
        step(
            function () {
                //Удаляем всех родителей текущего региона у потомков текущего региона
                Region.update({ parents: region.cid }, { $pull: { parents: { $in: oldParentsArray } } }, { multi: true }, this.parallel());
            },
            function (err) {
                if (err) {
                    return cb(err);
                }
                countAffectedPhotos(this.parallel());
                //Вставляем все родительские регионы переносимого региона его потомкам
                Region.collection.update({ parents: region.cid }, {
                    $push: {
                        parents: {
                            $each: region.parents,
                            $position: 0
                        }
                    }
                }, { multi: true }, this.parallel());
            },
            function (err, affected) {
                if (err) {
                    return cb(err);
                }
                resultData.affectedPhotos = affected.photos || 0;
                resultData.affectedComments = affected.comments || 0;

                if (!resultData.affectedPhotos || levelNew === levelWas) {
                    return this();
                }

                if (levelNew < levelWas) {
                    pullPhotosRegionsUp(this);
                } else if (levelNew > levelWas) {
                    pushPhotosRegionsDown(this);
                }
            },
            function (err) {
                if (err) {
                    return cb(err);
                }
                if (!resultData.affectedPhotos) {
                    return this();
                }
                //Присваиваем фотографиям новые родительские регионы выше уровня переносимого
                refillPhotosRegions(0, levelNew, this);
            },
            function (err) {
                if (err) {
                    return cb(err);
                }
                //Удаляем подписки и модерирование дочерних, если есть на родительские
                dropChildRegionsForUsers(region.parents, region.cid, this);
            },
            function (err, result) {
                if (err) {
                    return cb(err);
                }
                _.assign(resultData, result);
                cb(null, resultData);
            }
        );
    }


    //Считаем, сколько фотографий принадлежит текущему региону
    function countAffectedPhotos(cb) {
        var querycount = {};
        querycount['r' + levelWas] = region.cid;
        step(
            function () {
                Photo.count(querycount, this.parallel());
                Comment.count(querycount, this.parallel());
            },
            function (err, photos, comments) {
                cb(err, { photos: photos, comments: comments });
            }
        );
    }

    //Последовательно поднимаем фотографии на уровни регионов вверх
    //Для этого сначала переименовываем поле уровня поднимаемого региона по имени нового уровня, а
    //затем переименовываем дочерние уровни также вверх
    function pullPhotosRegionsUp(cb) {
        var serialUpdates = [],
            queryObj,
            setObj,
            updateParamsClosure = function (q, u) {
                //Замыкаем параметры выборки и переименования
                return function () {
                    var cb = _.last(arguments);
                    //$rename делаем напрямую через collection, https://github.com/LearnBoost/mongoose/issues/1845
                    step(
                        function () {
                            Photo.collection.update(q, u, { multi: true }, this.parallel());
                            Comment.collection.update(q, u, { multi: true }, this.parallel());
                        },
                        cb
                    );
                };
            };

        //Удаляем все поля rX, которые выше поднимаего уровня до его нового значения
        //Это нужно в случае, когда поднимаем на больше чем один уровень,
        //т.к. фотографии присвоенные только этому региону (а не его потомкам), оставят присвоение верхних,
        //т.к. $rename работает в случае присутствия поля и не удалит существующее, если переименовываемого нет
        if (levelDiff > 1) {
            queryObj = {};
            queryObj['r' + levelWas] = region.cid;
            setObj = { $unset: {} };
            for (i = levelNew; i < levelWas; i++) {
                setObj.$unset['r' + i] = 1;
            }
            serialUpdates.push(updateParamsClosure(queryObj, setObj));
        }

        //Переименовываем последовательно на уровни вверх, начиная с верхнего переносимого
        queryObj = {};
        queryObj['r' + levelWas] = region.cid;
        for (i = levelWas; i <= levelWas + childLen; i++) {
            if (i === (levelWas + 1)) {
                //Фотографии, принадлежащие к потомкам по отношению к поднимаемому региону,
                //должны выбираться уже по принадлежности к новому уровню, т.к. их подвинули на первом шаге
                queryObj = {};
                queryObj['r' + levelNew] = region.cid;
            }
            setObj = { $rename: {} };
            setObj.$rename['r' + i] = 'r' + (i - levelDiff);
            serialUpdates.push(updateParamsClosure(queryObj, setObj));
        }

        //Запускаем последовательное обновление по подготовленным параметрам
        async.waterfall(serialUpdates, cb);
    }

    //Последовательно опускаем фотографии на уровни регионов вниз
    //Начинаем переименование полей с последнего уровня
    function pushPhotosRegionsDown(cb) {
        var serialUpdates = [],
            queryObj,
            setObj,
            updateParamsClosure = function (q, u) {
                //Замыкаем параметры выборки и переименования
                return function () {
                    var cb = _.last(arguments);
                    step(
                        function () {
                            Photo.collection.update(q, u, { multi: true }, this.parallel());
                            Comment.collection.update(q, u, { multi: true }, this.parallel());
                        },
                        cb
                    );
                };
            };

        queryObj = {};
        queryObj['r' + levelWas] = region.cid;
        for (i = levelWas + childLen; i >= levelWas; i--) {
            setObj = { $rename: {} };
            setObj.$rename['r' + i] = 'r' + (i + levelDiff);
            serialUpdates.push(updateParamsClosure(queryObj, setObj));
        }

        async.waterfall(serialUpdates, cb);
    }

    //Вставляем на место сдвинутых новые родительские
    function refillPhotosRegions(levelFrom, levelTo, cb) {
        var queryObj = {},
            setObj = {},
            i;
        queryObj['r' + levelTo] = region.cid;
        for (i = levelFrom; i < levelTo; i++) {
            setObj['r' + i] = region.parents[i];
        }
        step(
            function () {
                Photo.collection.update(queryObj, { $set: setObj }, { multi: true }, this.parallel());
                Comment.collection.update(queryObj, { $set: setObj }, { multi: true }, this.parallel());
            },
            cb
        );
    }

    //Удаляем у пользователей и модераторов подписку на дочерние регионы, если они подписаны на родительские
    function dropChildRegionsForUsers(parentsCids, childBranchCid, cb) {
        step(
            function () {
                //Находим _id новых родительских регионов
                Region.find({ cid: { $in: region.parents } }, { _id: 1 }, { lean: true }, this.parallel());
                //Находим _id всех регионов, дочерних переносимому
                Region.find({ parents: region.cid }, { _id: 1 }, { lean: true }, this.parallel());
            },
            function (err, parentRegions, childRegions) {
                if (err) {
                    return cb(err);
                }
                var parentRegionsIds = _.pluck(parentRegions, '_id'), //Массив _id родительских регионов
                    movingRegionsIds = _.pluck(childRegions, '_id'); //Массив _id регионов, переносимой ветки (т.е. сам регион и его потомки)
                movingRegionsIds.unshift(region._id);

                //Удаляем подписку тех пользователей на перемещаемые регионы,
                //у которых есть подписка и на новые родительские регионы, т.к. в этом случае у них автоматическая подписка на дочерние
                User.update({
                    $and: [
                        { regions: { $in: parentRegionsIds } },
                        { regions: { $in: movingRegionsIds } }
                    ]
                }, { $pull: { regions: { $in: movingRegionsIds } } }, { multi: true }, this.parallel());

                //Тоже самое с модераторскими регионами
                User.update({
                    $and: [
                        { mod_regions: { $in: parentRegionsIds } },
                        { mod_regions: { $in: movingRegionsIds } }
                    ]
                }, { $pull: { mod_regions: { $in: movingRegionsIds } } }, { multi: true }, this.parallel());
            },
            function (err, affectedUsers, affectedMods) {
                if (err) {
                    return cb(err);
                }
                cb(null, { affectedUsers: affectedUsers || 0, affectedMods: affectedMods || 0 });
            }
        );
    }
}
const changeRegionParentExternalityPromised = Bluebird.promisify(changeRegionParentExternality); // TODO: hack

/**
 * Save/Create region
 * @param iAm
 * @param data
 */
async function saveRegion(iAm, data) {
    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    if (!_.isObject(data) || !data.title_en || !data.title_local) {
        throw { message: msg.badParams };
    }

    data.title_en = data.title_en.trim();
    data.title_local = data.title_local.trim();
    if (!data.title_en || !data.title_local) {
        throw { message: msg.badParams };
    }

    data.parent = data.parent && Number(data.parent);

    let parentsArray;

    if (data.parent) {
        if (data.cid && data.cid === data.parent) {
            throw { message: 'You trying to specify a parent himself' };
        }

        const parentRegion = await Region.findOneAsync(
            { cid: data.parent }, { _id: 0, cid: 1, parents: 1 }, { lean: true }
        );

        if (_.isEmpty(parentRegion)) {
            throw { message: `Such parent region doesn't exists` };
        }

        parentsArray = parentRegion.parents || [];

        if (data.cid && parentsArray.includes(data.cid)) {
            throw { message: 'You specify the parent, which already has this region as his own parent' };
        }

        parentsArray.push(parentRegion.cid);
    } else {
        parentsArray = [];
    }

    if (typeof data.geo === 'string') {
        try {
            data.geo = JSON.parse(data.geo);
        } catch (err) {
            throw { message: `GeoJSON parse error! ${err.message}` };
        }

        if (data.geo.type === 'GeometryCollection') {
            data.geo = data.geo.geometries[0];
        }

        if (Object.keys(data.geo).length !== 2 ||
            !Array.isArray(data.geo.coordinates) || !data.geo.coordinates.length ||
            !data.geo.type || (data.geo.type !== 'Polygon' && data.geo.type !== 'MultiPolygon')) {
            throw { message: `It's not GeoJSON geometry!` };
        }
    } else if (data.geo) {
        delete data.geo;
    }

    let region;
    let parentChange;
    let parentsArrayOld;
    let childLenArray;
    const resultStat = {};

    if (!data.cid) {
        // Create new region object
        const count = await Counter.incrementAsync('region');

        if (!count) {
            throw ({ message: 'Increment comment counter error' });
        }

        region = new Region({ cid: count.next, parents: parentsArray });
    } else {
        // Find region by cid
        region = await Region.findOneAsync({ cid: data.cid });

        if (!region) {
            throw ({ message: `Such region doesn't exists` });
        }

        parentChange = !_.isEqual(parentsArray, region.parents);

        if (parentChange) {
            childLenArray = await getChildsLenByLevel(region);
        }

        if (parentChange) {
            if (parentsArray.length > region.parents.length &&
                (parentsArray.length + childLenArray.length > maxRegionLevel)) {
                throw ({
                    message: `After moving the region, ` +
                    `it or its descendants will be greater than the maximum level (${maxRegionLevel + 1}).`
                });
            }

            parentsArrayOld = region.parents;
            region.parents = parentsArray;
        }

        region.udate = new Date();
    }

    // If 'geo' was updated - write it, marking modified, because it has type Mixed
    if (data.geo) {
        // If multipolygon contains only one polygon, take it and make type Polygon
        if (data.geo.type === 'MultiPolygon' && data.geo.coordinates.length === 1) {
            data.geo.coordinates = data.geo.coordinates[0];
            data.geo.type = 'Polygon';
        }

        // Count number of points
        region.pointsnum = data.geo.type === 'Point' ? 1 : Utils.calcGeoJSONPointsNum(data.geo.coordinates);

        if (data.geo.type === 'Polygon' || data.geo.type === 'MultiPolygon') {

            // TODO: determine polygon intersection, they must be segments inside one polygon,
            // then sort segments in one polygon by its area
            /// *if (data.geo.type === 'MultiPolygon') {
            //    data.geo.coordinates.forEach(
            //        polygon => polygon.length > 1 ? polygon.sort(Utils.sortPolygonSegmentsByArea) : null
            //    );
            // } else if (data.geo.coordinates.length > 1) {
            //    data.geo.coordinates.sort(Utils.sortPolygonSegmentsByArea);
            // }*/

            // Count number of segments
            region.polynum = Utils.calcGeoJSONPolygonsNum(data.geo);
        } else {
            region.polynum = { exterior: 0, interior: 0 };
        }

        // Compute bbox
        region.bbox = Utils.geo.polyBBOX(data.geo).map(Utils.math.toPrecision6);

        region.geo = data.geo;
        region.markModified('geo');
        region.markModified('polynum');
    }

    if (Utils.geo.checkbboxLatLng(data.bboxhome)) {
        region.bboxhome = Utils.geo.bboxReverse(data.bboxhome).map(Utils.math.toPrecision6);
    } else if (data.bboxhome === null) {
        region.bboxhome = undefined; // If null received, need to remove it, so it bocome automatic
    }

    if (data.centerAuto || !Utils.geo.checkLatLng(data.center)) {
        if (data.geo || !region.centerAuto) {
            region.centerAuto = true;
            // If Polygon - its center of gravity takes as the center, if MultiPolygon - center of bbox
            region.center = Utils.geo.geoToPrecision(region.geo.type === 'MultiPolygon' ?
                [(region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2] :
                Utils.geo.polyCentroid(region.geo.coordinates[0])
            );
        }
    } else {
        region.centerAuto = false;
        region.center = Utils.geo.geoToPrecision(data.center.reverse());
    }

    region.title_en = String(data.title_en);
    region.title_local = data.title_local ? String(data.title_local) : undefined;

    region = (await region.saveAsync())[0].toObject();

    // If coordinates changed, compute included objects
    if (data.geo) {
        try {
            const geoRecalcRes = await calcRegionIncludesPromised(region);

            if (geoRecalcRes) {
                Object.assign(resultStat, geoRecalcRes);
            }
        } catch (err) {
            throw { message: `Saved, but while calculating included photos for the new geojson: ${err.message}` };
        }
    }

    // If parents changed, compute all dependences from level
    if (parentChange) {
        try {
            const moveRes = await changeRegionParentExternalityPromised(region, parentsArrayOld, childLenArray);

            if (moveRes) {
                Object.assign(resultStat, moveRes);
            }
        } catch (err) {
            throw { message: `Saved, but while change parent externality: ${err.message}` };
        }
    }

    try {
        await fillCache(); // Refresh regions cache
    } catch (err) {
        throw { message: `Saved, but while refilling cache: ${err.message}` };
    }

    const [childLenArr, parentsSortedArr] = await getParentsAndChilds(region);

    if (parentsSortedArr) {
        region.parents = parentsSortedArr;
    }

    if (data.geo) {
        region.geo = JSON.stringify(region.geo);
    } else {
        delete region.geo;
    }
    if (region.center) {
        region.center.reverse();
    }
    if (region.bbox !== undefined) {
        if (Utils.geo.checkbbox(region.bbox)) {
            region.bbox = Utils.geo.bboxReverse(region.bbox);
        } else {
            delete region.bbox;
        }
    }
    if (region.bboxhome !== undefined) {
        if (Utils.geo.checkbbox(region.bboxhome)) {
            region.bboxhome = Utils.geo.bboxReverse(region.bboxhome);
        } else {
            delete region.bboxhome;
        }
    }

    // Update online users whose current region saved as home region or filtered by default of moderated
    _session.regetUsers(function (usObj) {
        return usObj.rhash && usObj.rhash[region.cid] ||
            usObj.mod_rhash && usObj.mod_rhash[region.cid] ||
            usObj.user.regionHome && usObj.user.regionHome.cid === region.cid;
    }, true);

    return { childLenArr, region, resultStat };
}

/**
 * Удаление региона администратором
 * Параметр reassignChilds зарезервирован - перемещение дочерних регионов в другой при удалении
 * @param iAm
 * @param data
 * @param cb
 * @returns {*}
 */
function removeRegion(iAm, data, cb) {
    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }

    if (!_.isObject(data) || !data.cid) {
        return cb({ message: msg.badParams, error: true });
    }

    Region.findOne({ cid: data.cid }, function (err, regionToRemove) {
        if (err) {
            return cb({ message: err.message, error: true });
        }
        if (!regionToRemove) {
            return cb({ message: 'Deleting region does not exists', error: true });
        }
//		if (data.reassignChilds && !regionToReassignChilds) {
//			return cb({message: 'Region for reassign descendants does not exists', error: true});
//		}

        var removingLevel = regionToRemove.parents.length,
            removingRegionsIds, //Номера всех удаляемых регионов
            resultData = {};

        step(
            function () {
                var parentQuery;

                //Находим все дочерние регионы
                Region.find({ parents: regionToRemove.cid }, { _id: 1 }, { lean: true }, this.parallel());

                //Находим родительский регион для замены домашнего региона пользователей, если он попадает в удаляемый
                //Если родительского нет (удаляем страну) - берем любую другую страну
                if (removingLevel) {
                    parentQuery = { cid: regionToRemove.parents[regionToRemove.parents.length - 1] };
                } else {
                    parentQuery = { cid: { $ne: regionToRemove.cid }, parents: { $size: 0 } };
                }
                Region.findOne(parentQuery, { _id: 1, cid: 1, title_en: 1 }, { lean: true }, this.parallel());
            },
            function (err, childRegions, parentRegion) {
                if (err || !parentRegion) {
                    return cb({ message: err && err.message || "Can't find parent", error: true });
                }
                removingRegionsIds = childRegions ? _.pluck(childRegions, '_id') : [];
                removingRegionsIds.push(regionToRemove._id);

                //Заменяем домашние регионы
                User.update({ regionHome: { $in: removingRegionsIds } }, { $set: { regionHome: parentRegion._id } }, { multi: true }, this.parallel());
                resultData.homeReplacedWith = parentRegion;

                //Отписываем ("мои регионы") всех пользователей от удаляемых регионов
                User.update({ regions: { $in: removingRegionsIds } }, { $pull: { regions: { $in: removingRegionsIds } } }, { multi: true }, this.parallel());

                //Удаляем регионы из модерируемых пользователями
                removeRegionsFromMods({ mod_regions: { $in: removingRegionsIds } }, removingRegionsIds, this.parallel());
            },
            function (err, homeAffectedUsers, affectedUsers, modsResult) {
                if (err) {
                    return cb({ message: err.message, error: true });
                }
                resultData.homeAffectedUsers = homeAffectedUsers;
                resultData.affectedUsers = affectedUsers;
                _.assign(resultData, modsResult);

                var objectsMatchQuery = {},
                    objectsUpdateQuery = { $unset: {} },
                    i;

                objectsMatchQuery['r' + removingLevel] = regionToRemove.cid;
                if (removingLevel === 0) {
                    //Если удаляем страну, то присваивам все её объекты Открытому морю
                    objectsUpdateQuery.$set = { r0: 1000000 };
                    for (i = 1; i <= maxRegionLevel; i++) {
                        objectsUpdateQuery.$unset['r' + i] = 1;
                    }
                } else {
                    for (i = removingLevel; i <= maxRegionLevel; i++) {
                        objectsUpdateQuery.$unset['r' + i] = 1;
                    }
                }

                Photo.update(objectsMatchQuery, objectsUpdateQuery, { multi: true }, this.parallel()); //Обновляем входящие фотографии
                Comment.update(objectsMatchQuery, objectsUpdateQuery, { multi: true }, this.parallel()); //Обновляем входящие комментарии фотографий
                Region.remove({ parents: regionToRemove.cid }, this.parallel()); //Удаляем дочерние регионы
                regionToRemove.remove(this.parallel()); //Удаляем сам регион
            },
            function (err, affectedPhotos, affectedComments) {
                if (err) {
                    return cb({ message: err.message, error: true });
                }
                resultData.affectedPhotos = affectedPhotos || 0;
                resultData.affectedComments = affectedComments || 0;
                fillCache(this); // Обновляем кэш регионов
            },
            function (err) {
                if (err) {
                    return cb({ message: err.message, error: true });
                }
                resultData.removed = true;

                //Если задеты какие-то пользователи, обновляем всех онлайн-пользователей, т.к. конкретных мы не знаем
                if (resultData.homeAffectedUsers || resultData.affectedUsers || resultData.affectedMods) {
                    _session.regetUsers('all', true);
                }
                cb(resultData);
            }
        );
    });
}


function removeRegionsFromMods(usersQuery, regionsIds, cb) {
    //Находим всех модераторов удаляемых регионов
    User.find(usersQuery, { cid: 1 }, { lean: true }, function (err, modUsers) {
        if (err) {
            return cb(err);
        }
        var modUsersCids = modUsers ? _.pluck(modUsers, 'cid') : [],
            resultData = {};

        if (modUsersCids.length) {
            //Удаляем регионы у найденных модераторов, в которых они есть
            User.update({ cid: { $in: modUsersCids } }, { $pull: { mod_regions: { $in: regionsIds } } }, { multi: true }, function (err, affectedMods) {
                if (err) {
                    return cb(err);
                }
                resultData.affectedMods = affectedMods || 0;

                //Лишаем звания модератора тех модераторов, у которых после удаления регионов, не осталось модерируемых регионов
                User.update({ cid: { $in: modUsersCids }, mod_regions: { $size: 0 } }, {
                    $unset: {
                        role: 1,
                        mod_regions: 1
                    }
                }, { multi: true }, function (err, affectedModsLose) {
                    if (err) {
                        return cb(err);
                    }
                    resultData.affectedModsLose = affectedModsLose || 0;
                    cb(null, resultData);
                });
            });
        } else {
            resultData.affectedMods = 0;
            resultData.affectedModsLose = 0;
            cb(null, resultData);
        }
    });
}

function getRegion(iAm, data, cb) {
    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }

    if (!_.isObject(data) || !data.cid) {
        return cb({ message: msg.badParams, error: true });
    }

    Region.findOne({ cid: data.cid }, { _id: 0, __v: 0 }, { lean: true }, function (err, region) {
        if (err || !region) {
            return cb({ message: err && err.message || 'Such region doesn\'t exists', error: true });
        }

        getParentsAndChilds(region, function (err, childLenArr, parentsSortedArr) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            if (parentsSortedArr) {
                region.parents = parentsSortedArr;
            }

            //Клиенту отдаем стрингованный geojson
            region.geo = JSON.stringify(region.geo);

            if (region.center) {
                region.center.reverse();
            }
            if (region.bbox !== undefined) {
                if (Utils.geo.checkbbox(region.bbox)) {
                    region.bbox = Utils.geo.bboxReverse(region.bbox);
                } else {
                    delete region.bbox;
                }
            }
            if (region.bboxhome !== undefined) {
                if (Utils.geo.checkbbox(region.bboxhome)) {
                    region.bboxhome = Utils.geo.bboxReverse(region.bboxhome);
                } else {
                    delete region.bboxhome;
                }
            }

            cb({ childLenArr: childLenArr, region: region });
        });
    });
}


//Массив количества всех регионов по уровням
function getRegionsCountByLevel(cb) {
    step(
        function () {
            for (var i = 0; i <= maxRegionLevel; i++) {
                Region.count({ parents: { $size: i } }, this.parallel());
            }
        },
        function (err/*, childCounts*/) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            var childLenArr = [],
                i;

            for (i = 1; i < arguments.length; i++) {
                if (arguments[i]) {
                    childLenArr.push(arguments[i]);
                }
            }
            cb(null, childLenArr);
        }
    );
}
//Статистика регионов по уровням (количество регионов, количество их точек)
function getRegionsStatByLevel(cb) {
    step(
        function () {
            Region.collection.aggregate([
                { $project: { _id: 0, level: { $size: '$parents' }, pointsnum: 1 } }, //Поля для выборки. level - формируемое поле размера массива родительских, т.е. уровень. Появилось в 2.5.3 https://jira.mongodb.org/browse/SERVER-4899
                { $group: { _id: '$level', regionsCount: { $sum: 1 }, pointsCount: { $sum: '$pointsnum' } } }, //Считаем показатели по каждому уровню
                { $sort: { _id: 1 } }, //Сортируем по родительский по возрастанию
                { $project: { regionsCount: 1, pointsCount: 1, _id: 0 } } //Оставляем только нужные поля
            ], this);
        },
        function (err, regionsStat) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            cb(null, regionsStat);
        }
    );
}

function getRegionsFull(iAm, data, cb) {
    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }

    if (!_.isObject(data)) {
        return cb({ message: msg.badParams, error: true });
    }

    step(
        function () {
            Region.find({}, { _id: 0, geo: 0, __v: 0 }, { lean: true }, this.parallel());
            getRegionsStatByLevel(this.parallel());
        },
        function (err, regions, regionsStatByLevel) {
            if (err || !regions) {
                return cb({ message: err && err.message || 'No regions', error: true });
            }
            var regionsStatCommon = { regionsCount: 0, pointsCount: 0 },
                i;

            //Общие показатели (сложенные по уровням)
            for (i = regionsStatByLevel.length; i--;) {
                regionsStatCommon.regionsCount += regionsStatByLevel[i].regionsCount;
                regionsStatCommon.pointsCount += regionsStatByLevel[i].pointsCount;
            }

            cb({
                regions: regions,
                stat: {
                    common: regionsStatCommon,
                    byLevel: regionsStatByLevel
                }
            });
        }
    );
}

function getRegionsPublic(data, cb) {
    if (!_.isObject(data)) {
        return cb({ message: msg.badParams, error: true });
    }

    cb({ regions: regionCacheArr });
}


// Возвращает список регионов, в которые попадает заданая точка
var getRegionsByGeoPoint = (function () {
    var defRegion = 1000000; // Если регион не найден, возвращаем Открытое море
    var defFields = { _id: 0, geo: 0, __v: 0 };

    return function (geo, fields, cb) {
        return Region.findAsync(
            { geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: geo }, $maxDistance: 1 } } },
                fields || defFields, { lean: true, sort: { parents: -1 } }
            )
            .then(function (regions) {
                if (!regions) {
                    regions = [];
                }
                if (!regions.length && regionCacheHash[defRegion]) {
                    regions.push(regionCacheHash[defRegion]);
                }
                return regions;
            })
            .nodeify(cb);
    };
}());

/**
 * Устанавливает объекту свойства регионов r0-rmaxRegionLevel на основе переданной координаты
 * @param obj Объект (фото, комментарий и т.д.)
 * @param geo Координата
 * @param returnArrFields В коллбек вернётся массив регионов с выбранными полями
 */
function setObjRegionsByGeo(obj, geo, returnArrFields) {
    if (!returnArrFields) {
        returnArrFields = { _id: 0, cid: 1, parents: 1 };
    } else if (!returnArrFields.cid || !returnArrFields.parents) {
        returnArrFields.cid = 1;
        returnArrFields.parents = 1;
    }
    return getRegionsByGeoPoint(geo, returnArrFields)
        .then(function (regions) {
            if (!regions) {
                throw { message: 'No regions' };
            }
            var regionsArr = [];

            for (var i = 0; i <= maxRegionLevel; i++) {
                if (regions[i]) {
                    obj['r' + regions[i].parents.length] = regions[i].cid;
                    regionsArr[regions[i].parents.length] = regions[i];
                } else {
                    obj['r' + i] = undefined;
                }
            }

            return regionsArr;
        });
}

/**
 * Устанавливает объекту свойства регионов r0-rmaxRegionLevel на основе cid региона
 * @param obj Объект (фото, комментарий и т.д.)
 * @param cid Номер региона
 * @param returnArrFields Массив выбираемых полей. В коллбек вернётся массив регионов с выбранными полями
 */
function setObjRegionsByRegionCid(obj, cid, returnArrFields) {
    var region = regionCacheHash[cid];
    var regionsArr = [];
    var i;

    if (region) {
        //Сначала обнуляем все
        for (i = 0; i <= maxRegionLevel; i++) {
            obj['r' + i] = undefined;
        }

        //Если есть родители, присваиваем их
        if (region.parents.length) {
            region.parents.forEach(function (cid) {
                var region = regionCacheHash[cid];
                if (region) {
                    obj['r' + region.parents.length] = cid;
                    regionsArr.push(returnArrFields ? _.pick(region, returnArrFields) : region);
                }
            });
        }

        //Присваиваем переданный регион
        obj['r' + region.parents.length] = cid;
        regionsArr.push(returnArrFields ? _.pick(region, returnArrFields) : region);

        return regionsArr;
    }

    return false;
}

/**
 * Устанавливаем регионы объектам переданной модели по переданным критериям через update (множественная установка)
 * @param model
 * @param criteria
 * @param regions Массив объектов регионов с обязательным свойстов cid
 * @param additionalUpdate
 */
var updateObjsRegions = Bluebird.method(function (model, criteria, regions, additionalUpdate) {
    var $set = {};
    var $unset = {};
    var $update = {};
    var region;

    if (!Array.isArray(regions)) {
        regions = [];
    }

    for (var i = 0; i <= maxRegionLevel; i++) {
        region = regions[i];
        if (region) {
            $set['r' + (Array.isArray(region.parents) ? region.parents.length : 0)] = region.cid;
        } else {
            $unset['r' + i] = 1;
        }
    }
    if (Object.keys($set).length) {
        $update.$set = $set;
    }
    if (Object.keys($unset).length) {
        $update.$unset = $unset;
    }
    if (additionalUpdate) {
        _.merge($update, additionalUpdate);
    }

    if (Object.keys($update).length) {
        return model.updateAsync(criteria || {}, $update, { multi: true });
    } else {
        return null;
    }
});

/**
 * Очищает все регионы у объекта
 * @param obj Объект (фото, комментарий и т.д.)
 */
function clearObjRegions(obj) {
    for (var i = 0; i <= maxRegionLevel; i++) {
        obj['r' + i] = undefined;
    }
}


/**
 * Сохраняет массив _id регионов в указанное поле юзера
 */
var setUserRegions = Bluebird.method(function (login, regionsCids, field, cb) {
    // Проверяем, что переданы номера регионов
    for (var i = regionsCids.length; i--;) {
        if (typeof regionsCids[i] !== 'number' || regionsCids[i] < 1) {
            throw { message: 'Passed in is invalid types of regions' };
        }
    }

    return getOrderedRegionList(regionsCids, {})
        .then(function (regions) {
            if (!regions) {
                throw { message: msg.noregion };
            }
            if (regions.length !== regionsCids.length) {
                throw { message: 'You want to save nonexistent regions' };
            }

            var regionsHash = {};
            var regionsIds = [];
            var region;
            var $update = {};
            var i;
            var j;

            for (i = regions.length; i--;) {
                region = regions[i];
                regionsIds.unshift(region._id);
                regionsHash[region.cid] = region;
            }

            //Проверяем, что регионы не обладают родственными связями
            for (i = regions.length; i--;) {
                region = regions[i];
                for (j = region.parents.length; j--;) {
                    if (regionsHash[region.parents[j]] !== undefined) {
                        throw { message: 'Выбранные регионы не должны обладать родственными связями' };
                    }
                }
            }

            if (regionsIds.length) {
                $update.$set = {};
                $update.$set[field] = regionsIds;
            } else {
                $update.$unset = {};
                $update.$unset[field] = 1;
            }

            return User.updateAsync({ login: login }, $update);
        })
        .nodeify(cb);
});

/**
 * Сохраняет домашний регион пользователя
 */
var saveUserHomeRegion = Bluebird.method(function (iAm, data) {
    var login = data && data.login;
    var itsMe = iAm.registered && iAm.user.login === login;
    var userObjOnline;
    var userPromise = {};

    if (!itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data) || !login || !Number(data.cid)) {
        throw { message: msg.badParams };
    }

    userObjOnline = _session.getOnline(login);
    if (userObjOnline) {
        userPromise = userObjOnline.user;
    } else {
        userPromise = User.findOneAsync({ login: login });
    }

    return Bluebird.join(
        userPromise,
        Region.findOneAsync({ cid: Number(data.cid) }, {
            _id: 1,
            cid: 1,
            parents: 1,
            title_en: 1,
            title_local: 1,
            center: 1,
            bbox: 1,
            bboxhome: 1
        })
        )
        .bind({})
        .spread(function (user, region) {
            if (!user || !region) {
                throw { message: !user ? msg.nouser : msg.noregion };
            }

            this.region = region;

            user.regionHome = region;
            return user.saveAsync();
        })
        .spread(function (user) {
            var region = this.region;
            // Нужно взять именно от region, т.к. user.regionHome будет объектом только в случае спопулированного,
            // например, онлайн пользователя и просто _id в случае не онлайн
            this.regionHome = region.toObject();

            delete this.regionHome._id;

            if (user.settings.r_as_home) {
                return setUserRegions(login, [this.regionHome.cid], 'regions')
                    .then(function () {
                        if (userObjOnline) {
                            return _session.regetUser(userObjOnline, true);
                        }
                    });
            }

            if (userObjOnline) {
                return _session.emitUser(userObjOnline);
            }
        })
        .then(function () {
            return { saved: 1, region: this.regionHome };
        });
});

/**
 * Сохраняет регионы пользователю
 */
var saveUserRegions = Bluebird.method(function (socket, data, cb) {
    var iAm = socket.handshake.usObj;
    var login = data && data.login;
    var itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data) || !login || !Array.isArray(data.regions)) {
        throw { message: msg.badParams };
    }
    if (data.regions.length > maxRegionLevel) {
        throw { message: 'Вы можете выбрать до ' + maxRegionLevel + ' регионов' };
    }
    // Проверяем, что переданы номера регионов
    for (var i = data.regions.length; i--;) {
        if (typeof data.regions[i] !== 'number' || data.regions[i] < 1) {
            throw { message: 'Passed in is invalid types of regions' };
        }
    }

    var userObjOnline = _session.getOnline(login);

    return (userObjOnline ? Bluebird.resolve(userObjOnline.user) : User.findOneAsync({ login: login }))
        .tap(function (user) {
            if (!user) {
                throw { message: msg.nouser };
            }

            return setUserRegions(login, data.regions, 'regions');
        })
        .then(function (user) {
            // Нелья просто присвоить массив объектов регионов и сохранить
            // https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes#prevent-potentially-destructive-operations-on-populated-arrays
            // Надо сделать user.update({$set: regionsIds}), затем user.regions = regionsIds; а затем populate по новому массиву
            // Но после этого save юзера отработает некорректно, и массив регионов в базе будет заполнен null'ами
            // https://groups.google.com/forum/?fromgroups#!topic/mongoose-orm/ZQan6eUV9O0
            // Поэтому полностью заново берем юзера из базы
            if (userObjOnline) {
                return _session.regetUser(userObjOnline, true, socket);
            }
        })
        .then(function () {
            return { saved: 1 };
        });
});

/**
 * Возвращает запрос для выборки по регионам вида $or: [{r0: 1}, {r1: {$in: [3, 4]}}, {r2: 10}]
 * и хэш переданных регионов
 * @param regions Массив спопулированных регионов
 * @returns {{rquery: {}, rhash: {}}}
 */
function buildQuery(regions) {
    var rquery = Object.create(null),
        rhash = Object.create(null),
        $orobj,
        levels,
        level,
        region,
        i;

    if (regions && regions.length) {
        rquery.$or = [];
        levels = {};

        //Формируем запрос для регионов
        for (i = regions.length; i--;) {
            region = regionCacheHash[regions[i].cid];
            rhash[region.cid] = region;
            level = 'r' + region.parents.length;

            if (levels[level] === undefined) {
                levels[level] = [];
            }
            levels[level].push(region.cid);
        }

        for (i in levels) {
            if (levels.hasOwnProperty(i)) {
                level = levels[i];
                $orobj = {};
                if (level.length === 1) {
                    $orobj[i] = level[0];
                } else if (level.length > 1) {
                    $orobj[i] = { $in: level };
                }
                rquery.$or.push($orobj);
            }
        }

        if (rquery.$or.length === 1) {
            rquery = rquery.$or[0];
        }
        //console.log(JSON.stringify(rquery));
    }
    return { rquery, rhash };
}

export async function fillData(app, io) {

    dbNative = (await getDbAsync()).db;
    dbEval = Bluebird.promisify(dbNative.eval, dbNative);

    await fillCache();

    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('saveRegion', function (data) {
            saveRegion(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveRegionResult', resultData);
                });
        });
        socket.on('removeRegion', function (data) {
            removeRegion(hs.usObj, data, function (resultData) {
                socket.emit('removeRegionResult', resultData);
            });
        });
        socket.on('giveRegion', function (data) {
            getRegion(hs.usObj, data, function (resultData) {
                socket.emit('takeRegion', resultData);
            });
        });
        socket.on('giveRegionsFull', function (data) {
            getRegionsFull(hs.usObj, data, function (resultData) {
                socket.emit('takeRegionsFull', resultData);
            });
        });
        socket.on('giveRegions', function (data) {
            getRegionsPublic(data, function (resultData) {
                socket.emit('takeRegions', resultData);
            });
        });
        socket.on('giveRegionsByGeo', function (data) {
            if (!hs.usObj.registered) {
                return response({ message: msg.deny, error: true });
            }
            if (!_.isObject(data) || !Utils.geo.checkLatLng(data.geo)) {
                return response({ message: msg.badParams, error: true });
            }
            data.geo = data.geo.reverse();

            getRegionsByGeoPoint(data.geo, { _id: 0, cid: 1, title_local: 1, parents: 1 }, function (err, regions) {
                if (err || !regions) {
                    response({ message: err && err.message || 'No regions', error: true });
                }
                var regionsArr = [],
                    i;

                for (i = 0; i <= maxRegionLevel; i++) {
                    if (regions[i]) {
                        regionsArr[regions[i].parents.length] = regions[i];
                    }
                }

                response({ geo: data.geo.reverse(), regions: _.compact(regionsArr) }); //На случай пропущенных по иерархии регионов (такого быть не должно) удаляем пустые значения массива
            });

            function response(resultData) {
                socket.emit('takeRegionsByGeo', resultData);
            }
        });

        socket.on('saveUserHomeRegion', function (data) {
            saveUserHomeRegion(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveUserHomeRegionResult', resultData);
                });
        });
        socket.on('saveUserRegions', function (data) {
            saveUserRegions(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveUserRegionsResult', resultData);
                });
        });
    });
};

module.exports.getRegionFromCache = getRegionFromCache;
module.exports.getRegionsArrFromCache = getRegionsArrFromCache;
module.exports.getRegionsHashFromCache = getRegionsHashFromCache;
module.exports.fillRegionsHash = fillRegionsHash;
module.exports.getRegionsArrFromHash = getRegionsArrFromHash;

module.exports.regionsAllSelectHash = regionsAllSelectHash;
module.exports.getShortRegionsParams = getShortRegionsParams;
module.exports.genObjsShortRegionsArr = genObjsShortRegionsArr;

module.exports.getRegionsByGeoPoint = getRegionsByGeoPoint;

module.exports.getObjRegionCids = getObjRegionCids;
module.exports.getObjRegionList = getObjRegionList;
module.exports.setObjRegionsByGeo = setObjRegionsByGeo;
module.exports.setObjRegionsByRegionCid = setObjRegionsByRegionCid;
module.exports.clearObjRegions = clearObjRegions;
module.exports.updateObjsRegions = updateObjsRegions;
module.exports.setUserRegions = setUserRegions;

module.exports.buildQuery = buildQuery;