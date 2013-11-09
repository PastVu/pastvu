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
	};

function saveRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.title_en) {
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


function getRegionList(socket, data, cb) {
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
		itsOnline;

	if (!iAm || !itsMe && iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login || !Array.isArray(data.regions)) {
		return cb({message: msg.badParams, error: true});
	}
	if (!data.regions.length || data.regions.length > 5) {
		return cb({message: 'Вы можете выбрать от 1 до 5 регионов', error: true});
	}

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this.parallel()(null, user);
			} else {
				User.findOne({login: login}, this.parallel());
			}
			getOrderedRegionList(data.regions, {}, this.parallel());
		},
		function (err, user, regions) {
			if (err || !user || !regions) {
				return cb({message: err && err.message || msg.nouser, error: true});
			}
			if (!regions.length) {
				return cb({message: 'You want to save nonexistent regions', error: true});
			}
			var regionsHash = {},
				regionsIds = [],
				region,
				i,
				j;

			//Проверяем, что регионы не обладают родствеными связями
			for (i = regions.length; i--;) {
				region = regions[i];
				regionsIds.push(region._id);
				regionsHash[region.cid] = region;
			}
			for (i = regions.length; i--;) {
				region = regions[i];
				for (j = region.parents.length; j--;) {
					if (regionsHash[region.parents[j]] !== undefined) {
						return cb({message: 'Выбранные регионы не должны обладать родственными связями', error: true});
					}
				}
			}

			//Нелья просто присвоить массив объектов регионов и сохранить
			//https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes#prevent-potentially-destructive-operations-on-populated-arrays
			//Надо сделать user.update({$set: regionsIds}), затем user.regions = regionsIds; а затем populate по новому массиву
			//Но после этого save юзера отработает некорректно, и массив регионов в базе будет заполнен null'ами
			//https://groups.google.com/forum/?fromgroups#!topic/mongoose-orm/ZQan6eUV9O0
			//Поэтому полностью заново берем юзера из базы
			user.update({$set: {regions: regionsIds}}, function (err, numberAffected, raw) {
				if (err) {
					return cb({message: err.message, error: true});
				}
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
		socket.on('giveRegionList', function (data) {
			getRegionList(socket, data, function (resultData) {
				socket.emit('takeRegionList', resultData);
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

};
module.exports.getRegionsByGeoPoint = getRegionsByGeoPoint;
module.exports.getOrderedRegionList = getOrderedRegionList;
module.exports.getObjRegionList = getObjRegionList;
module.exports.setObjRegions = setObjRegions;
module.exports.clearObjRegions = clearObjRegions;