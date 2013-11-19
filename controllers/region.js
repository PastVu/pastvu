'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	Counter,
	Region,
	_ = require('lodash'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	msg = {
		deny: 'You do not have permission for this action'
	},
	logger = require('log4js').getLogger("region.js"),
	loggerApp = require('log4js').getLogger("app.js"),

	regionCacheHash = {}, //Хэш-кэш регионов из базы 'cid': {_id, cid, parents}
	regionCacheArr = []; //Массив-кэш регионов из базы [{_id, cid, parents}]

//Заполняем кэш (массив и хэш) регионов в память
function fillCache(cb) {
	Region.find({}, {_id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1}, {lean: true}, function (err, regions) {
		if (err) {
			logger.error('FillCache: ' + err.message);
			if (cb) {
				cb(err);
			}
			return;
		}
		for (var i = regions.length; i--;) {
			regionCacheHash[regions[i].cid] = regions[i];
		}
		regionCacheArr = regions;

		logger.info('Region cache filled with ' + regions.length);
		loggerApp.info('Region cache filled with ' + regions.length);
		if (cb) {
			cb();
		}
	});
}

function getRegionsFromCache(cids) {
	var result = [],
		region,
		i = cids.length;

	while (i--) {
		region = regionCacheHash[cids[i]];
		if (region !== undefined) {
			result.unshift(region);
		}
	}

	return result;
}
function getRegionsHashFromCache(cids) {
	var result = {},
		region,
		i = cids.length;

	while (i--) {
		region = regionCacheHash[cids[i]];
		if (region !== undefined) {
			result[cids[i]] = region;
		}
	}

	return result;
}

function saveRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.title_en || !data.title_local) {
		return cb({message: 'Bad params', error: true});
	}

	data.parent = data.parent && Number(data.parent);
	if (data.parent) {
		if (data.cid && data.cid === data.parent) {
			return cb({message: 'You trying to specify a parent himself', error: true});
		}
		Region.findOne({cid: data.parent}, {_id: 0, cid: 1, parents: 1}, {lean: true}, function (err, region) {
			if (err || !region) {
				return cb({message: err && err.message || 'Such parent region doesn\'t exists', error: true});
			}
			var parentsArray = region.parents || [];

			if (data.cid && ~parentsArray.indexOf(data.cid)) {
				return cb({message: 'You specify the parent, which already has this region as his own parent', error: true});
			}

			parentsArray.push(region.cid);
			findOrCreate(parentsArray);
		});
	} else {
		findOrCreate([]);
	}

	function findOrCreate(parentsArray) {
		if (typeof data.geo === 'string') {
			try {
				data.geo = JSON.parse(data.geo);
			} catch (err) {
				return cb({message: err && err.message || 'GeoJSON parse error!', error: true});
			}
			if (Object.keys(data.geo).length !== 2 || !Array.isArray(data.geo.coordinates) || !data.geo.type || (data.geo.type !== 'Polygon' && data.geo.type !== 'MultiPolygon')) {
				return cb({message: 'It\'s not GeoJSON geometry!'});
			}
		} else if (data.geo) {
			delete data.geo;
		}

		if (!data.cid) {
			Counter.increment('region', function (err, count) {
				if (err || !count) {
					return cb({message: err && err.message || 'Increment comment counter error', error: true});
				}
				fill(new Region({cid: count.next}));
			});
		} else {
			Region.findOne({cid: data.cid}, function (err, region) {
				if (err || !region) {
					return cb({message: err && err.message || 'Such region doesn\'t exists', error: true});
				}
				region.udate = new Date();
				fill(region);
			});
		}

		function fill(region) {
			//Если обновили geo - записываем, помечаем модифицированным, так как это тип Mixed
			if (data.geo) {
				region.geo = data.geo;
				region.markModified('geo');
			}

			region.parents = parentsArray;

			region.title_en = String(data.title_en);
			region.title_local = data.title_local ? String(data.title_local) : undefined;

			region.save(function (err, region) {
				if (err || !region) {
					return cb({message: err && err.message || 'Save error', error: true});
				}

				//Обновляем кэш регионов
				fillCache(function (err) {
					if (err) {
						return cb({message: 'Saved, but: ' + err.message, error: true});
					}
					region = region.toObject();

					getParentsAndChilds(region, function (err, childLenArr, parentsSortedArr) {
						if (err) {
							return cb({message: 'Saved, but: ' + err.message, error: true});
						}
						if (parentsSortedArr) {
							region.parents = parentsSortedArr;
						}

						if (data.geo) {
							region.geo = JSON.stringify(region.geo);
						} else {
							delete region.geo;
						}

						cb({childLenArr: childLenArr, region: region});
					});
				});
			});
		}
	}
}

function getRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.cid) {
		return cb({message: 'Bad params', error: true});
	}

	Region.findOne({cid: data.cid}, {_id: 0, __v: 0}, {lean: true}, function (err, region) {
		if (err || !region) {
			return cb({message: err && err.message || 'Such region doesn\'t exists', error: true});
		}

		getParentsAndChilds(region, function (err, childLenArr, parentsSortedArr) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (parentsSortedArr) {
				region.parents = parentsSortedArr;
			}

			//Клиенту отдаем стрингованный geojson
			region.geo = JSON.stringify(region.geo);

			cb({childLenArr: childLenArr, region: region});
		});
	});
}

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов
 * @param region Объект региона
 * @param cb
 */
function getParentsAndChilds(region, cb) {
	var level = region.parents && region.parents.length || 0; //Уровень региона равен кол-ву родительских

	step(
		function () {
			var childrenLevel = level,
				childrenQuery = {};

			//Ищем кол-во потомков по уровням
			//У таких регионов на позиции текущего уровня будет стоять этот регион
			//и на кажой итераци кол-во уровней будет на один больше текущего
			//Например, потомки региона 77, имеющего одного родителя, будут найдены так:
			// {'parents.1': 77, parents: {$size: 2}}
			// {'parents.1': 77, parents: {$size: 3}}
			// {'parents.1': 77, parents: {$size: 4}}
			childrenQuery['parents.' + level] = region.cid;
			while (childrenLevel++ < 4) {
				childrenQuery.parents = {$size: childrenLevel};
				Region.count(childrenQuery, this.parallel());
			}
		},
		function (err/*, childCounts*/) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			var childLenArr = [],
				i;

			for (i = 1; i < arguments.length; i++) {
				if (arguments[i]) {
					childLenArr.push(arguments[i]);
				}
			}

			this.parallel()(null, childLenArr);
			//Если есть родительские регионы - вручную их "популируем"
			if (level) {
				getOrderedRegionList(region.parents, null, this.parallel());
			}
		},
		function (err, childLenArr, parentsSortedArr) {
			if (err) {
				return cb({message: err.message, error: true});
			}

			cb(null, childLenArr, parentsSortedArr);
		}
	);
}


function getRegionsFull(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	Region.find({}, {_id: 0, geo: 0, __v: 0}, {lean: true}, function (err, regions) {
		if (err || !regions) {
			return cb({message: err && err.message || 'No regions', error: true});
		}
		cb({regions: regions});
	});
}

function getRegionsPublic(socket, data, cb) {
	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	cb({regions: regionCacheArr});
}

/**
 * Возвращает список регионов по массиву cid в том же порядке, что и переданный массив
 * @param cidArr Массив номеров регионов
 * @param cb
 */
var getOrderedRegionList = (function () {
	var defFields = {_id: 0, geo: 0, __v: 0};

	return function (cidArr, fields, cb) {
		Region.find({cid: {$in: cidArr}}, fields || defFields, {lean: true}, function (err, regions) {
			if (err) {
				return cb(err);
			}
			var parentsSortedArr = [],
				parent,
				i = cidArr.length,
				parentfind = function (parent) {
					return parent.cid === cidArr[i];
				};

			if (cidArr.length === regions.length) {
				//$in не гарантирует такой же сортировки результата как искомого массива, поэтому приводим к сортировке искомого
				while (i--) {
					parent = _.find(regions, parentfind);
					if (parent) {
						parentsSortedArr.unshift(parent);
					}
				}
			}
			cb(null, parentsSortedArr);
		});
	};
}());

/**
 * Возвращает спопулированный массив регионов для заданного объекта
 * @param obj Объект (фото, комментарий и т.д.)
 * @param fields Выбранные поля регионов
 * @param cb Коллбек
 */
function getObjRegionList(obj, fields, cb) {
	var cidArr = [],
		rcid,
		i;

	for (i = 0; i < 5; i++) {
		rcid = obj['r' + i];
		if (rcid) {
			cidArr.push(rcid);
		}
	}
	if (!cidArr.length) {
		cb(null, cidArr);
	} else {
		getOrderedRegionList(cidArr, fields, cb);
	}
}

/**
 * Устанавливает объекту свойства регионов r0-r4 на основе переданной координаты
 * @param obj Объект (фото, комментарий и т.д.)
 * @param geo Координата
 * @param returnArrFields В коллбек вернётся массив регионов с выбранными полями
 * @param cb Коллбек
 */
function setObjRegions(obj, geo, returnArrFields, cb) {
	if (!returnArrFields) {
		returnArrFields = {_id: 0, cid: 1, parents: 1};
	} else if (!returnArrFields.cid || !returnArrFields.parents) {
		returnArrFields.cid = 1;
		returnArrFields.parents = 1;
	}
	getRegionsByGeoPoint(geo, returnArrFields, function (err, regions) {
		if (err || !regions) {
			return cb(err || {message: 'No regions'});
		}
		var regionsArr = [],
			i;

		for (i = 0; i < 5; i++) {
			if (regions[i]) {
				obj['r' + regions[i].parents.length] = regions[i].cid;
				regionsArr[regions[i].parents.length] = regions[i];
			} else {
				obj['r' + i] = undefined;
			}
		}

		cb(null, regionsArr);
	});
}
/**
 * Очищает все регионы у объекта
 * @param obj Объект (фото, комментарий и т.д.)
 */
function clearObjRegions(obj) {
	for (var i = 0; i < 5; i++) {
		obj['r' + i] = undefined;
	}
}

//Возвращает список регионов, в которые попадает заданая точка
var getRegionsByGeoPoint = function () {
	var defFields = {_id: 0, geo: 0, __v: 0};

	return function (geo, fields, cb) {
		Region.find({geo: {$nearSphere: {$geometry: {type: 'Point', coordinates: geo}, $maxDistance: 1}} }, fields || defFields, {lean: true, sort: {parents: -1}}, function (err, regions) {
			if (err) {
				return cb(err);
			}
			cb(null, regions);
		});
	};
}();


/**
 * Сохраняет регионы пользователю
 */
function saveUserRegions(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		login = data && data.login,
		itsMe = (iAm && iAm.login) === login,
		itsOnline,
		i,
		j;

	if (!iAm || (!itsMe && (!iAm.role || iAm.role < 10))) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login || !Array.isArray(data.regions)) {
		return cb({message: msg.badParams, error: true});
	}
	if (data.regions.length > 5) {
		return cb({message: 'Вы можете выбрать до 5 регионов', error: true});
	}
	//Проверяем, что переданы номера регионов
	for (i = data.regions.length; i--;) {
		if (typeof data.regions[i] !== 'number' || data.regions[i] < 1) {
			return cb({message: 'Passed in is invalid types of regions', error: true});
		}
	}

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this(null, user);
			} else {
				User.findOne({login: login}, this);
			}
		},
		function (err, user) {
			if (err || !user) {
				return cb({message: err && err.message || msg.nouser, error: true});
			}

			setUserRegions(login, data.regions, 'regions', function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				//Нелья просто присвоить массив объектов регионов и сохранить
				//https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes#prevent-potentially-destructive-operations-on-populated-arrays
				//Надо сделать user.update({$set: regionsIds}), затем user.regions = regionsIds; а затем populate по новому массиву
				//Но после этого save юзера отработает некорректно, и массив регионов в базе будет заполнен null'ами
				//https://groups.google.com/forum/?fromgroups#!topic/mongoose-orm/ZQan6eUV9O0
				//Поэтому полностью заново берем юзера из базы
				if (itsOnline) {
					_session.regetUser(user, function (err, user) {
						if (err) {
							return cb({message: err.message, error: true});
						}

						_session.emitUser(user.login, socket);
						cb({message: 'ok', saved: 1});
					});
				} else {
					cb({message: 'ok', saved: 1});
				}
			});
		}
	);
}

/**
 * Сохраняет массив _id регионов в указанное поле юзера
 */
function setUserRegions(login, regionsCids, field, cb) {
	var i,
		j;

	//Проверяем, что переданы номера регионов
	for (i = regionsCids.length; i--;) {
		if (typeof regionsCids[i] !== 'number' || regionsCids[i] < 1) {
			return cb({message: 'Passed in is invalid types of regions', error: true});
		}
	}

	getOrderedRegionList(regionsCids, {}, function (err, regions) {
		if (err || !regions) {
			return cb(err || {message: msg.nouser, error: true});
		}
		if (regions.length !== regionsCids.length) {
			return cb({message: 'You want to save nonexistent regions', error: true});
		}

		var regionsHash = {},
			regionsIds = [],
			region,
			$update = {};

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
					return cb({message: 'Выбранные регионы не должны обладать родственными связями', error: true});
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
		User.update({login: login}, $update, function (err, numberAffected, raw) {
			cb(err);
		});
	});
}

/**
 * Возвращает запрос для выборки по регионам вида $or: [{r0: 1}, {r1: {$in: [3, 4]}}, {r2: 10}]
 * и хэш переданных регионов
 * @param regions Массив спопулированных регионов
 * @returns {{rquery: {}, rhash: {}}}
 */
function buildQuery(regions) {
	var rquery = {},
		rhash = {},
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
					$orobj[i] = {$in: level};
				}
				rquery.$or.push($orobj);
			}
		}

		if (rquery.$or.length === 1) {
			rquery = rquery.$or[0];
		}
		//console.log(JSON.stringify(rquery));
	}
	return {rquery: rquery, rhash: rhash};
}

module.exports.loadController = function (app, db, io) {

	Settings = db.model('Settings');
	Counter = db.model('Counter');
	User = db.model('User');
	Region = db.model('Region');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('saveRegion', function (data) {
			saveRegion(socket, data, function (resultData) {
				socket.emit('saveRegionResult', resultData);
			});
		});
		socket.on('giveRegion', function (data) {
			getRegion(socket, data, function (resultData) {
				socket.emit('takeRegion', resultData);
			});
		});
		socket.on('giveRegionsFull', function (data) {
			getRegionsFull(socket, data, function (resultData) {
				socket.emit('takeRegionsFull', resultData);
			});
		});
		socket.on('giveRegions', function (data) {
			getRegionsPublic(socket, data, function (resultData) {
				socket.emit('takeRegions', resultData);
			});
		});
		socket.on('giveRegionsByGeo', function (data) {
			var iAm = hs.session.user;

			if (!iAm || !iAm.role || iAm.role < 10) {
				return response({message: msg.deny, error: true});
			}
			if (!Utils.isType('object', data) || !Utils.geoCheck(data.geo)) {
				return response({message: 'Bad params', error: true});
			}
			data.geo = data.geo.reverse();

			getRegionsByGeoPoint(data.geo, {_id: 0, cid: 1, title_en: 1}, function (err, regions) {
				if (err || !regions) {
					response({message: err && err.message || 'No regions', error: true});
				} else {
					response({geo: data.geo.reverse(), regions: regions});
				}

			});

			function response(resultData) {
				socket.emit('takeRegionsByGeo', resultData);
			}
		});

		socket.on('saveUserRegions', function (data) {
			saveUserRegions(socket, data, function (resultData) {
				socket.emit('saveUserRegionsResult', resultData);
			});
		});
	});

	return module.exports;
};

module.exports.fillCache = fillCache;
module.exports.regionCacheHash = regionCacheHash;
module.exports.regionCacheArr = regionCacheArr;
module.exports.getRegionsFromCache = getRegionsFromCache;
module.exports.getRegionsHashFromCache = getRegionsHashFromCache;

module.exports.getRegionsByGeoPoint = getRegionsByGeoPoint;
module.exports.getOrderedRegionList = getOrderedRegionList;
module.exports.getObjRegionList = getObjRegionList;
module.exports.setObjRegions = setObjRegions;
module.exports.clearObjRegions = clearObjRegions;
module.exports.setUserRegions = setUserRegions;

module.exports.buildQuery = buildQuery;