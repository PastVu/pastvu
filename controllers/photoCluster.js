'use strict';

var _ = require('lodash');
var Bluebird = require('bluebird');
var Utils = require('../commons/Utils.js');
var logger;

var constants = require('./constants');

var Photo; // Коллекция фотографий
var Cluster; // Коллекция кластеров
var ClusterParams; // Коллекция параметров кластера
var clusterParams; // Параметры кластера
var clusterConditions; // Параметры установки кластера
var dbNative;
var dbEval;

var msg = {
    deny: 'У вас нет прав на это действие'
};

function readClusterParams() {
    return Bluebird.join(
        ClusterParams.findAsync({ sgeo: { $exists: false } }, { _id: 0 }, { lean: true, sort: { z: 1 } }),
        ClusterParams.findAsync({ sgeo: { $exists: true } }, { _id: 0 }, { lean: true })
    )
        .spread(function (clusters, conditions) {
            clusterParams = clusters;
            clusterConditions = conditions;

            return [clusters, conditions];
        })
        .catch(function (err) {
            logger.error(err.message);
            throw err;
        });
}

var recalcAllClusters = Bluebird.method(function (iAm, data) {

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    return ClusterParams.removeAsync({})
        .spread(function setClusterParams(numRemovedParams) {
            return Bluebird.join(
                ClusterParams.collection.insertAsync(data.params, { safe: true }),
                ClusterParams.collection.insertAsync(data.conditions, { safe: true })
            );
        })
        .spread(function () {
            return readClusterParams();
        })
        .spread(function runClusterRecalc(clusters, conditions) {
            return dbEval('function (gravity) {clusterPhotosAll(gravity);}', [true], { nolock: true });
        })
        .then(function runPhotosOnMapRefill() {
            return dbEval('function () {photosToMapAll();}', [], { nolock: true });
        })
        .then(function recalcResult(result) {
            if (result && result.error) {
                throw { message: result.message || '' };
            }
            return result;
        });
    //db.db.dropCollection(collectionName);
});


var clusterRecalcByPhoto = Bluebird.method(function (g, zParam, geoPhotos, yearPhotos, cb) {
    var $update = { $set: {} };

    if (g[0] < -180 || g[0] > 180) {
        Utils.geo.spinLng(g);
    }

    return Cluster.findOneAsync({ g: g, z: zParam.z }, { _id: 0, c: 1, geo: 1, y: 1, p: 1 }, { lean: true })
        .then(function (cluster) {
            var yCluster = (cluster && cluster.y) || {};
            var c = (cluster && cluster.c) || 0;
            var geoCluster;
            var inc = 0;

            if (cluster && cluster.geo) {
                geoCluster = cluster.geo;
            } else {
                geoCluster = [g[0] + zParam.wHalf, g[1] - zParam.hHalf];
                if (geoCluster[0] < -180 || geoCluster[0] > 180) {
                    Utils.geo.spinLng(geoCluster);
                }
            }

            if (geoPhotos.o) {
                inc -= 1;
            }
            if (geoPhotos.n) {
                inc += 1;
            }
            if (cluster && c <= 1 && inc === -1) {
                // Если после удаления фото из кластера, кластер останется пустым - удаляем его
                Cluster.remove({ g: g, z: zParam.z }).exec();
                return null;
            }

            if (inc !== 0) {
                $update.$inc = { c: inc };
            }

            if (yearPhotos.o !== yearPhotos.n) {
                if (yearPhotos.o && yCluster[yearPhotos.o] !== undefined && yCluster[yearPhotos.o] > 0) {
                    yCluster[yearPhotos.o] -= 1;
                    if (yCluster[yearPhotos.o] < 1) {
                        delete yCluster[yearPhotos.o];
                    }
                }
                if (yearPhotos.n) {
                    yCluster[String(yearPhotos.n)] = 1 + (yCluster[String(yearPhotos.n)] | 0);
                }
                $update.$set.y = yCluster;
            }

            // Такой ситуации не должно быть
            // Она означает что у фото перед изменением координаты уже была координата, но она не участвовала в кластеризации
            if (geoPhotos.o && !c) {
                logger.warn('Strange. While recluster photo trying to remove it old geo from unexisting cluster.');
            }

            if (zParam.z > 11) {
                // Если находимся на масштабе, где должен считаться центр тяжести,
                // то при наличии старой координаты вычитаем её, а при наличии новой - прибавляем.
                // Если переданы обе, значит координата фотографии изменилась в пределах одной ячейки,
                // и тогда вычитаем старую и прибавляем новую.
                // Если координаты не переданы, заничит просто обновим постер кластера
                if (geoPhotos.o && c) {
                    geoCluster = Utils.geo.geoToPrecisionRound([(geoCluster[0] * (c + 1) - geoPhotos.o[0]) / c, (geoCluster[1] * (c + 1) - geoPhotos.o[1]) / c]);
                }
                if (geoPhotos.n) {
                    geoCluster = Utils.geo.geoToPrecisionRound([(geoCluster[0] * (c + 1) + geoPhotos.n[0]) / (c + 2), (geoCluster[1] * (c + 1) + geoPhotos.n[1]) / (c + 2)]);
                }

                if (geoCluster[0] < -180 || geoCluster[0] > 180) {
                    Utils.geo.spinLng(geoCluster);
                }
            }

            $update.$set.geo = geoCluster;
            return Photo.findOneAsync(
                { s: constants.photo.status.PUBLIC, geo: { $near: geoCluster } },
                { _id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1 },
                { lean: true }
            )
                .then(function (photo) {
                    $update.$set.p = photo;
                    return Cluster.updateAsync({ g: g, z: zParam.z }, $update, { multi: false, upsert: true });
                })
                .spread(function (count) {
                    return count;
                });
        })
        .nodeify(cb);
});

/**
 * Создает кластер для новых координат фото
 * @param photo Фото
 * @param geoPhotoOld гео-координаты до изменения
 * @param yearPhotoOld год фотографии до изменения
 */
module.exports.clusterPhoto = Bluebird.method(function (photo, geoPhotoOld, yearPhotoOld) {
    if (!photo.year) {
        throw { message: 'Bad params to set photo cluster' };
    }

    var g; // Координаты левого верхнего угла ячейки кластера для новой координаты
    var gOld;
    var clusterZoom;
    var geoPhoto = photo.geo; // Новые координаты фото, которые уже сохранены в базе
    var geoPhotoCorrection;
    var geoPhotoOldCorrection;
    var recalcPromises = [];

    if (_.isEmpty(geoPhotoOld)) {
        geoPhotoOld = undefined;
    }

    // Коррекция для кластера.
    // Так как кластеры высчитываются бинарным округлением (>>), то для отрицательного lng надо отнять единицу.
    // Так как отображение кластера идет от верхнего угла, то для положительного lat надо прибавить единицу
    if (geoPhoto) {
        geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0]; // Корекция для кластера текущих координат
    }
    if (geoPhotoOld) {
        geoPhotoOldCorrection = [geoPhotoOld[0] < 0 ? -1 : 0, geoPhotoOld[1] > 0 ? 1 : 0]; // Корекция для кластера старых координат
    }

    for (var i = clusterParams.length; i--;) {
        clusterZoom = clusterParams[i];
        clusterZoom.wHalf = Utils.math.toPrecisionRound(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound(clusterZoom.h / 2);

        // Определяем ячейки для старой и новой координаты, если они есть
        if (geoPhotoOld) {
            gOld = Utils.geo.geoToPrecisionRound([clusterZoom.w * ((geoPhotoOld[0] / clusterZoom.w >> 0) + geoPhotoOldCorrection[0]), clusterZoom.h * ((geoPhotoOld[1] / clusterZoom.h >> 0) + geoPhotoOldCorrection[1])]);
        }
        if (geoPhoto) {
            g = Utils.geo.geoToPrecisionRound([clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]), clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1])]);
        }

        if (gOld && g && gOld[0] === g[0] && gOld[1] === g[1]) {
            // Если старые и новые координаты заданы и для них ячейка кластера на этом масштабе одна,
            // то если координата не изменилась, пересчитываем только постер,
            // если изменилась - пересчитаем центр тяжести (отнимем старую, прибавим новую)
            if (geoPhotoOld[0] === geoPhoto[0] && geoPhotoOld[1] === geoPhoto[1]) {
                recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, {}, { o: yearPhotoOld, n: photo.year }));
            } else {
                recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, { o: geoPhotoOld, n: geoPhoto }, {
                    o: yearPhotoOld,
                    n: photo.year
                }));
            }
        } else {
            // Если ячейка для координат изменилась, или какой-либо координаты нет вовсе,
            // то пересчитываем старую и новую ячейку, если есть соответствующая координата
            if (gOld) {
                recalcPromises.push(clusterRecalcByPhoto(gOld, clusterZoom, { o: geoPhotoOld }, { o: yearPhotoOld }));
            }
            if (g) {
                recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, { n: geoPhoto }, { n: photo.year }));
            }
        }
    }

    return Bluebird.all(recalcPromises);
});

/**
 * Удаляет фото из кластеров
 * @param photo фото
 */
module.exports.declusterPhoto = Bluebird.method(function (photo) {
    if (!Utils.geo.check(photo.geo) || !photo.year) {
        throw { message: 'Bad params to decluster photo' };
    }

    var g;
    var clusterZoom;
    var recalcPromises = [];
    var geoPhoto = photo.geo;
    var geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0];

    for (var i = clusterParams.length; i--;) {
        clusterZoom = clusterParams[i];
        clusterZoom.wHalf = Utils.math.toPrecisionRound(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound(clusterZoom.h / 2);

        g = Utils.geo.geoToPrecisionRound([clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]), clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1])]);
        recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, { o: geoPhoto }, { o: photo.year }));
    }

    return Bluebird.all(recalcPromises);
});

/**
 * Берет кластеры по границам
 * @param data
 * @param [cb] Коллбэк
 */
module.exports.getBounds = Bluebird.method(function (data, cb) {
    var promises = [];

    for (var i = data.bounds.length; i--;) {
        promises.push(Cluster.findAsync(
            { g: { $geoWithin: { $box: data.bounds[i] } }, z: data.z },
            { _id: 0, c: 1, geo: 1, p: 1 },
            { lean: true }
        ));
    }

    return Bluebird.all(promises)
        .then(function (findClusters) {
            var clusters = [];  // Массив кластеров
            var photos = []; // Массив фотографий
            var bound;
            var cluster;
            var j;

            for (var i = findClusters.length; i--;) {
                bound = findClusters[i];

                for (j = bound.length; j--;) {
                    cluster = bound[j];

                    if (cluster.c > 1) {
                        cluster.geo.reverse(); // Реверсируем geo
                        clusters.push(cluster);
                    } else if (cluster.c === 1) {
                        photos.push(cluster.p);
                    }
                }
            }

            return [photos, clusters];
        })
        .nodeify(cb, { spread: true });
});

/**
 * Берет кластеры по границам c учетом интервала лет
 * @param data
 * @param [cb] Коллбэк
 */
module.exports.getBoundsByYear = Bluebird.method(function (data, cb) {
    var clustersAll = [];
    var promises = [];


    for (var i = data.bounds.length; i--;) {
        promises.push(Cluster.findAsync(
            { g: { $geoWithin: { $box: data.bounds[i] } }, z: data.z },
            { _id: 0, c: 1, geo: 1, y: 1, p: 1 },
            { lean: true }
        ));
    }

    return Bluebird.all(promises)
        .then(function (findClusters) {
            var promises = [];
            var cluster;
            var bound;
            var year;
            var yearCriteria;
            var j;

            if (data.year === data.year2) {
                yearCriteria = data.year;
            } else {
                yearCriteria = { $gte: data.year, $lte: data.year2 };
            }

            for (var i = findClusters.length; i--;) {
                bound = findClusters[i];

                for (j = bound.length; j--;) {
                    cluster = bound[j];
                    cluster.c = 0;
                    year = data.year;

                    while (year <= data.year2) {
                        cluster.c += cluster.y[year++] | 0;
                    }

                    if (cluster.c > 0) {
                        clustersAll.push(cluster);
                        if (cluster.p.year < data.year || cluster.p.year > data.year2) {
                            promises.push(getClusterPoster(cluster, yearCriteria));
                        }
                    }
                }
            }

            return Bluebird.all(promises);
        })
        .then(function () {
            var clusters = [];  // Массив кластеров
            var photos = []; // Массив фотографий
            var cluster;

            for (var i = clustersAll.length; i--;) {
                cluster = clustersAll[i];

                if (cluster.c > 1) {
                    cluster.geo.reverse(); // Реверсируем geo
                    clusters.push(cluster);
                } else if (cluster.c === 1) {
                    photos.push(cluster.p);
                }
            }

            return [photos, clusters];
        })
        .nodeify(cb, { spread: true });
});

function getClusterPoster(cluster, yearCriteria) {
    return Photo.findOneAsync(
        { s: constants.photo.status.PUBLIC, geo: { $near: cluster.geo }, year: yearCriteria },
        { _id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1 },
        { lean: true }
    )
        .then(function (photo) {
            cluster.p = photo;

            return cluster;
        });
}


module.exports.loadController = function (app, db, io) {
    logger = require('log4js').getLogger('photoCluster.js');

    dbNative = db.db;
    /* jshint evil:true */
    dbEval = Bluebird.promisify(dbNative.eval, dbNative);
    /* jshint evil:false */

    Photo = db.model('Photo');
    Cluster = db.model('Cluster');
    ClusterParams = db.model('ClusterParams');

    // Читаем текущие параметры кластеров
    readClusterParams();

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        // Устанавливаем новые параметры кластеров и отправляем их на пересчет
        socket.on('clusterAll', function (data) {
            recalcAllClusters(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('clusterAllResult', resultData);
                });
        });
    });
};