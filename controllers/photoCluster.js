'use strict';

var dbNative,
	Photo,
	Cluster, // Коллекция кластеров
	ClusterParams, // Коллекция параметров кластера

	clusterParams, // Параметры кластера
	clusterConditions, // Параметры установки кластера

	constants = require('./constants'),

	_ = require('lodash'),
	step = require('step'),
	Bluebird = require('bluebird'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	logger;

function readClusterParams(cb) {
	step(
		function () {
			ClusterParams.collection.find({sgeo: {$exists: false}}, {_id: 0}, {sort: [
				['z', 'asc']
			]}, this.parallel());
			ClusterParams.collection.find({sgeo: {$exists: true}}, {_id: 0}, this.parallel());
		},
		Utils.cursorsExtract,
		function (err, clusters, conditions) {
			if (err) {
				logger.error(err && err.message);
			} else {
				clusterParams = clusters;
				clusterConditions = conditions;
			}

			if (cb) {
				cb(err, clusters, conditions);
			}
		}
	);
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("photoCluster.js");

	dbNative = db.db;
	Photo = db.model('Photo');
	Cluster = db.model('Cluster');
	ClusterParams = db.model('ClusterParams');

	// Читаем текущие параметры кластеров
	readClusterParams();

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		//Устанавливаем новые параметры кластеров и отправляем их на пересчет
		(function () {
			function result(data) {
				socket.emit('clusterAllResult', data);
			}

			socket.on('clusterAll', function (data) {
				if (!hs.usObj.isAdmin) {
					return result({message: 'Not authorized', error: true});
				}
				step(
					function clearClusters() {
						ClusterParams.find({}).remove(this);
					},
					function setClusterParams(err, numRemovedParams) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						ClusterParams.collection.insert(data.params, {safe: true}, this.parallel());
						ClusterParams.collection.insert(data.conditions, {safe: true}, this.parallel());
					},
					function (err, clusters, conditions) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						readClusterParams(this);
					},
					function runClusterRecalc(err, clusters, conditions) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						dbNative.eval('function (gravity) {clusterPhotosAll(gravity);}', [true], {nolock: true}, this);
					},
					function runPhotosOnMapRefill(err, clusters, conditions) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						dbNative.eval('function () {photosToMapAll();}', [], {nolock: true}, this);
					},
					function recalcResult(err, ret) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						if (ret && ret.error) {
							return result({message: ret.message || '', error: true});
						}
						result(ret);
					}
				);

				//db.db.dropCollection(collectionName);
			});
		}());
	});
};


var clusterRecalcByPhoto = Bluebird.method(function (g, zParam, geoPhotos, yearPhotos, cb) {
	var $update = { $set: {} };

	if (g[0] < -180 || g[0] > 180) {
		Utils.geo.spinLng(g);
	}

	return Cluster.findOneAsync({ g: g, z: zParam.z }, { _id: 0, c: 1, geo: 1, y: 1, p: 1 }, {}, { lean: true })
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
				{ _id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1 }
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
				recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, { o: geoPhotoOld, n: geoPhoto }, { o: yearPhotoOld, n: photo.year }));
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
 * @param data id фото
 * @param cb Коллбэк
 * @return {Object}
 */
module.exports.getBounds = function (data, cb) {
	step(
		function () {
			var i = data.bounds.length;
			while (i--) {
				Cluster.collection.find({g: { $geoWithin: {$box: data.bounds[i]} }, z: data.z}, {_id: 0, c: 1, geo: 1, p: 1}, this.parallel());
			}
		},
		function cursors(err) {
			if (err) {
				return cb(err);
			}
			var i = arguments.length;
			while (i > 1) {
				arguments[--i].toArray(this.parallel());
			}
		},
		function (err) {
			if (err) {
				return cb(err);
			}
			var clusters = [],  // Массив кластеров
				photos = [], // Массив фотографий
				bound,
				cluster,
				i = arguments.length,
				j;

			while (i > 1) {
				bound = arguments[--i];
				j = bound.length;
				while (j) {
					cluster = bound[--j];
					if (cluster.c > 1) {
						cluster.geo.reverse(); // Реверсируем geo
						clusters.push(cluster);
					} else if (cluster.c === 1) {
						photos.push(cluster.p);
					}
				}
			}
			cb(null, photos, clusters);
		}
	);
};

/**
 * Берет кластеры по границам c учетом интервала лет
 * @param data id фото
 * @param cb Коллбэк
 * @return {Object}
 */
module.exports.getBoundsByYear = function (data, cb) {
	var /*start = Date.now(),*/
		clustersAll = [];

	step(
		function () {
			var i = data.bounds.length;
			while (i--) {
				Cluster.collection.find({g: { $geoWithin: {$box: data.bounds[i]} }, z: data.z}, {_id: 0, c: 1, geo: 1, y: 1, p: 1}, this.parallel());
			}
		},
		function cursors(err) {
			if (err) {
				return    cb(err);
			}
			var i = arguments.length;
			while (i > 1) {
				arguments[--i].toArray(this.parallel());
			}
		},
		function (err) {
			if (err) {
				return cb(err);
			}

			var bound,
				cluster,
				year,
				yearCriteria,
				i = arguments.length,
				j;

			if (data.year === data.year2) {
				yearCriteria = data.year;
			} else {
				yearCriteria = {$gte: data.year, $lte: data.year2};
			}

			while (i > 1) {
				bound = arguments[--i];
				j = bound.length;
				while (j) {
					cluster = bound[--j];
					cluster.c = 0;
					year = data.year;
					while (year <= data.year2) {
						cluster.c += cluster.y[year++] | 0;
					}
					if (cluster.c > 0) {
						clustersAll.push(cluster);
						if (cluster.p.year < data.year || cluster.p.year > data.year2) {
							getClusterPoster(cluster, yearCriteria, this.parallel());
						}
					}
				}
			}
			this.parallel()();
		},
		function (err) {
			if (err) {
				return cb(err);
			}

			var clusters = [],  // Массив кластеров
				photos = [], // Массив фотографий
				cluster,
				i = clustersAll.length;

			while (i > 1) {
				cluster = clustersAll[--i];
				if (cluster.c > 1) {
					cluster.geo.reverse(); // Реверсируем geo
					clusters.push(cluster);
				} else if (cluster.c === 1) {
					photos.push(cluster.p);
				}
			}
			//console.log(Date.now() - start);
			cb(null, photos, clusters);
		}
	);
};
function getClusterPoster(cluster, yearCriteria, cb) {
	Photo.collection.findOne({s: constants.photo.status.PUBLIC, geo: {$near: cluster.geo}, year: yearCriteria}, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1}, function (err, photo) {
		if (err) {
			return cb(err);
		}
		cluster.p = photo;
		cb(null);
	});
}