'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	UserCommentsView,
	UserSelfPublishedPhotos,
	Photo,
	PhotoMap,
	Comment,
	Counter,
	UserSubscr,
	regionController = require('./region.js'),
	PhotoCluster = require('./photoCluster.js'),
	PhotoConverter = require('./photoConverter.js'),
	subscrController = require('./subscr.js'),
	commentController = require('./comment.js'),

	_ = require('lodash'),
	fs = require('fs'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	async = require('async'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	logger,
	incomeDir = global.appVar.storePath + 'incoming/',
	privateDir = global.appVar.storePath + 'private/photos/',
	publicDir = global.appVar.storePath + 'public/photos/',
	imageFolders = ['x/', 's/', 'q/', 'm/', 'h/', 'd/', 'a/'],

	msg = {
		deny: 'You do not have permission for this action',
		notExists: 'Requested photo does not exist',
		anotherStatus: 'Фотография уже в другом статусе, обновите страницу'
	},

	shift10y = ms('10y'),
	compactFields = {_id: 0, cid: 1, file: 1, s: 1, ldate: 1, adate: 1, sdate: 1, title: 1, year: 1, ccount: 1, conv: 1, convqueue: 1, ready: 1},
	compactFieldsId = {_id: 1, cid: 1, file: 1, s: 1, ldate: 1, adate: 1, sdate: 1, title: 1, year: 1, ccount: 1, conv: 1, convqueue: 1, ready: 1},
	photoPermissions = {
		canModerate: function (photo, user) {
			var rhash,
				photoRegion,
				i;

			//Если у пользователя роль модератора регионов, смотрим его регионы
			if (user && user.role === 5) {
				if (!user.mod_regions || !user.mod_regions.length) {
					return true; //Глобальные модераторы могут модерировать всё
				}

				//Если фотография принадлежит одному из модерируемых регионов, значит пользователь может её модерировать
				rhash = _session.us[user.login].mod_rhash;
				for (i = 0; i < 5; i++) {
					photoRegion = photo['r' + i];
					if (photoRegion && rhash[photoRegion] !== undefined) {
						return true;
					}
				}
			}
			return false;
		},
		getCan: function (photo, user) {
			var can = {
					edit: false,
					disable: false,
					remove: false,
					approve: false,
					convert: false
				},
				ownPhoto,
				canModerate;

			if (user) {
				ownPhoto = photo.user && photo.user.equals(user._id);
				canModerate = user.role > 5 || photoPermissions.canModerate(photo, user);

				can.edit = canModerate || ownPhoto;
				can.remove = canModerate || photo.s < 2 && ownPhoto; //Пока фото новое, её может удалить и владелец
				if (canModerate) {
					can.disable = true;
					if (photo.s < 2) {
						can.approve = true;
					}
					if (user.role > 9) {
						can.convert = true;
					}
				}
			}
			return can;
		},
		canSee: function (photo, user) {
			if (photo.s === 5) {
				return true;
			} else if (user && photo.user) {
				if (photo.s === 9) {
					return user.role > 9;
				} else {
					return photo.user.equals(user._id) || user.role > 5 || photoPermissions.canModerate(photo, user);
				}
			}

			return false;
		}
	};

/**
 * Создает фотографии в базе данных
 * @param socket Сессия пользователя
 * @param data Объект или массив фотографий
 * @param cb Коллбэк
 */
var dirs = ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'];
function createPhotos(socket, data, cb) {
	var user = socket.handshake.session.user;
	if (!user) {
		return cb({message: msg.deny, error: true});
	}
	if (!data || (!Array.isArray(data) && !Utils.isType('object', data))) {
		return cb({message: 'Bad params', error: true});
	}

	if (!Array.isArray(data) && Utils.isType('object', data)) {
		data = [data];
	}

	var result = [],
		canCreate = 0;

	if (user.ranks && (~user.ranks.indexOf('mec_silv') || ~user.ranks.indexOf('mec_gold'))) {
		canCreate = Infinity; //Серебряный и золотой меценаты имеют неограниченный лимит
	} else if (user.ranks && ~user.ranks.indexOf('mec')) {
		canCreate = Math.max(0, 100 - user.pfcount); //Меценат имеет лимит 100
	} else if (user.pcount < 25) {
		canCreate = Math.max(0, 3 - user.pfcount);
	} else if (user.pcount < 50) {
		canCreate = Math.max(0, 5 - user.pfcount);
	} else if (user.pcount < 200) {
		canCreate = Math.max(0, 10 - user.pfcount);
	} else if (user.pcount < 1000) {
		canCreate = Math.max(0, 50 - user.pfcount);
	} else if (user.pcount >= 1000) {
		canCreate = Math.max(0, 100 - user.pfcount);
	}

	if (!canCreate || !data.length) {
		cb({message: 'Nothing to save', cids: result});
	}
	if (data.length > canCreate) {
		data = data.slice(0, canCreate);
	}

	step(
		function filesToPrivateFolder() {
			var item,
				i = data.length;

			while (i--) {
				item = data[i];
				item.fullfile = item.file.replace(/((.)(.)(.))/, "$2/$3/$4/$1");
				fs.rename(incomeDir + item.file, privateDir + item.fullfile, this.parallel());
			}
		},
		function increment(err) {
			if (err) {
				return cb({message: err.message || 'File transfer error', error: true});
			}
			Counter.incrementBy('photo', data.length, this);
		},
		function savePhotos(err, count) {
			if (err || !count) {
				return cb({message: err && err.message || 'Increment photo counter error', error: true});
			}
			var photo,
				now = Date.now(),
				next = count.next - data.length + 1,
				item,
				i;

			for (i = 0; i < data.length; i++) {
				item = data[i];

				photo = new Photo({
					cid: next + i,
					user: user._id,
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

				result.push({cid: photo.cid});
				photo.save(this.parallel());
			}
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			user.pfcount = user.pfcount + data.length;
			_session.saveEmitUser(user.login, null, socket, this);
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb({message: data.length + ' photo successfully saved', cids: result});
		}
	);
}

function changePublicPhotoExternality(socket, photo, iAm, makePublic, cb) {
	step(
		function () {
			//Скрываем или показываем комментарии и пересчитываем их публичное кол-во у пользователей
			commentController.hideObjComments(photo._id, !makePublic, iAm, this.parallel());

			//Пересчитывам кол-во публичных фото у владельца фотографии
			var user = _session.getOnline(null, photo.user);
			if (user) {
				user.pcount = user.pcount + (makePublic ? 1 : -1);
				_session.saveEmitUser(null, photo.user);
			} else {
				User.update({_id: photo.user}, {$inc: {pcount: makePublic ? 1 : -1}}, this.parallel());
			}

			//Если у фото есть координаты, значит надо провести действие с картой
			if (Utils.geoCheck(photo.geo)) {
				if (makePublic) {
					photoToMap(photo, null, null, this.parallel());
				} else {
					photoFromMap(photo, this.parallel());
				}
			}
		},
		function (err) {
			cb(err);
		}
	);
}

//Добавляет фото на карту
function photoToMap(photo, geoPhotoOld, yearPhotoOld, cb) {
	step(
		function () {
			PhotoCluster.clusterPhoto(photo, geoPhotoOld, yearPhotoOld, this.parallel()); 	//Отправляем на кластеризацию
			PhotoMap.update(
				{cid: photo.cid},
				{
					$setOnInsert: {cid: photo.cid},
					$set: {
						geo: photo.geo,
						file: photo.file,
						dir: photo.dir,
						title: photo.title,
						year: photo.year,
						year2: photo.year2
					}
				},
				{upsert: true},
				this.parallel()
			);
		},
		function (err) {
			if (cb) {
				cb(err);
			}
		}
	);
}
//Удаляет фото с карты
function photoFromMap(photo, cb) {
	step(
		function () {
			PhotoCluster.declusterPhoto(photo, this.parallel());
			PhotoMap.remove({cid: photo.cid}, this.parallel());
		},
		function (err) {
			if (cb) {
				cb(err);
			}
		}
	);
}

//Удаляет из Incoming загруженное, но не созданное фото
function removePhotoIncoming(socket, data, cb) {
	var user = socket.handshake.session.user;
	if (!user) {
		return cb({message: msg.deny, error: true});
	}

	fs.unlink(incomeDir + data.file, cb);
}

/**
 * Удаление фотографии
 * @param socket Сокет пользователя
 * @param cid
 * @param cb Коллбэк
 */
function removePhoto(socket, cid, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm) {
		return cb({message: msg.deny, error: true});
	}
	cid = Number(cid);
	if (!cid) {
		return cb({message: 'Bad params', error: true});
	}

	findPhoto({cid: cid}, {}, iAm, function (err, photo) {
		if (err || !photo) {
			return cb({message: err && err.message || 'No such photo', error: true});
		}

		if (!photoPermissions.getCan(photo, iAm).remove) {
			return cb({message: msg.deny, error: true});
		}

		if (photo.s === 0 || photo.s === 1) {
			//Неподтвержденную фотографию удаляем безвозвратно
			photo.remove(function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}

				var user = _session.getOnline(null, photo.user);

				//Пересчитывам кол-во новых фото у владельца
				if (user) {
					user.pfcount = user.pfcount - 1;
					_session.saveEmitUser(user.login);
				} else {
					User.update({_id: photo.user}, {$inc: {pfcount: -1}}).exec();
				}

				//Удаляем из конвейера если есть
				PhotoConverter.removePhotos([photo.cid]);

				//Удаляем файлы фотографии
				fs.unlink(privateDir + photo.file, Utils.dummyFn);
				imageFolders.forEach(function (folder) {
					fs.unlink(publicDir + folder + photo.file, Utils.dummyFn);
				});

				cb({message: 'ok'});
			});
		} else {
			var isPublic = photo.s === 5;

			photo.s = 9;
			photo.save(function (err, photoSaved) {
				if (err) {
					return cb({message: err && err.message, error: true});
				}
				step(
					function () {
						//Отписываем всех пользователей
						subscrController.unSubscribeObj(photoSaved._id, null, this.parallel());
						//Удаляем время просмотра комментариев у пользователей
						commentController.dropCommentsView(photoSaved._id, null, this.parallel());
						if (isPublic) {
							changePublicPhotoExternality(socket, photoSaved, iAm, false, this.parallel());
						}
					},
					function (err) {
						if (err) {
							return cb({message: 'Removed ok, but: ' + (err && err.message || 'other changes error'), error: true});
						}
						cb({message: 'ok'});
					}
				);
			});
		}
	});
}

//Подтверждаем новую фотографию
function approvePhoto(iAm, cid, cb) {
	cid = Number(cid);
	if (!cid) {
		return cb({message: msg.notExists, error: true});
	}

	Photo.findOne({cid: cid}, function (err, photo) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		if (!photo) {
			return cb({message: msg.notExists, error: true});
		}
		if (photo.s !== 0 && photo.s !== 1) {
			return cb({message: msg.anotherStatus, error: true});
		}

		photo.s = 5;
		photo.adate = photo.sdate = new Date();
		photo.save(function (err, photoSaved) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({message: 'Photo approved successfully'});

			if (Utils.geoCheck(photoSaved.geo)) {
				photoToMap(photoSaved);
			}

			//Обновляем количество у автора фотографии
			var user = _session.getOnline(null, photoSaved.user);
			if (user) {
				user.pcount = user.pcount + 1;
				user.pfcount = user.pfcount - 1;
				_session.saveEmitUser(user.login);
			} else {
				User.update({_id: photoSaved.user}, {$inc: {pcount: 1, pfcount: -1}}).exec();
			}

			//Подписываем автора фотографии на неё
			subscrController.subscribeUserByIds(photoSaved.user, photoSaved._id, 'photo');
		});
	});
}

//Активация/деактивация фото
function activateDeactivate(socket, data, cb) {
	var user = socket.handshake.session.user;
	if (!user || user.role < 5) {
		return cb({message: msg.deny, error: true});
	}
	if (!data || !Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}
	var cid = Number(data.cid),
		makeDisabled = !!data.disable;

	if (!cid) {
		return cb({message: msg.notExists, error: true});
	}

	Photo.findOne({cid: cid}, function createInNewModel(err, photo) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		if (!photo) {
			return cb({message: msg.notExists, error: true});
		}
		if (makeDisabled && photo.s === 7 || !makeDisabled && photo.s === 5) {
			return cb({message: msg.anotherStatus, error: true});
		}

		photo.s = makeDisabled ? 7 : 5;
		photo.save(function (err, photoSaved) {
			if (err) {
				return cb({message: err.message, error: true});
			}

			changePublicPhotoExternality(socket, photoSaved, user, !makeDisabled, function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				cb({s: photoSaved.s});
			});
		});
	});
}

//Отдаем фотографию для её страницы
function givePhoto(socket, data, cb) {
	var cid = Number(data.cid),
		iAm = socket.handshake.session.user,
		fieldSelect = {'frags._id': 0};

	if (!cid) {
		return cb({message: msg.notExists, error: true});
	}

	//Инкрементируем кол-во просмотров только у публичных фото
	//TODO: Сделать инкрементацию только у публичных!
	Photo.findOneAndUpdate({cid: cid}, {$inc: {vdcount: 1, vwcount: 1, vcount: 1}}, {new: true, select: fieldSelect}, function (err, photo) {
		if (err) {
			return cb({message: err && err.message, error: true});
		}

		if (!photo || !photoPermissions.canSee(photo, iAm)) {
			return cb({message: msg.notExists, error: true});
		} else {
			var can;

			if (data.checkCan) {
				//Права надо проверять до популяции пользователя
				can = photoPermissions.getCan(photo, iAm);
			}

			step(
				function () {
					var user = _session.getOnline(null, photo.user),
						paralellUser = this.parallel();

					if (user) {
						photo = photo.toObject();
						photo.user = {
							login: user.login, avatar: user.avatar, disp: user.disp, ranks: user.ranks || [], sex: user.sex, online: true
						};
						paralellUser(null, photo);
					} else {
						photo.populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, disp: 1, ranks: 1, sex: 1}}, function (err, photo) {
							paralellUser(err, photo && photo.toObject());
						});
					}
					regionController.getObjRegionList(photo, {_id: 0, cid: 1, title_en: 1, title_local: 1}, this.parallel());

					if (iAm) {
						UserSubscr.findOne({obj: photo._id, user: iAm._id}, {_id: 0}, this.parallel());
					}
				},
				function (err, photo, regions, subscr) {
					if (err) {
						return cb({message: err && err.message, error: true});
					}

					if (subscr) {
						photo.subscr = true;
					}

					for (var i = 0; i < 5; i++) {
						delete photo['r' + i];
					}
					if (regions.length) {
						photo.regions = regions;
					}

					if (!iAm || !photo.ccount) {
						delete photo._id;
						cb({photo: photo, can: can});
					} else {
						commentController.getNewCommentsCount([photo._id], iAm._id, null, function (err, countsHash) {
							if (err) {
								return cb({message: err && err.message, error: true});
							}
							if (countsHash[photo._id]) {
								photo.ccount_new = countsHash[photo._id];
							}
							delete photo._id;
							cb({photo: photo, can: can});
						});
					}
				}
			);
		}
	});
}

//Отдаем последние публичные фотографии на главной для анонимов в memoized
var givePhotosPublicIndex = (function () {
	var options = {lean: true, sort: {sdate: -1}, skip: 0, limit: 29};

	return Utils.memoizeAsync(function (handler) {
		Photo.find({s: 5}, compactFields, options, handler);
	}, ms('30s'));
}());

//Отдаем последние публичные "Где это?" фотографии для главной
var givePhotosPublicNoGeoIndex = (function () {
	var options = {lean: true, sort: {sdate: -1}, skip: 0, limit: 29};

	return Utils.memoizeAsync(function (handler) {
		Photo.find({s: 5, geo: null}, compactFields, options, handler);
	}, ms('30s'));
}());

var filterProps = {nogeo: true, r: []};
function parseFilter(filterString) {
	var filterParams = filterString && filterString.split(';'),
		filterParam,
		filterVal,
		dividerIndex,
		result = {},
		i, j;

	if (filterParams) {
		for (i = filterParams.length; i--;) {
			filterParam = filterParams[i];
			dividerIndex = filterParam.indexOf('_');
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
						filterVal = filterVal.split(',').map(Number);
						if (Array.isArray(filterVal) && filterVal.length) {
							result.r = [];
							for (j = filterVal.length; j--;) {
								if (filterVal[j]) {
									result.r.push(filterVal[j]);
								}
							}
							if (!result.r.length) {
								delete result.r;
							}
						}
					}
				}
			}
		}
	}

	return result;
}

//Отдаем полную публичную галерею в компактном виде
function givePhotosPublic(iAm, data, cb) {
	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	var skip = Math.abs(Number(data.skip)) || 0,
		limit = Math.min(data.limit || 40, 100),
		filter = data.filter ? parseFilter(data.filter) : {};

	if (!filter.s) {
		filter.s = [5];
	}

	step(
		function () {
			var query = buildPhotosQuery(filter, null, iAm),
				fieldsSelect = iAm ? compactFieldsId : compactFields; //Для подсчета новых комментариев нужны _id

			console.log(filter);
			console.log(query);

			Photo.find(query, fieldsSelect, {lean: true, skip: skip, limit: limit, sort: {sdate: -1}}, this.parallel());
			Photo.count(query, this.parallel());
		},
		finishOrNewCommentsCount
	);

	function finishOrNewCommentsCount(err, photos, count) {
		if (err || !photos) {
			return cb({message: err && err.message || 'Photos does not exist', error: true});
		}

		if (!iAm || !photos.length) {
			//Если аноним или фотографий нет, сразу возвращаем
			finish(null, photos);
		} else {
			//Если пользователь залогинен, заполняем кол-во новых комментариев для каждого объекта
			commentController.fillNewCommentsCount(photos, iAm._id, null, finish);
		}

		function finish(err, photos) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (iAm) {
				for (var i = photos.length; i--;) {
					delete photos[i]._id;
				}
			}
			cb({photos: photos, count: count, skip: skip});
		}
	}
}


//Отдаем последние фотографии, ожидающие подтверждения
function givePhotosForApprove(iAm, data, cb) {
	var query = {s: 1};

	if (!iAm || iAm.role < 5) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}
	if (iAm.role === 5) {
		_.assign(query, _session.us[iAm.login].mod_rquery);
	}

	Photo.find(query, compactFields, {lean: true, sort: {sdate: -1}, skip: data.skip || 0, limit: Math.min(data.limit || 20, 100)}, cb);
}

//Отдаем галерею пользователя в компактном виде
function giveUserPhotos(iAm, data, cb) {
	User.collection.findOne({login: data.login}, {_id: 1, pcount: 1}, function (err, user) {
		if (err || !user) {
			return cb({message: err && err.message || 'Such user does not exist', error: true});
		}
		var skip = data.skip || 0,
			limit = Math.min(data.limit || 20, 100),
			filter = data.filter || {},
			fieldsSelect = iAm ? compactFieldsId : compactFields;

		step(
			function () {
				var query = buildPhotosQuery(filter, user._id, iAm);
				query.user = user._id;

				Photo.find(query, fieldsSelect, {lean: true, sort: {sdate: -1}, skip: skip, limit: limit}, this.parallel());
				Photo.count(query, this.parallel());
			},
			function (err, photos, count) {
				if (err || !photos) {
					return cb({message: err && err.message || msg.notExists, error: true});
				}

				if (!iAm || !photos.length) {
					//Если аноним или фотографий нет, сразу возвращаем
					finish(null, photos);
				} else {
					//Если пользователь залогинен, заполняем кол-во новых комментариев для каждого объекта
					commentController.fillNewCommentsCount(photos, iAm._id, null, finish);
				}

				function finish(err, photos) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					if (iAm) {
						for (var i = photos.length; i--;) {
							delete photos[i]._id;
						}
					}
					cb({photos: photos, count: count, skip: skip});
				}
			}
		);
	});
}

//Берем массив до и после указанной фотографии пользователя указанной длины
function giveUserPhotosAround(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		cid = Number(data && data.cid),
		limitL = Math.min(Number(data.limitL), 100),
		limitR = Math.min(Number(data.limitR), 100);

	if (!cid || (!limitL && !limitR)) {
		return cb({message: 'Bad params', error: true});
	}

	findPhoto({cid: cid}, null, iAm, function (err, photo) {
		if (err || !photo || !photo.user) {
			return cb({message: msg.notExists, error: true});
		}

		step(
			function () {
				var query = buildPhotosQuery({}, photo.user, iAm);
				query.user = photo.user;

				if (limitL) {
					query.sdate = {$gt: photo.sdate};
					Photo.find(query, compactFields, {lean: true, sort: {sdate: 1}, limit: limitL}, this.parallel());
				} else {
					this.parallel()(null, []);
				}

				if (limitR) {
					query.sdate = {$lt: photo.sdate};
					Photo.find(query, compactFields, {lean: true, sort: {sdate: -1}, limit: limitL}, this.parallel());
				} else {
					this.parallel()(null, []);
				}
			},
			function (err, photosL, photosR) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				cb({left: photosL || [], right: photosR || []});
			}
		);
	});
}

//Берем массив ближайших фотографий
function giveNearestPhotos(data, cb) {
	if (!data || !Utils.geoCheck(data.geo)) {
		return cb({message: 'Bad params', error: true});
	}

	Photo.find({geo: {$near: data.geo.reverse(), $maxDistance: 2000}}, compactFields, {lean: true, limit: Math.min(Number(data.limit), 50)}, cb);
}

//Отдаем непубличные фотографии
function giveUserPhotosPrivate(socket, data, cb) {
	var iAm = socket.handshake.session.user;
	if (!iAm || (iAm.role < 5 && iAm.login !== data.login)) {
		return cb({message: msg.deny, error: true});
	}

	User.getUserID(data.login, function (err, userid) {
		if (err) {
			return cb({message: err && err.message, error: true});
		}
		var query = {user: userid};

		if (iAm.role === 5) {
			query.s = {$ne: 9};
			_.assign(query, _session.us[iAm.login].mod_rquery);
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

		Photo.find(query, compactFields, {lean: true, sort: {sdate: -1}}, function (err, photos) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}

			cb({photos: photos});
		});
	});
}

//Отдаем новые фотографии
function givePhotosFresh(socket, data, cb) {
	var iAm = socket.handshake.session.user;
	if (!iAm ||
		(!data.login && iAm.role < 5) ||
		(data.login && iAm.role < 5 && iAm.login !== data.login)) {
		return cb({message: msg.deny, error: true});
	}
	if (!data || !Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function () {
			if (data.login) {
				User.getUserID(data.login, this);
			} else {
				this();
			}
		},
		function (err, userid) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			var query = {s: 0};

			if (iAm.login !== data.login && iAm.role === 5) {
				_.assign(query, _session.us[iAm.login].mod_rquery);
			}
			if (userid) {
				query.user = userid;
			}
			if (data.after) {
				query.ldate = {$gt: new Date(data.after)};
			}

			Photo.find(query, compactFields, {lean: true, skip: data.skip || 0, limit: Math.min(data.limit || 100, 100)}, function (err, photos) {
				if (err) {
					return cb({message: err && err.message, error: true});
				}
				cb({photos: photos || []});
			});
		}
	);
}

//Отдаем разрешенные can для фото
function giveCanPhoto(socket, data, cb) {
	var user = socket.handshake.session.user,
		cid = Number(data.cid);

	if (isNaN(cid)) {
		return cb({message: msg.notExists, error: true});
	}
	if (user) {
		Photo.findOne({cid: cid}, {_id: 0, user: 1}, function (err, photo) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({can: photoPermissions.getCan(photo, user)});
		});
	} else {
		cb({});
	}
}

//Сохраняем информацию о фотографии
function savePhoto(socket, data, cb) {
	var user = socket.handshake.session.user,
		cid = Number(data.cid),
		photoOldObj,
		newValues,
		oldGeo,
		newGeo,
		geoToNull,
		sendingBack = {regions: []};

	if (!user) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}

	findPhoto({cid: cid}, {frags: 0}, user, function (err, photo) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		if (!photo) {
			return cb({message: msg.notExists, error: true});
		}
		if (!photoPermissions.getCan(photo, user).edit) {
			return cb({message: msg.deny, error: true});
		}

		photoOldObj = photo.toObject();

		//Сразу парсим нужные поля, чтобы далее сравнить их с существующим распарсеным значением
		if (data.desc) {
			data.desc = Utils.inputIncomingParse(data.desc);
		}
		if (data.source) {
			data.source = Utils.inputIncomingParse(data.source);
		}
		if (data.geo && !Utils.geoCheck(data.geo)) {
			delete data.geo;
		}

		//Новые значения действительно изменяемых свойств
		newValues = Utils.diff(_.pick(data, 'geo', 'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author'), photoOldObj);
		if (_.isEmpty(newValues)) {
			return cb({message: 'Nothing to save'});
		}

		if (newValues.geo) {
			Utils.geo.geoToPrecisionRound(newValues.geo);
		} else if (newValues.geo === null) {
			//Значит обнуляем координату
			geoToNull = true;
			newValues.geo = undefined; //Удаляем координату
			sendingBack.regions = [];
			regionController.clearObjRegions(photo); //Очищаем привязку к регионам
		}
		if (newValues.desc !== undefined) {
			sendingBack.desc = newValues.desc;
		}
		if (newValues.source !== undefined) {
			sendingBack.source = newValues.source;
		}

		oldGeo = photoOldObj.geo;
		newGeo = newValues.geo;

		if (geoToNull && photo.s === 5) {
			//Если обнуляем координату и фото публичное, значит оно было на карте. Удаляем с карты.
			//Мы должны удалить с карты до удаления координаты, так как декластеризация смотрит на неё
			photoFromMap(photo, save);
		} else if (newGeo) {
			//Если координата добавилась/изменилась, запрашиваем новые регионы фотографии
			regionController.setObjRegions(photo, newGeo, {_id: 0, cid: 1, title_en: 1, title_local: 1}, function (err, regionsArr) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				sendingBack.regions = regionsArr;
				save();
			});
		} else {
			save();
		}

		function save() {
			_.assign(photo, newValues);

			photo.save(function (err, photoSaved) {
				if (err) {
					return cb({message: err.message || 'Save error', error: true});
				}

				var newKeys = Object.keys(newValues),
					oldValues = {}, //Старые значения изменяемых свойств
					i;

				for (i = newKeys.length; i--;) {
					oldValues[newKeys[i]] = photoOldObj[newKeys[i]];
				}

				if (photoSaved.s === 5 && !_.isEmpty(photoSaved.geo) && (newGeo || !_.isEmpty(_.pick(oldValues, 'dir', 'title', 'year', 'year2')))) {
					//Если фото публичное, добавилась/изменилась координата или есть чем обновить постер кластера, то пересчитываем на карте
					//Здесь координата должна проверятся именно photoSaved.geo, а не newGeo, так как случай newGeo undefined может означать, что координата не изменилась, но для постера данные могли измениться
					photoToMap(photoSaved, oldGeo, photoOldObj.year, finish);
				} else {
					finish();
				}

				function finish(err) {
					if (err) {
						return cb({message: 'Photo saved, but ' + err.message, error: true});
					}
					cb({message: 'Photo saved successfully', saved: true, data: sendingBack});
				}
			});
		}
	});
}

//Говорим, что фото готово к подтверждению
function readyPhoto(socket, data, cb) {
	var user = socket.handshake.session.user,
		cid = Number(data);

	if (!user) {
		return cb({message: msg.deny, error: true});
	}
	if (!cid) {
		return cb({message: msg.notExists, error: true});
	}
	step(
		function () {
			Photo.findOne({cid: cid}, this);
		},
		function (err, photo) {
			if (err || !photo) {
				return cb({message: err && err.message || msg.notExists, error: true});
			}
			if (photo.s !== 0) {
				return cb({message: msg.anotherStatus, error: true});
			}
			if (!photoPermissions.getCan(photo, user).edit) {
				return cb({message: msg.deny, error: true});
			}

			if (user.ranks && user.ranks.indexOf('mec_gold') > -1) {
				//Если пользователь - золотой меценат, значит он сразу публикует фото, если таких действий еще менее 100
				UserSelfPublishedPhotos.find({user: user._id}, {_id: 0, photos: 1}, {lean: true}, function (err, obj) {
					if (obj && obj.photos && obj.photos.length >= 100) {
						justSetReady();
					} else {
						approvePhoto(user, cid, function (result) {
							if (result.error) {
								return cb(result);
							}
							cb({message: 'Ok', published: true});
							UserSelfPublishedPhotos.update({user: user._id}, {$push: {photos: photo._id}}, {upsert: true}).exec();
						});
					}
				});
			} else {
				//Если пользователь обычный, то просто ставим флаг готовности
				justSetReady();
			}

			function justSetReady() {
				photo.s = 1;
				photo.save(function finish(err) {
					if (err) {
						return cb({message: err && err.message, error: true});
					}
					cb({message: 'Ok'});
				});
			}
		}
	);
}

//Фотографии и кластеры по границам
function getBounds(data, cb) {
	if (!Utils.isType('object', data) || !Array.isArray(data.bounds) || !data.z) {
		cb({message: 'Bad params', error: true});
		return;
	}

	var year = false,
		i = data.bounds.length;

	// Реверсируем geo границы баунда
	while (i--) {
		data.bounds[i][0].reverse();
		data.bounds[i][1].reverse();
	}

	// Определяем, нужна ли выборка по границам лет
	if (Number(data.year) && Number(data.year2) && data.year >= 1826 && data.year <= 2000 && data.year2 >= data.year && data.year2 <= 2000 && (1 + data.year2 - data.year < 175)) {
		year = true;
	}

	if (data.z < 17) {
		if (year) {
			PhotoCluster.getBoundsByYear(data, res);
		} else {
			PhotoCluster.getBounds(data, res);
		}
	} else {
		step(
			function () {
				var i = data.bounds.length,
					criteria,
					yearCriteria;

				if (year) {
					if (data.year === data.year2) {
						yearCriteria = data.year;
					} else {
						yearCriteria = {$gte: data.year, $lte: data.year2};
					}
				}

				while (i--) {
					criteria = {geo: {$geoWithin: {$box: data.bounds[i]}}};
					if (year) {
						criteria.year = yearCriteria;
					}
					PhotoMap.collection.find(criteria, {_id: 0}, this.parallel());
				}
			},
			function cursors(err) {
				if (err) {
					return cb({message: err && err.message, error: true});
				}
				var i = arguments.length;
				while (i > 1) {
					arguments[--i].toArray(this.parallel());
				}
			},
			function (err, photos) {
				if (err) {
					return cb({message: err && err.message, error: true});
				}
				var i = arguments.length;

				while (i > 2) {
					photos.push.apply(photos, arguments[--i]);
				}
				res(err, photos);
			}
		);
	}

	function res(err, photos, clusters) {
		if (err) {
			return cb({message: err && err.message, error: true});
		}

		// Реверсируем geo
		for (var i = photos.length; i--;) {
			photos[i].geo.reverse();
		}
		cb({photos: photos, clusters: clusters, startAt: data.startAt, z: data.z});
	}
}

//Отправляет выбранные фото на конвертацию
function convertPhotos(socket, data, cb) {
	var user = socket.handshake.session.user,
		cids = [],
		i;

	if (!user || user.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Array.isArray(data) || !data.length) {
		return cb({message: 'Bad params', error: true});
	}

	for (i = data.length; i--;) {
		data[i].cid = Number(data[i].cid);
		data[i].variants = _.intersection(data[i].variants, [ "a", "d", "h", "m", "q", "s", "x"]);
		if (data[i].cid && data[i].variants.length) {
			cids.push(data[i].cid);
		}
	}
	if (!cids.length) {
		return cb({message: 'Bad params', error: true});
	}

	Photo.update({cid: {$in: cids}}, {$set: {convqueue: true}}, {multi: true}, function (err) {
		if (err) {
			return cb({message: err && err.message, error: true});
		}
		PhotoConverter.addPhotos(data, function (err, addResult) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb(addResult);
		});
	});
}

//Отправляет все фото выбранных вариантов на конвертацию
function convertPhotosAll(socket, data, cb) {
	var user = socket.handshake.session.user;

	if (!user || user.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}
	PhotoConverter.addPhotosAll(data, function (addResult) {
		cb(addResult);
	});
}

/**
 * Находим фотографию с учетом прав пользователя
 * @param query
 * @param fieldSelect Выбор полей (обязательно должны присутствовать user, s, r0-4)
 * @param user Пользователь сессии
 * @param cb
 */
function findPhoto(query, fieldSelect, user, cb) {
	if (!user) {
		query.s = 5; //Анонимам ищем только публичные
	}
	Photo.findOne(query, fieldSelect, function (err, photo) {
		if (err) {
			return cb(err);
		}
		if (photo && photoPermissions.canSee(photo, user)) {
			cb(null, photo);
		} else {
			cb(null, null);
		}
	});
}

/**
 * Строим параметры запроса (query) для запроса фотографий с фильтром с учетом прав на статусы и регионы
 * @param filter
 * @param forUserId
 * @param iAm Пользователь сессии
 */
function buildPhotosQuery(filter, forUserId, iAm) {
	var query, //Результирующий запрос
		query_pub, //Запрос в рамках публичных регионов
		query_mod, //Запрос в рамках модерируемых регионов
		rquery_pub,
		rquery_mod,

		usObj = iAm && _session.us[iAm.login],

		squery_public_only = !iAm || filter.s && filter.s.length === 1 && filter.s[0] === 5,
		region,
		contained,
		i,
		j;

	if (!squery_public_only && filter.s && filter.s.length) {
		//Если есть публичный, убираем, так как непубличный squery будет использован только в rquery_mod
		filter.s = _.without(filter.s, 5, !iAm || !iAm.role || iAm.role < 10 ? 9 : undefined);
	}

	if (Array.isArray(filter.r) && filter.r.length) {
		rquery_pub = rquery_mod = regionController.buildQuery(regionController.getRegionsFromCache(filter.r)).rquery;
	}

	if (squery_public_only) {
		query_pub = {};  //Анонимам или при фильтрации для публичных отдаем только публичные

		if (filter.r === undefined && iAm && iAm.regions.length) {
			rquery_pub = usObj.rquery; //Если фильтр не указан - отдаем по собственным регионам
		}
	} else if (forUserId && forUserId.equals(iAm._id)) {
		//Собственную галерею отдаем без удаленных(не админам) и без регионов в настройках, только по filter.r
		query_mod = {};
	} else {
		if (filter.r === undefined && iAm.regions.length) {
			rquery_pub = usObj.rquery; //Если фильтр не указан - отдаем по собственным регионам
		}

		if (iAm.role > 9) {
			//Админам отдаем все статусы
			query_mod = {};
		} else if (!iAm.role || iAm.role < 5) {
			//Ниже чем модераторам региона отдаем только публичные
			query_pub = {};
		} else if (iAm.role === 5) {
			//Региональным модераторам отдаем в своих регионах без удаленных, в остальных - только публичные

			if (!iAm.mod_regions.length || usObj.mod_regions_equals) {
				//Глобальным модераторам и региональным, у которых совпадают регионы модерирования с собственными,
				//(т.е. область модерирования включает в себя пользовательскую)
				//отдаем пользовательскую область как модерируемую
				query_mod = {};
			} else if (filter.r === 0 || !iAm.regions.length) {
				//Если запрашиваются все пользовательские регионы (т.е. весь мир),
				//то делаем глобальный запрос по публичным, а со статусами по модерируемым
				query_pub = {};
				query_mod = {};
				rquery_mod = usObj.mod_rquery;
			} else {
				//В случае, когда массив пользовательских и модерируемых регионов различается,
				//"вычитаем" публичные из модерируемых, получая два новых чистых массива

				var regular_regions,//Пользовательские регионы - из фильтра или из пользователя
					regular_regions_hash, //Хэш пользовательских регионов - из фильтра или из пользователя
					regions_pub = [], //Чистый массив пользовательских регионов
					regions_mod = []; //Чистый массив модерируемых регионов

				if (Array.isArray(filter.r) && filter.r.length) {
					regular_regions = regionController.getRegionsFromCache(filter.r);
					regular_regions_hash = regionController.getRegionsHashFromCache(filter.r);
				} else {
					regular_regions = regionController.getRegionsFromCache(_.pluck(iAm.regions, 'cid'));
					regular_regions_hash = usObj.rhash;
				}

				//Если сам пользовательский регион или один из его родителей является модерируемым,
				//то включаем его в массив модерируемых
				for (i = regular_regions.length; i--;) {
					region = regular_regions[i];
					contained = false;

					if (usObj.mod_rhash[region.cid]) {
						contained = true;
					} else if (region.parents) {
						for (j = region.parents.length; j--;) {
							if (usObj.mod_rhash[region.parents[j]]) {
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
				for (i = iAm.mod_regions.length; i--;) {
					region = usObj.mod_rhash[iAm.mod_regions[i].cid];
					if (region.parents) {
						for (j = region.parents.length; j--;) {
							if (regular_regions_hash[region.parents[j]]) {
								regions_mod.push(region);
							}
						}
					}
				}

				if (regions_pub.length) {
					query_pub = {};
					rquery_pub = regionController.buildQuery(regions_pub).rquery;
				}
				if (regions_mod.length) {
					query_mod = {};
					rquery_mod = regionController.buildQuery(regions_mod).rquery;
				}
			}
		}
	}

	if (query_pub) {
		query_pub.s = 5;
		if (rquery_pub) {
			_.assign(query_pub, rquery_pub);
		}
	}
	if (query_mod) {
		if (filter.s && filter.s.length) {
			if (filter.s.length === 1) {
				query_mod.s = filter.s[0];
			} else {
				query_mod.s = {$in: filter.s};
			}
		} else if (iAm.role < 10) {
			query_mod.s = {$ne: 9};
		}

		if (rquery_mod) {
			_.assign(query_mod, rquery_mod);
		}
	}

	if (query_pub && query_mod) {
		query = {$or: [
			query_pub,
			query_mod
		]};
	} else {
		query = query_pub || query_mod || {};
	}

	if (filter.nogeo) {
		query.geo = null;
	}

	//console.log(JSON.stringify(query));
	return query;
}

//Обнуляет статистику просмотров за день и неделю
var planResetDisplayStat = (function () {
	function resetStat() {
		var setQuery = {vdcount: 0},
			needWeek = moment().day() === 1; //Начало недели - понедельник

		if (needWeek) {
			setQuery.vwcount = 0;
		}
		Photo.update({s: {$in: [5, 7, 9]}}, {$set: setQuery}, {multi: true}, function (err, count) {
			planResetDisplayStat();
			if (err) {
				return logger.error(err);
			}
			logger.info('Reset day' + (needWeek ? ' and week ' : ' ') + 'display statistics for %s photos', count);
		});
	}

	return function () {
		setTimeout(resetStat, moment().add('d', 1).startOf('day').diff(moment()) + 2000);
	};
}());


module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("photo.js");

	Settings = db.model('Settings');
	User = db.model('User');
	Photo = db.model('Photo');
	PhotoMap = db.model('PhotoMap');
	Counter = db.model('Counter');
	Comment = db.model('Comment');
	UserSubscr = db.model('UserSubscr');

	UserCommentsView = db.model('UserCommentsView');
	UserSelfPublishedPhotos = db.model('UserSelfPublishedPhotos');

	PhotoCluster.loadController(app, db, io);
	PhotoConverter.loadController(app, db, io);

	planResetDisplayStat(); //Планируем очистку статистики

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('createPhoto', function (data) {
			createPhotos(socket, data, function (createData) {
				if (!createData.error && createData.cids && createData.cids.length) {
					PhotoConverter.addPhotos(createData.cids);
				}
				socket.emit('createPhotoCallback', createData);
			});
		});

		socket.on('removePhoto', function (data) {
			removePhoto(socket, data, function (resultData) {
				socket.emit('removePhotoCallback', resultData);
			});
		});
		socket.on('removePhotoInc', function (data) {
			removePhotoIncoming(socket, data, function (err) {
				socket.emit('removePhotoIncCallback', {error: !!err});
			});
		});

		socket.on('approvePhoto', function (data) {
			if (hs.session.user && hs.session.user.role > 4) {
				approvePhoto(hs.session.user, data, function (resultData) {
					socket.emit('approvePhotoResult', resultData);
				});
			} else {
				socket.emit('approvePhotoResult', {message: msg.deny, error: true});
			}
		});

		socket.on('disablePhoto', function (data) {
			activateDeactivate(socket, data, function (resultData) {
				socket.emit('disablePhotoResult', resultData);
			});
		});

		socket.on('givePhoto', function (data) {
			givePhoto(socket, data, function (resultData) {
				socket.emit('takePhoto', resultData);
			});
		});

		socket.on('givePhotosPublicIndex', function () {
			if (hs.session.user) {
				givePhotosPublic(hs.session.user, {skip: 0, limit: 29}, function (resultData) {
					socket.emit('takePhotosPublicIndex', resultData);
				});
			} else {
				givePhotosPublicIndex(function (err, photos) {
					socket.emit('takePhotosPublicIndex', err ? {message: err.message, error: true} : {photos: photos});
				});
			}
		});

		socket.on('givePhotosPublicNoGeoIndex', function () {
			if (hs.session.user) {
				givePhotosPublic(hs.session.user, {skip: 0, limit: 29, filter: {nogeo: true}}, function (resultData) {
					socket.emit('takePhotosPublicNoGeoIndex', resultData);
				});
			} else {
				givePhotosPublicNoGeoIndex(function (err, photos) {
					socket.emit('takePhotosPublicNoGeoIndex', err ? {message: err.message, error: true} : {photos: photos});
				});
			}
		});

		socket.on('givePhotosPublic', function (data) {
			givePhotosPublic(hs.session.user, data, function (resultData) {
				socket.emit('takePhotosPublic', resultData);
			});
		});

		socket.on('givePhotosForApprove', function (data) {
			givePhotosForApprove(hs.session.user, data, function (err, photos) {
				socket.emit('takePhotosForApprove', err ? {message: err.message, error: true} : {photos: photos});
			});
		});

		socket.on('giveUserPhotos', function (data) {
			giveUserPhotos(hs.session.user, data, function (resultData) {
				socket.emit('takeUserPhotos', resultData);
			});
		});

		socket.on('giveUserPhotosAround', function (data) {
			giveUserPhotosAround(socket, data, function (resultData) {
				socket.emit('takeUserPhotosAround', resultData);
			});
		});

		socket.on('giveUserPhotosPrivate', function (data) {
			giveUserPhotosPrivate(socket, data, function (resultData) {
				socket.emit('takeUserPhotosPrivate', resultData);
			});
		});

		socket.on('givePhotosFresh', function (data) {
			givePhotosFresh(socket, data, function (resultData) {
				socket.emit('takePhotosFresh', resultData);
			});
		});

		socket.on('giveNearestPhotos', function (data) {
			giveNearestPhotos(data, function (err, photos) {
				socket.emit('takeNearestPhotos', err ? {message: err.message, error: true} : {photos: photos || []});
			});
		});

		socket.on('giveCanPhoto', function (data) {
			giveCanPhoto(socket, data, function (resultData) {
				socket.emit('takeCanPhoto', resultData);
			});
		});

		socket.on('savePhoto', function (data) {
			savePhoto(socket, data, function (resultData) {
				socket.emit('savePhotoResult', resultData);
			});
		});

		socket.on('readyPhoto', function (data) {
			readyPhoto(socket, data, function (resultData) {
				socket.emit('readyPhotoResult', resultData);
			});
		});

		socket.on('getBounds', function (data) {
			getBounds(data, function (resultData) {
				socket.emit('getBoundsResult', resultData);
			});
		});

		socket.on('convertPhotos', function (data) {
			convertPhotos(socket, data, function (resultData) {
				socket.emit('convertPhotosResult', resultData);
			});
		});

		socket.on('convertPhotosAll', function (data) {
			convertPhotosAll(socket, data, function (resultData) {
				socket.emit('convertPhotosAllResult', resultData);
			});
		});
	});
};
module.exports.findPhoto = findPhoto;
module.exports.buildPhotosQuery = buildPhotosQuery;