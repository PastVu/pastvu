'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	Photo,
	Region,
	Counter,
	dbNative,
	_ = require('lodash'),
	_s = require('underscore.string'),
	step = require('step'),
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

	maxRegionLevel = global.appVar.maxRegionLevel,

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
		var hash = {},
			i = regions.length;

		while (i--) {
			hash[regions[i].cid] = regions[i];
		}
		regionCacheHash = hash;
		regionCacheArr = regions;

		logger.info('Region cache filled with ' + regions.length);
		loggerApp.info('Region cache filled with ' + regions.length);
		if (cb) {
			cb();
		}
	});
}

function getRegionsArrFromCache(cids) {
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
		Region.findOne({cid: cidOrRegion}, {_id: 0, cid: 1, parents: 1, geo: 1}, {lean: true}, doCalc);
	} else {
		doCalc(null, cidOrRegion);
	}

	function doCalc(err, region) {
		if (err || !region) {
			return cb({message: ('Region [' + cidOrRegion + '] find for calcRegionIncludes error: ' + (err && err.message) || 'doesn\'t exists'), error: true});
		}
		var level = 'r' + region.parents.length,
			queryObject = {geo: {$exists: true}},
			setObject,
			resultStat = {};

		queryObject[level] = region.cid;
		step(
			function () {
				//Сначала очищаем присвоение текущего региона объектам с координатой,
				//чтобы убрать те объекты, которые больше не будут в него попадать
				setObject = {$unset: {}};

				setObject.$unset[level] = 1;
				Photo.update(queryObject, setObject, {multi: true}, this);
			},
			function (err, photosCountBefore) {
				if (err) {
					return cb(err);
				}
				resultStat.photosCountBeforeGeo = photosCountBefore || 0;

				//Теперь присваиваем этот регион всем, входящим в его полигон
				setObject = {$set: {}};
				setObject.$set[level] = region.cid;

				Photo.update({geo: {$geoWithin: {$geometry: region.geo}}}, setObject, {multi: true}, this);
			},
			function (err, photosCountAfter) {
				if (err) {
					return cb(err);
				}
				resultStat.photosCountAfterGeo = photosCountAfter || 0;
				cb(null, resultStat);
			}
		);
	}
}
/**
 * Пересчет входящих объектов в переданный список регионов. Если список пуст - пересчет всех регионов
 * @param iAm
 * @param cids Массив cid регионов
 * @param cb
 */
function calcRegionsIncludes(iAm, cids, cb) {
	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Array.isArray(cids)) {
		return cb({message: msg.badParams, error: true});
	}

	if (!cids.length) {
		//Если массив пуст - пересчитываем все фотографии
		dbNative['eval']('function () {regionsAssignObjects()', [], {nolock: true}, function (err, ret) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			if (ret && ret.error) {
				return cb({message: ret.message || '', error: true});
			}

			cb(ret);
		});
	} else {
		//Проходим по каждому региону и пересчитываем
		(function iterate(i) {
			calcRegionIncludes(cids[i], function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}

				if (++i < cids.length) {
					iterate();
				} else {
					cb({message: 'ok'});
				}
			});
		}(0));
	}
}

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
				Region.update({parents: region.cid}, {$pull: {parents: {$in: regionsDiff}}}, {multi: true}, this.parallel());
			},
			function (err, affectedPhotos) {
				if (err) {
					return cb(err);
				}
				resultData.affectedPhotos = affectedPhotos || 0;

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
				Region.collection.update({parents: region.cid}, {$push: {parents: {$each: regionsDiff, $position: levelWas}}}, {multi: true}, this.parallel());
			},
			function (err, affectedPhotos) {
				if (err) {
					return cb(err);
				}
				resultData.affectedPhotos = affectedPhotos || 0;

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
				Region.update({parents: region.cid}, {$pull: {parents: {$in: oldParentsArray}}}, {multi: true}, this.parallel());
			},
			function (err) {
				if (err) {
					return cb(err);
				}
				countAffectedPhotos(this.parallel());
				//Вставляем все родительские регионы переносимого региона его потомкам
				Region.collection.update({parents: region.cid}, {$push: {parents: {$each: region.parents, $position: 0}}}, {multi: true}, this.parallel());
			},
			function (err, affectedPhotos) {
				if (err) {
					return cb(err);
				}
				resultData.affectedPhotos = affectedPhotos || 0;

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
		Photo.count(querycount, cb);
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
					Photo.collection.update(q, u, {multi: true}, cb);
				};
			};

		//Удаляем все поля rX, которые выше поднимаего уровня до его нового значения
		//Это нужно в случае, когда поднимаем на больше чем один уровень,
		//т.к. фотографии присвоенные только этому региону (а не его потомкам), оставят присвоение верхних,
		//т.к. $rename работает в случае присутствия поля и не удалит существующее, если переименовываемого нет
		if (levelDiff > 1) {
			queryObj = {};
			queryObj['r' + levelWas] = region.cid;
			setObj = {$unset: {}};
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
			setObj = {$rename: {}};
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
					Photo.collection.update(q, u, {multi: true}, _.last(arguments));
				};
			};

		queryObj = {};
		queryObj['r' + levelWas] = region.cid;
		for (i = levelWas + childLen; i >= levelWas; i--) {
			setObj = {$rename: {}};
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
		Photo.collection.update(queryObj, {$set: setObj}, {multi: true}, cb);
	}

	//Удаляем у пользователей и модераторов подписку на дочерние регионы, если они подписаны на родительские
	function dropChildRegionsForUsers(parentsCids, childBranchCid, cb) {
		step(
			function () {
				//Находим _id новых родительских регионов
				Region.find({cid: {$in: region.parents}}, {_id: 1}, {lean: true}, this.parallel());
				//Находим _id всех регионов, дочерних переносимому
				Region.find({parents: region.cid}, {_id: 1}, {lean: true}, this.parallel());
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
				User.update({$and: [
					{regions: {$in: parentRegionsIds}},
					{regions: {$in: movingRegionsIds}}
				]}, {$pull: {regions: {$in: movingRegionsIds}}}, {multi: true}, this.parallel());

				//Тоже самое с модераторскими регионами
				User.update({$and: [
					{mod_regions: {$in: parentRegionsIds}},
					{mod_regions: {$in: movingRegionsIds}}
				]}, {$pull: {mod_regions: {$in: movingRegionsIds}}}, {multi: true}, this.parallel());
			},
			function (err, affectedUsers, affectedMods) {
				if (err) {
					return cb(err);
				}
				cb(null, {affectedUsers: affectedUsers || 0, affectedMods: affectedMods || 0});
			}
		);
	}
}

/**
 * Сохранение/создание региона
 * @param socket
 * @param data
 * @param cb
 * @returns {*}
 */
function saveRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.title_en || !data.title_local) {
		return cb({message: msg.badParams, error: true});
	}

	data.title_en = data.title_en.trim();
	data.title_local = data.title_local.trim();
	if (!data.title_en || !data.title_local) {
		return cb({message: msg.badParams, error: true});
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

		var parentChange,
			parentsArrayOld,
			childLenArray,
			resultStat = {};

		if (!data.cid) {
			//Создаем объект региона
			Counter.increment('region', function (err, count) {
				if (err || !count) {
					return cb({message: err && err.message || 'Increment comment counter error', error: true});
				}
				fill(new Region({cid: count.next, parents: parentsArray}));
			});
		} else {
			//Ищем регион по переданному cid
			var region;

			step(
				function () {
					Region.findOne({cid: data.cid}, this);
				},
				function (err, r) {
					if (err || !r) {
						return cb({message: err && err.message || 'Such region doesn\'t exists', error: true});
					}
					region = r;
					parentChange = !_.isEqual(parentsArray, region.parents);

					if (parentChange) {
						getChildsLenByLevel(region, this);
					} else {
						this();
					}
				},
				function (err, childLens) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					if (parentChange) {
						if (parentsArray.length > region.parents.length && (parentsArray.length + 1 + childLens.length > maxRegionLevel)) {
							return cb({message: 'При переносе региона он или его потомки окажутся на уровне больше максимального. Максимальный: ' + maxRegionLevel, error: true});
						}

						childLenArray = childLens;
						parentsArrayOld = region.parents;
						region.parents = parentsArray;
					}
					region.udate = new Date();
					fill(region);
				}
			);
		}

		function fill(region) {
			//Если обновили geo - записываем, помечаем модифицированным, так как это тип Mixed
			if (data.geo) {
				//Если мультиполигон состоит из одного полигона, берем только его и делаем тип Polygon
				if (data.geo.type === 'MultiPolygon' && data.geo.coordinates.length === 1) {
					data.geo.coordinates = data.geo.coordinates[0];
					data.geo.type = 'Polygon';
				}

				//Считаем количество точек
				region.pointsnum = data.geo.type === 'Point' ? 1 : Utils.calcGeoJSONPointsNum(data.geo.coordinates);
				if (data.geo.type === 'Polygon' || data.geo.type === 'MultiPolygon') {
					region.polynum = Utils.calcGeoJSONPolygonsNum(data.geo);
				} else {
					region.polynum = {exterior: 0, interior: 0};
				}

				//Вычисляем bbox
				region.bbox = Utils.geo.polyBBOX(data.geo).map(Utils.math.toPrecision6);

				region.geo = data.geo;
				region.markModified('geo');
				region.markModified('polynum');
			}

			if (Utils.geo.checkbboxLatLng(data.bboxhome)) {
				region.bboxhome = Utils.geo.bboxReverse(data.bboxhome).map(Utils.math.toPrecision6);
			} else if (data.bboxhome === null) {
				region.bboxhome = undefined; //Если пришел null - надо обнулить, т.е. bbox будет авто
			}

			if (data.centerAuto || !Utils.geo.checkLatLng(data.center)) {
				if (data.geo || !region.centerAuto) {
					region.centerAuto = true;
					//Если Polygon - то в качестве центра берется его центр тяжести, если MultiPolygon - центр bbox
					region.center = Utils.geo.geoToPrecision(region.geo.type === 'MultiPolygon' ? [(region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2] : Utils.geo.polyCentroid(region.geo.coordinates[0]));
				}
			} else {
				region.centerAuto = false;
				region.center = Utils.geo.geoToPrecision(data.center.reverse());
			}

			region.title_en = String(data.title_en);
			region.title_local = data.title_local ? String(data.title_local) : undefined;

			region.save(function (err, region) {
				if (err || !region) {
					return cb({message: err && err.message || 'Save error', error: true});
				}
				region = region.toObject();

				step(
					function () {
						//Если изменились координаты, отправляем на пересчет входящие объекты
						if (data.geo) {
							calcRegionIncludes(region, this);
						} else {
							this();
						}
					},
					function (err, geoRecalcRes) {
						if (err) {
							return cb({message: 'Saved, but while calculating included photos for the new geojson: ' + err.message, error: true});
						}
						if (geoRecalcRes) {
							_.assign(resultStat, geoRecalcRes);
						}
						if (parentChange) {
							//Если изменился родитель - пересчитываем все зависимости от уровня
							changeRegionParentExternality(region, parentsArrayOld, childLenArray, this);
						} else {
							this();
						}
					},
					function (err, moveRes) {
						if (err) {
							return cb({message: 'Saved, but while change parent externality: ' + err.message, error: true});
						}
						if (moveRes) {
							_.assign(resultStat, moveRes);
						}
						fillCache(this); //Обновляем кэш регионов
					},
					function (err) {
						if (err) {
							return cb({message: 'Saved, but while refilling cache: ' + err.message, error: true});
						}
						getParentsAndChilds(region, this);
					},
					function (err, childLenArr, parentsSortedArr) {
						if (err) {
							return cb({message: 'Saved, but while parents populating: ' + err.message, error: true});
						}
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

						//Обновляем онлайн-пользователей, у которых данный регион установлен как домашний или фильтруемый по умолчанию или модерируемый
						_session.regetUsers(function (usObj) {
							return usObj.rhash && usObj.rhash[region.cid] ||
								usObj.mod_rhash && usObj.mod_rhash[region.cid] ||
								usObj.user.regionHome && usObj.user.regionHome.cid === region.cid;
						}, true);

						cb({childLenArr: childLenArr, region: region, resultStat: resultStat});
					}
				);
			});
		}
	}
}

/**
 * Удаление региона администратором
 * Параметр reassignChilds зарезервирован - перемещение дочерних регионов в другой при удалении
 * @param socket
 * @param data
 * @param cb
 * @returns {*}
 */
function removeRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.cid) {
		return cb({message: msg.badParams, error: true});
	}

	Region.findOne({cid: data.cid}, function (err, regionToRemove) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		if (!regionToRemove) {
			return cb({message: 'Deleting region does not exists', error: true});
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
				Region.find({parents: regionToRemove.cid}, {_id: 1}, {lean: true}, this.parallel());

				//Находим родительский регион для замены домашнего региона пользователей, если он попадает в удаляемый
				//Если родительского нет (удаляем страну) - берем любую другую страну
				if (removingLevel) {
					parentQuery = {cid: regionToRemove.parents[regionToRemove.parents.length - 1]};
				} else {
					parentQuery = {cid: {$ne: regionToRemove.cid}, parents: {$size: 0}};
				}
				Region.findOne(parentQuery, {_id: 1, cid: 1, title_en: 1}, {lean: true}, this.parallel());
			},
			function (err, childRegions, parentRegion) {
				if (err || !parentRegion) {
					return cb({message: err && err.message || "Can't find parent", error: true});
				}
				removingRegionsIds = childRegions ? _.pluck(childRegions, '_id') : [];
				removingRegionsIds.push(regionToRemove._id);

				//Заменяем домашние регионы
				User.update({regionHome: {$in: removingRegionsIds}}, {$set: {regionHome: parentRegion._id}}, {multi: true}, this.parallel());
				resultData.homeReplacedWith = parentRegion;

				//Отписываем ("мои регионы") всех пользователей от удаляемых регионов
				User.update({regions: {$in: removingRegionsIds}}, {$pull: {regions: {$in: removingRegionsIds}}}, {multi: true}, this.parallel());

				//Удаляем регионы из модерируемых пользователями
				removeRegionsFromMods({mod_regions: {$in: removingRegionsIds}}, removingRegionsIds, this.parallel());
			},
			function (err, homeAffectedUsers, affectedUsers, modsResult) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				resultData.homeAffectedUsers = homeAffectedUsers;
				resultData.affectedUsers = affectedUsers;
				_.assign(resultData, modsResult);

				var objectsMatchQuery = {},
					objectsUpdateQuery = {$unset: {}},
					i;

				objectsMatchQuery['r' + removingLevel] = regionToRemove.cid;
				if (removingLevel === 0) {
					//Если удаляем страну, то присваивам все её объекты Открытому морю
					objectsUpdateQuery.$set = {r0: 1000000};
					for (i = 1; i <= maxRegionLevel; i++) {
						objectsUpdateQuery.$unset['r' + i] = 1;
					}
				} else {
					for (i = removingLevel; i <= maxRegionLevel; i++) {
						objectsUpdateQuery.$unset['r' + i] = 1;
					}
				}

				Photo.update(objectsMatchQuery, objectsUpdateQuery, {multi: true}, this.parallel()); //Обновляем входящие фотографии
				Region.remove({parents: regionToRemove.cid}, this.parallel()); //Удаляем дочерние регионы
				regionToRemove.remove(this.parallel()); //Удаляем сам регион
			},
			function (err, affectedPhotos) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				resultData.affectedPhotos = affectedPhotos || 0;
				fillCache(this); //Обновляем кэш регионов
			},
			function (err) {
				if (err) {
					return cb({message: err.message, error: true});
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
	User.find(usersQuery, {cid: 1}, {lean: true}, function (err, modUsers) {
		if (err) {
			return cb(err);
		}
		var modUsersCids = modUsers ? _.pluck(modUsers, 'cid') : [],
			resultData = {};

		if (modUsersCids.length) {
			//Удаляем регионы у найденных модераторов, в которых они есть
			User.update({cid: {$in: modUsersCids}}, {$pull: {mod_regions: {$in: regionsIds}}}, {multi: true}, function (err, affectedMods) {
				if (err) {
					return cb(err);
				}
				resultData.affectedMods = affectedMods || 0;

				//Лишаем звания модератора тех модераторов, у которых после удаления регионов, не осталось модерируемых регионов
				User.update({cid: {$in: modUsersCids}, mod_regions: {$size: 0}}, {$unset: {role: 1, mod_regions: 1}}, {multi: true}, function (err, affectedModsLose) {
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

function getRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.cid) {
		return cb({message: msg.badParams, error: true});
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

			cb({childLenArr: childLenArr, region: region});
		});
	});
}

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов
 * @param region Объект региона
 * @param cb
 */
function getChildsLenByLevel(region, cb) {
	step(
		function () {
			var level = region.parents && region.parents.length || 0, //Уровень региона равен кол-ву родительских
				childrenQuery = {};

			if (level < maxRegionLevel) {
				//Ищем кол-во потомков по уровням
				//У таких регионов на позиции текущего уровня будет стоять этот регион
				//и на кажой итераци кол-во уровней будет на один больше текущего
				//Например, потомки региона 77, имеющего одного родителя, будут найдены так:
				// {'parents.1': 77, parents: {$size: 2}}
				// {'parents.1': 77, parents: {$size: 3}}
				// {'parents.1': 77, parents: {$size: 4}}
				childrenQuery['parents.' + level] = region.cid;
				while (level++ < maxRegionLevel) {
					childrenQuery.parents = {$size: level};
					Region.count(childrenQuery, this.parallel());
				}
			} else {
				this(); //Если уровень максимальный - просто переходим на следующий шаг
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
			cb(null, childLenArr);
		}
	);
}

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов по уровням
 * @param region Объект региона
 * @param cb
 */
function getParentsAndChilds(region, cb) {
	var level = region.parents && region.parents.length || 0; //Уровень региона равен кол-ву родительских

	step(
		function () {
			getChildsLenByLevel(region, this.parallel());
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


//Массив количества всех регионов по уровням
function getRegionsCountByLevel(cb) {
	step(
		function () {
			for (var i = 0; i < maxRegionLevel; i++) {
				Region.count({parents: {$size: i}}, this.parallel());
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
			cb(null, childLenArr);
		}
	);
}
//Статистика регионов по уровням (количество регионов, количество их точек)
function getRegionsStatByLevel(cb) {
	step(
		function () {
			Region.collection.aggregate([
				{$project: {_id: 0, level: {$size: '$parents'}, pointsnum: 1}}, //Поля для выборки. level - формируемое поле размера массива родительских, т.е. уровень. Появилось в 2.5.3 https://jira.mongodb.org/browse/SERVER-4899
				{$group: {_id: '$level', regionsCount: {$sum: 1}, pointsCount: {$sum: '$pointsnum'}}}, //Считаем показатели по каждому уровню
				{$sort: {_id: 1}}, //Сортируем по родительский по возрастанию
				{$project: {regionsCount: 1, pointsCount: 1, _id: 0}} //Оставляем только нужные поля
			], this);
		},
		function (err, regionsStat) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb(null, regionsStat);
		}
	);
}

function getRegionsFull(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data)) {
		return cb({message: msg.badParams, error: true});
	}

	step(
		function () {
			Region.find({}, {_id: 0, geo: 0, __v: 0}, {lean: true}, this.parallel());
			getRegionsStatByLevel(this.parallel());
		},
		function (err, regions, regionsStatByLevel) {
			if (err || !regions) {
				return cb({message: err && err.message || 'No regions', error: true});
			}
			var regionsStatCommon = {regionsCount: 0, pointsCount: 0},
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

function getRegionsPublic(socket, data, cb) {
	if (!Utils.isType('object', data)) {
		return cb({message: msg.badParams, error: true});
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

	for (i = 0; i <= maxRegionLevel; i++) {
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
 * Устанавливает объекту свойства регионов r0-rmaxRegionLevel на основе переданной координаты
 * @param obj Объект (фото, комментарий и т.д.)
 * @param geo Координата
 * @param returnArrFields В коллбек вернётся массив регионов с выбранными полями
 * @param cb Коллбек
 */
function setObjRegionsByGeo(obj, geo, returnArrFields, cb) {
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

		for (i = 0; i <= maxRegionLevel; i++) {
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
 * Устанавливает объекту свойства регионов r0-rmaxRegionLevel на основе cid региона
 * @param obj Объект (фото, комментарий и т.д.)
 * @param cid Координата
 * @param returnArrFields Массив выбираемых полей. В коллбек вернётся массив регионов с выбранными полями
 */
function setObjRegionsByRegionCid(obj, cid, returnArrFields) {
	var region = regionCacheHash[cid],
		regionsArr = [],
		i;

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
	} else {
		return false;
	}
}
/**
 * Очищает все регионы у объекта
 * @param obj Объект (фото, комментарий и т.д.)
 */
function clearObjRegions(obj) {
	for (var i = 0; i <= maxRegionLevel; i++) {
		obj['r' + i] = undefined;
	}
}

//Возвращает список регионов, в которые попадает заданая точка
var getRegionsByGeoPoint = function () {
	var defRegion = 1000000,//Если регион не найден, возвращаем Открытое море
		defFields = {_id: 0, geo: 0, __v: 0};

	return function (geo, fields, cb) {
		Region.find({geo: {$nearSphere: {$geometry: {type: 'Point', coordinates: geo}, $maxDistance: 1}} }, fields || defFields, {lean: true, sort: {parents: -1}}, function (err, regions) {
			if (err) {
				return cb(err);
			}
			if (!regions) {
				regions = [];
			}
			if (!regions.length && regionCacheHash[defRegion]) {
				regions.push(regionCacheHash[defRegion]);
			}
			cb(null, regions);
		});
	};
}();


/**
 * Сохраняет домашний регион пользователя
 */
function saveUserHomeRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		login = data && data.login,
		itsMe = (iAm && iAm.login) === login,
		itsOnline,
		i;

	if (!iAm || (!itsMe && (!iAm.role || iAm.role < 10))) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login || !Number(data.cid)) {
		return cb({message: msg.badParams, error: true});
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
			Region.findOne({cid: Number(data.cid)}, {_id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1}, this.parallel());
		},
		function (err, user, region) {
			if (err || !user || !region) {
				return cb({message: err && err.message || (!user ? msg.nouser : msg.noregion), error: true});
			}
			user.regionHome = region;
			user.save(function (err, user) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				var regionHome = user.regionHome.toObject();
				delete regionHome._id;

				if (user.settings.r_as_home) {
					setUserRegions(login, [regionHome.cid], 'regions', function (err) {
						if (err) {
							return cb({message: err.message, error: true});
						}
						if (itsOnline) {
							_session.regetUser(user, true, null, function (err, user) {
								if (err) {
									return cb({message: err.message, error: true});
								}

								cb({message: 'ok', saved: 1, region: regionHome});
							});
						} else {
							cb({message: 'ok', saved: 1, region: regionHome});
						}
					});
				} else {
					if (itsOnline) {
						_session.emitUser(user.login);
					}
					cb({message: 'ok', saved: 1, region: regionHome});
				}
			});
		}
	);
}

/**
 * Сохраняет регионы пользователю
 */
function saveUserRegions(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		login = data && data.login,
		itsMe = (iAm && iAm.login) === login,
		itsOnline,
		i;

	if (!iAm || (!itsMe && (!iAm.role || iAm.role < 10))) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login || !Array.isArray(data.regions)) {
		return cb({message: msg.badParams, error: true});
	}
	if (data.regions.length > maxRegionLevel + 1) {
		return cb({message: 'Вы можете выбрать до ' + (maxRegionLevel + 1) + ' регионов', error: true});
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
					_session.regetUser(user, true, socket, function (err, user) {
						if (err) {
							return cb({message: err.message, error: true});
						}

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
	Photo = db.model('Photo');
	Region = db.model('Region');

	dbNative = db.db;

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('saveRegion', function (data) {
			saveRegion(socket, data, function (resultData) {
				socket.emit('saveRegionResult', resultData);
			});
		});
		socket.on('removeRegion', function (data) {
			removeRegion(socket, data, function (resultData) {
				socket.emit('removeRegionResult', resultData);
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

			if (!iAm) {
				return response({message: msg.deny, error: true});
			}
			if (!Utils.isType('object', data) || !Utils.geo.checkLatLng(data.geo)) {
				return response({message: msg.badParams, error: true});
			}
			data.geo = data.geo.reverse();

			getRegionsByGeoPoint(data.geo, {_id: 0, cid: 1, title_local: 1, parents: 1}, function (err, regions) {
				if (err || !regions) {
					response({message: err && err.message || 'No regions', error: true});
				}
				var regionsArr = [],
					i;

				for (i = 0; i <= maxRegionLevel; i++) {
					if (regions[i]) {
						regionsArr[regions[i].parents.length] = regions[i];
					}
				}

				response({geo: data.geo.reverse(), regions: _.compact(regionsArr)}); //На случай пропущенных по иерархии регионов (такого быть не должно) удаляем пустые значения массива
			});

			function response(resultData) {
				socket.emit('takeRegionsByGeo', resultData);
			}
		});

		socket.on('saveUserHomeRegion', function (data) {
			saveUserHomeRegion(socket, data, function (resultData) {
				socket.emit('saveUserHomeRegionResult', resultData);
			});
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
module.exports.getRegionsArrFromCache = getRegionsArrFromCache;
module.exports.getRegionsHashFromCache = getRegionsHashFromCache;
module.exports.getRegionsArrFromHash = getRegionsArrFromHash;

module.exports.getRegionsByGeoPoint = getRegionsByGeoPoint;
module.exports.getOrderedRegionList = getOrderedRegionList;
module.exports.getObjRegionList = getObjRegionList;
module.exports.setObjRegionsByGeo = setObjRegionsByGeo;
module.exports.setObjRegionsByRegionCid = setObjRegionsByRegionCid;
module.exports.clearObjRegions = clearObjRegions;
module.exports.setUserRegions = setUserRegions;

module.exports.buildQuery = buildQuery;