'use strict';

var dbNative,
	Photo,
	Cluster, // Коллекция кластеров
	ClusterParams, // Коллекция параметров кластера
	Clusters, // Параметры кластера
	ClusterConditions, // Параметры установки кластера
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	logger;

function readClusterParams(cb) {
	step(
		function () {
			ClusterParams.find({sgeo: {$exists: false}}, {_id: 0}).sort('z').exec(this.parallel());
			ClusterParams.find({sgeo: {$exists: true}}, {_id: 0}).exec(this.parallel());
		},
		function (err, clusters, conditions) {
			if (err) {
				logger.error(err && err.message);
			} else {
				Clusters = clusters;
				ClusterConditions = conditions;
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
				if (!hs.session.user) {
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
						ClusterParams.collection.insert(data.clusters, {safe: true}, this.parallel());
						ClusterParams.collection.insert(data.params, {safe: true}, this.parallel());
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
						dbNative.eval('clusterPhotosAll(true)', this);
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


/**
 * Создает кластер для новых координат фото
 * @param cid id фото
 * @param oldGeo новые гео-координаты
 * @param oldYear год фотографии до изменения
 * @param cb Коллбэк добавления
 * @return {Boolean}
 */
module.exports.clusterPhoto = function (cid, oldGeo, oldYear, cb) {
	if (!cid) {
		if (Utils.isType('function', cb)) {
			cb({message: 'Bad params'});
		}
		return false;
	}
	var start = Date.now();

	dbNative.eval('clusterPhoto(' + cid + ',' + JSON.stringify(!_.isEmpty(oldGeo) ? oldGeo : undefined) + ',' + oldYear + ')', function (err, result) {
		console.log(cid + ' reclustered in ' + (Date.now() - start));
		if (Utils.isType('function', cb)) {
			cb(null, result);
		}
	});
};
/**
 * Удаляет фото из кластеров
 * @param cid id фото
 * @param cb Коллбэк добавления
 * @return {Boolean}
 */
module.exports.declusterPhoto = function (cid, cb) {
	if (!cid) {
		if (Utils.isType('function', cb)) {
			cb({message: 'Bad params'});
		}
		return false;
	}
	var start = Date.now();

	dbNative.eval('declusterPhoto(' + cid + ')', function (err, result) {
		console.log(cid + ' declustered in ' + (Date.now() - start));
		if (Utils.isType('function', cb)) {
			cb(null, result);
		}
	});
};


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
				Cluster.collection.find({g: { $within: {$box: data.bounds[i]} }, z: data.z}, {_id: 0, c: 1, geo: 1, p: 1}, this.parallel());
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
				Cluster.collection.find({g: { $within: {$box: data.bounds[i]} }, z: data.z}, {_id: 0, c: 1, geo: 1, y: 1, p: 1}, this.parallel());
			}
		},
		function cursors(err) {
			if (err) {
				return	cb(err);
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
	Photo.collection.findOne({geo: {$near: cluster.geo}, year: yearCriteria}, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1}, function (err, photo) {
		if (err) {
			return cb(err);
		}
		cluster.p = photo;
		cb(null);
	});

}