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

		/**
		 * Устанавливаем новые параметры кластеров и отправляем их на пересчет
		 */
		(function () {
			function result(data) {
				socket.emit('clusterAllResult', data);
			}

			socket.on('clusterAll', function (data) {
				console.dir(data);
				if (!hs.session.user) {
					result({message: 'Not authorized', error: true});
					return;
				}
				step(
					function clearClusters() {
						ClusterParams.find({}).remove(this);
					},
					function setClusterParams(err, numRemovedParams) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						ClusterParams.collection.insert(data.clusters, {safe: true}, this.parallel());
						ClusterParams.collection.insert(data.params, {safe: true}, this.parallel());
					},
					function (err, clusters, conditions) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						readClusterParams(this);
					},
					function runClusterRecalc(err, clusters, conditions) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						dbNative.eval('clusterAll2(true)', this);
					},
					function recalcResult(err, ret) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						if (ret && ret.error) {
							result({message: ret.message || '', error: true});
							return;
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
 * @param cb Коллбэк добавления
 * @param ctx Контекст
 * @return {Boolean}
 */
module.exports.clusterPhoto = function (cid, oldGeo, cb, ctx) {
	if (!cid) {
		if (Utils.isType('function', cb)) {
			cb('Bad params');
		}
		return false;
	}

	dbNative.eval('clusterPhoto(' + cid + ',' + JSON.stringify(oldGeo) + ')', function (err, result) {
		if (Utils.isType('function', cb)) {
			cb.apply(ctx, arguments);
		}
	});
	/*step(
	 function () {
	 Clusters.forEach(function (item, index, array) {
	 Cluster.update({z: item.z, geo: Utils.geo.geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, { $inc: { c: 1 }, $push: {p: photo._id} }, { new: true, upsert: true }, this.parallel());
	 }, this);
	 },
	 function (err) {
	 console.log('err ', err);
	 }
	 );*/
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
				cb(err);
				return;
			}
			var i = arguments.length;
			while (i > 1) {
				arguments[--i].toArray(this.parallel());
			}
		},
		function (err) {
			if (err) {
				cb(err);
				return;
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