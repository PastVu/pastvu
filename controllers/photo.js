'use strict';

var _session = require('./_session.js'),
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
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	logger,
	incomeDir = global.appVar.storePath + 'incoming/',
	privateDir = global.appVar.storePath + 'private/photos/',
	publicDir = global.appVar.storePath + 'public/photos/',
	imageFolders = ['x/', 's/', 'q/', 'm/', 'h/', 'd/', 'a/'],

	maxRegionLevel = global.appVar.maxRegionLevel,

	msg = {
		deny: 'You do not have permission for this action',
		noUser: 'Запрашиваемый пользователь не существует',
		notExists: 'Запрашиваемая фотография не существует',
		notExistsRegion: 'Such region does not exist',
		anotherStatus: 'Фотография уже в другом статусе, обновите страницу',
		mustCoord: 'Фотография должна иметь координату или быть привязана к региону вручную'
	},

	shift10y = ms('10y'),
	compactFields = {_id: 0, cid: 1, file: 1, s: 1, ldate: 1, adate: 1, sdate: 1, title: 1, year: 1, ccount: 1, conv: 1, convqueue: 1, ready: 1},
	compactFieldsId = {_id: 1, cid: 1, file: 1, s: 1, ldate: 1, adate: 1, sdate: 1, title: 1, year: 1, ccount: 1, conv: 1, convqueue: 1, ready: 1},
	compactFieldsWithRegions = _.assign({geo: 1}, compactFields, regionController.regionsAllSelectHash),
	compactFieldsIdWithRegions = _.assign({geo: 1}, compactFieldsId, regionController.regionsAllSelectHash),
	permissions = {
		//Определяет может ли модерировать фотографию пользователь
		//Если да, то в случае регионального модератора вернёт номер региона,
		//в случае, глобального модератора и админа - true
		canModerate: function (photo, usObj) {
			var rhash,
				photoRegion,
				i;

			if (usObj.isModerator) {
				//Если у пользователя роль модератора регионов, смотрим его регионы
				if (!usObj.user.mod_regions || !usObj.user.mod_regions.length) {
					return true; //Глобальные модераторы могут модерировать всё
				}

				//Если фотография принадлежит одному из модерируемых регионов, значит пользователь может её модерировать
				rhash = usObj.mod_rhash;
				for (i = 0; i <= maxRegionLevel; i++) {
					photoRegion = photo['r' + i];
					if (photoRegion && rhash[photoRegion] !== undefined) {
						return photoRegion;
					}
				}
			} else if (usObj.isAdmin) {
				//Если пользователь админ - то может
				return true;
			}
			return false;
		},
		getCan: function (photo, usObj) {
			var can = {
					edit: false,
					disable: false,
					remove: false,
					restore: false,
					approve: false,
					convert: false
				},
				ownPhoto,
				canModerate;

			if (usObj.registered) {
				ownPhoto = photo.user && photo.user.equals(usObj.user._id);
				canModerate = permissions.canModerate(photo, usObj);

				can.edit = canModerate || ownPhoto;
				can.remove = canModerate || photo.s < 2 && ownPhoto; //Пока фото новое, её может удалить и владелец
				can.restore = usObj.isAdmin; //Восстанавливать может только администратор
				if (canModerate) {
					can.disable = true;
					if (photo.s < 2) {
						can.approve = true;
					}
					if (usObj.isAdmin) {
						can.convert = true;
					}
				}
			}
			return can;
		},
		canSee: function (photo, usObj) {
			if (photo.s === 5) {
				return true;
			} else if (usObj.registered && photo.user) {
				if (photo.s === 9) {
					return usObj.isAdmin;
				} else {
					return photo.user.equals(usObj.user._id) || permissions.canModerate(photo, usObj);
				}
			}

			return false;
		}
	};

var core = {
	maxNewPhotosLimit: 1e4,
	getNewPhotosLimit: (function () {
		return function (user) {
			var canCreate = 0;

			if (user.rules && _.isNumber(user.rules.photoNewLimit)) {
				canCreate = Math.max(0, Math.min(user.rules.photoNewLimit, core.maxNewPhotosLimit) - user.pfcount);
			} else if (user.ranks && (~user.ranks.indexOf('mec_silv') || ~user.ranks.indexOf('mec_gold'))) {
				canCreate = core.maxNewPhotosLimit - user.pfcount; //Серебряный и золотой меценаты имеют максимально возможный лимит
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
			return canCreate;
		};
	}()),
	givePhoto: function (iAm, data, cb) {
		var cid = data.cid,
			defaultNoSelect = {sign: 0},
			fieldNoSelect = {};

		if (data.noselect !== undefined) {
			_.assign(fieldNoSelect, data.noselect);
		}
		_.defaults(fieldNoSelect, defaultNoSelect);
		if (fieldNoSelect.frags === undefined) {
			fieldNoSelect['frags._id'] = 0;
		}

		//Инкрементируем кол-во просмотров только у публичных фото
		//TODO: Сделать инкрементацию только у публичных!
		Photo.findOneAndUpdate({cid: cid}, {$inc: {vdcount: 1, vwcount: 1, vcount: 1}}, {new: true, select: fieldNoSelect}, function (err, photo) {
			if (err) {
				return cb(err);
			}

			if (!photo || !permissions.canSee(photo, iAm)) {
				return cb({message: msg.notExists});
			} else {
				var can;

				if (iAm.registered) {
					//Права надо проверять до популяции пользователя
					can = permissions.getCan(photo, iAm);
				}

				step(
					function () {
						var userObj = _session.getOnline(null, photo.user),
							paralellUser = this.parallel(),
							regionFields = {_id: 0, cid: 1, title_en: 1, title_local: 1};

						if (userObj) {
							photo = photo.toObject();
							photo.user = {
								login: userObj.user.login, avatar: userObj.user.avatar, disp: userObj.user.disp, ranks: userObj.user.ranks || [], sex: userObj.user.sex, online: true
							};
							paralellUser(null, photo);
						} else {
							photo.populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, disp: 1, ranks: 1, sex: 1}}, function (err, photo) {
								paralellUser(err, photo && photo.toObject());
							});
						}
						//Если у фото нет координаты, берем домашнее положение региона
						if (!photo.geo) {
							regionFields.center = 1;
							regionFields.bbox = 1;
							regionFields.bboxhome = 1;
						}
						regionController.getObjRegionList(photo, regionFields, this.parallel());

						if (iAm.registered) {
							UserSubscr.findOne({obj: photo._id, user: iAm.user._id}, {_id: 0}, this.parallel());
						}
					},
					function (err, photo, regions, subscr) {
						if (err) {
							return cb(err);
						}
						var i = 0,
							frags,
							frag;

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

						if (subscr) {
							photo.subscr = true;
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

						if (!iAm.registered || !photo.ccount) {
							delete photo._id;
							cb(null, photo, can);
						} else {
							commentController.getNewCommentsCount([photo._id], iAm.user._id, null, function (err, countsHash) {
								if (err) {
									return cb(err);
								}
								if (countsHash[photo._id]) {
									photo.ccount_new = countsHash[photo._id];
								}
								delete photo._id;
								cb(null, photo, can);
							});
						}
					}
				);
			}
		});
	},
	getBounds: function (data, cb) {
		var year = false;

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
						return cb(err);
					}
					var i = arguments.length;
					while (i > 1) {
						arguments[--i].toArray(this.parallel());
					}
				},
				function (err, photos) {
					if (err) {
						return cb(err);
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
				return cb(err);
			}

			// Реверсируем geo
			for (var i = photos.length; i--;) {
				photos[i].geo.reverse();
			}
			cb(null, photos, clusters);
		}
	},

	giveNearestPhotos: function (data, cb) {
		var query = {geo: {$near: data.geo}, s: 5};
        var options = {lean: true};

		if (typeof data.except === 'number' && data.except > 0) {
			query.cid = {$ne: data.except};
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

		Photo.find(query, compactFields, options, cb);
	}
};

function giveNewPhotosLimit(iAm, data, cb) {
	if (!iAm.registered || iAm.user.login !== data.login && !iAm.isAdmin) {
		return cb({message: msg.deny, error: true});
	}
	step(
		function () {
			if (iAm.user.login === data.login) {
				this(null, iAm.user);
			} else {
				var userObj = _session.getOnline(data.login);
				if (userObj) {
					this(null, userObj.user);
				} else {
					User.findOne({login: data.login}, this);
				}
			}
		},
		function (err, user) {
			if (err || !user) {
				return cb({message: err && err.message || msg.noUser, error: true});
			}
			cb(core.getNewPhotosLimit(user));
		}
	);
}

/**
 * Создает фотографии в базе данных
 * @param socket Сессия пользователя
 * @param data Объект или массив фотографий
 * @param cb Коллбэк
 */
//var dirs = ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'];
function createPhotos(socket, data, cb) {
	var iAm = socket.handshake.usObj;
	if (!iAm.registered) {
		return cb({message: msg.deny, error: true});
	}
	if (!data || (!Array.isArray(data) && !Utils.isType('object', data))) {
		return cb({message: 'Bad params', error: true});
	}

	if (!Array.isArray(data) && Utils.isType('object', data)) {
		data = [data];
	}

	var result = [],
		canCreate = core.getNewPhotosLimit(iAm.user);

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

				result.push({cid: photo.cid});
				photo.save(this.parallel());
			}
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			iAm.user.pfcount = iAm.user.pfcount + data.length;
			_session.saveEmitUser(iAm, socket, this);
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
			var userObj = _session.getOnline(null, photo.user);
			if (userObj) {
				userObj.user.pcount = userObj.user.pcount + (makePublic ? 1 : -1);
				_session.saveEmitUser(userObj);
			} else {
				User.update({_id: photo.user}, {$inc: {pcount: makePublic ? 1 : -1}}, this.parallel());
			}

			//Если у фото есть координаты, значит надо провести действие с картой
			if (Utils.geo.check(photo.geo)) {
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
			PhotoCluster.clusterPhoto(photo, geoPhotoOld, yearPhotoOld, this.parallel()); //Отправляем на кластеризацию
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
						year2: photo.year2 || photo.year
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
function removePhotoIncoming(iAm, data, cb) {
	if (!iAm.registered) {
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
	var iAm = socket.handshake.usObj;

	if (!iAm.registered) {
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

		if (!permissions.getCan(photo, iAm).remove) {
			return cb({message: msg.deny, error: true});
		}

		if (photo.s === 0 || photo.s === 1) {
			//Неподтвержденную фотографию удаляем безвозвратно
			photo.remove(function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}

				var userObj = _session.getOnline(null, photo.user);

				//Пересчитывам кол-во новых фото у владельца
				if (userObj) {
					userObj.user.pfcount = userObj.user.pfcount - 1;
					_session.saveEmitUser(userObj);
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

/**
 * Восстановление фотографии
 * @param socket Сокет пользователя
 * @param cid
 * @param cb Коллбэк
 */
function restorePhoto(socket, cid, cb) {
	var iAm = socket.handshake.usObj;

	if (!iAm.isAdmin) {
		return cb({message: msg.deny, error: true});
	}
	cid = Number(cid);
	if (!cid) {
		return cb({message: 'Bad params', error: true});
	}

	findPhoto({cid: cid, s: 9}, {}, iAm, function (err, photo) {
		if (err || !photo) {
			return cb({message: err && err.message || (msg.notExists + ' в удалёном статусе'), error: true});
		}

		if (!permissions.getCan(photo, iAm).restore) {
			return cb({message: msg.deny, error: true});
		}

		photo.s = 5;
		photo.save(function (err, photoSaved) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			step(
				function () {
					changePublicPhotoExternality(socket, photoSaved, iAm, true, this.parallel());
				},
				function (err) {
					if (err) {
						return cb({message: 'Restore ok, but: ' + (err && err.message || 'other changes error'), error: true});
					}
					cb({message: 'ok'});
				}
			);
		});
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
		if (!photo.r0) {
			return cb({message: msg.mustCoord, error: true});
		}

		photo.s = 5;
		photo.adate = photo.sdate = new Date();
		photo.save(function (err, photoSaved) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({message: 'Photo approved successfully'});

			if (Utils.geo.check(photoSaved.geo)) {
				photoToMap(photoSaved);
			}

			//Обновляем количество у автора фотографии
			var userObj = _session.getOnline(null, photoSaved.user);
			if (userObj) {
				userObj.user.pcount = userObj.user.pcount + 1;
				userObj.user.pfcount = userObj.user.pfcount - 1;
				_session.saveEmitUser(userObj);
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
	var iAm = socket.handshake.usObj;
	if (!iAm.registered || iAm.user.role < 5) {
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

			changePublicPhotoExternality(socket, photoSaved, iAm, !makeDisabled, function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}
				cb({s: photoSaved.s});
			});
		});
	});
}

//Отдаем фотографию для её страницы
function givePhoto(iAm, data, cb) {
	if (!data || !Number(data.cid)) {
		return cb({message: msg.notExists, error: true});
	}
	data.cid = Number(data.cid);

	core.givePhoto(iAm, data, function (err, photo, can) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb({photo: photo, can: can});
	});
}

//Отдаем последние публичные фотографии на главной
var givePhotosPublicIndex = (function () {
	var options = {skip: 0, limit: 30},
		filter = {s: [5]};

	return function (iAm, cb) {
		//Всегда выбираем заново, т.к. могут быть региональные фильтры
		givePhotos(iAm, filter, options, null, cb);
	};
}());

//Отдаем последние публичные "Где это?" фотографии для главной
var givePhotosPublicNoGeoIndex = (function () {
	var options = {skip: 0, limit: 30},
		filter = {geo: ['0'], s: [5]};

	return function (iAm, cb) {
		//Выбираем заново, т.к. могут быть региональные фильтры
		givePhotos(iAm, filter, options, null, cb);
	};
}());

var filterProps = {geo: [], r: [], rp: [], s: []},
	delimeterParam = '_',
	delimeterVal = '!';
function parseFilter(filterString) {
	var filterParams = filterString && filterString.split(delimeterParam),
		filterParam,
		filterVal,
		filterValItem,
		dividerIndex,
		result = {},
		i, j;

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

/**
 * Отдаем полную галерею с учетом прав и фильтров в компактном виде
 * @param iAm Объект пользователя
 * @param filter Объект фильтра (распарсенный)
 * @param data Объект параметров, включая стринг фильтра
 * @param user_id _id пользователя, если хотим галерею только для него получить
 * @param cb
 */
function givePhotos(iAm, filter, data, user_id, cb) {
	var skip = Math.abs(Number(data.skip)) || 0,
		limit = Math.min(data.limit || 40, 100),
		buildQueryResult,
		query;

	buildQueryResult = buildPhotosQuery(filter, user_id, iAm);
	query = buildQueryResult.query;

	if (query) {
		if (filter.geo) {
			if (filter.geo[0] === '0') {
				query.geo = null;
			}
			if (filter.geo[0] === '1') {
				query.geo = {$size: 2};
			}
		}
		if (user_id) {
			query.user = user_id;
		}

		//console.log(query);
		step(
			function () {
				var fieldsSelect = iAm.registered ? compactFieldsIdWithRegions : compactFieldsWithRegions; //Для подсчета новых комментариев нужны _id

				Photo.find(query, fieldsSelect, {lean: true, skip: skip, limit: limit, sort: {sdate: -1}}, this.parallel());
				Photo.count(query, this.parallel());
			},
			function finishOrNewCommentsCount(err, photos, count) {
				if (err || !photos) {
					return cb({message: err && err.message || 'Photos does not exist', error: true});
				}
				var shortRegionsParams, shortRegionsHash;

				if (photos.length) {
					//Заполняем для каждой фотографии краткие регионы и хэш этих регионов
					shortRegionsParams = regionController.getShortRegionsParams(buildQueryResult.rhash);
					shortRegionsHash = regionController.genObjsShortRegionsArr(photos, shortRegionsParams.lvls, true);
				}

				if (!iAm.registered || !photos.length) {
					//Если аноним или фотографий нет, сразу возвращаем
					finish(null, photos);
				} else {
					//Если пользователь залогинен, заполняем кол-во новых комментариев для каждого объекта
					commentController.fillNewCommentsCount(photos, iAm.user._id, null, finish);
				}

				function finish(err, photos) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					if (iAm.registered) {
						for (var i = photos.length; i--;) {
							delete photos[i]._id;
						}
					}
					cb({photos: photos, filter: {r: buildQueryResult.rarr, rp: filter.rp, s: buildQueryResult.s, geo: filter.geo}, rhash: shortRegionsHash, count: count, skip: skip});
				}
			}
		);
	} else {
		cb({photos: [], filter: {r: buildQueryResult.rarr, rp: filter.rp, s: buildQueryResult.s, geo: filter.geo}, count: 0, skip: skip});
	}
}

//Отдаем общую галерею
function givePhotosPS(iAm, data, cb) {
	if (!_.isObject(data)) {
		return cb({message: 'Bad params', error: true});
	}

	var filter = data.filter ? parseFilter(data.filter) : {};
	if (!filter.s) {
		filter.s = [5];
	}

	givePhotos(iAm, filter, data, null, cb);
}
//Отдаем галерею пользователя
function giveUserPhotos(iAm, data, cb) {
	if (!Utils.isType('object', data) || !data.login) {
		return cb({message: 'Bad params', error: true});
	}

	User.getUserID(data.login, function (err, user_id) {
		if (err || !user_id) {
			return cb({message: err && err.message || 'Such user does not exist', error: true});
		}
		var filter = data.filter ? parseFilter(data.filter) : {};
		//Если фильтр по регионам не установлен, это чужая галерея, есть свои регионы
		//и стоит настройка не фильтровать по ним галереи пользователя, то задаем весь мир
		if (filter.r === undefined && iAm.registered && iAm.user.login !== data.login && iAm.user.regions && iAm.user.regions.length && iAm.user.settings && !iAm.user.settings.r_f_user_gal) {
			filter.r = 0;
		}
		givePhotos(iAm, filter, data, user_id, cb);
	});
}

//Отдаем последние фотографии, ожидающие подтверждения
function givePhotosForApprove(iAm, data, cb) {
	var query = {s: 1};

	if (!iAm.registered || iAm.user.role < 5) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}
	if (iAm.isModerator) {
		_.assign(query, iAm.mod_rquery);
	}

	Photo.find(query, compactFieldsWithRegions, {lean: true, sort: {sdate: -1}, skip: data.skip || 0, limit: Math.min(data.limit || 20, 100)}, function (err, photos) {
		if (err || !photos) {
			return cb({message: err && err.message || 'No photos', error: true});
		}
		var shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm.mod_rshortlvls, true);

		cb({photos: photos, rhash: shortRegionsHash});
	});
}

//Берем массив до и после указанной фотографии пользователя указанной длины
function giveUserPhotosAround(iAm, data, cb) {
	var cid = Number(data && data.cid),
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
				var filter = iAm.registered && iAm.user.settings && !iAm.user.settings.r_f_photo_user_gal ? {r: 0} : {},
					query = buildPhotosQuery(filter, photo.user, iAm).query;
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
	if (!data || !Utils.geo.checkLatLng(data.geo)) {
		return cb({message: 'Bad params', error: true});
	}
	data.limit = Number(data.limit);
	data.geo.reverse();

	core.giveNearestPhotos(data, function (err, photos) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb({photos: photos || []});
	});
}

//Отдаем непубличные фотографии
function giveUserPhotosPrivate(iAm, data, cb) {
	if (!iAm.registered || (iAm.user.role < 5 && iAm.user.login !== data.login)) {
		return cb({message: msg.deny, error: true});
	}

	User.getUserID(data.login, function (err, userid) {
		if (err) {
			return cb({message: err && err.message, error: true});
		}
		var query = {user: userid};

		if (iAm.isModerator) {
			query.s = {$ne: 9};
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

		Photo.find(query, compactFields, {lean: true, sort: {sdate: -1}}, function (err, photos) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}

			cb({photos: photos});
		});
	});
}

//Отдаем новые фотографии
function givePhotosFresh(iAm, data, cb) {
	if (!iAm.registered ||
		(!data.login && iAm.user.role < 5) ||
		(data.login && iAm.user.role < 5 && iAm.user.login !== data.login)) {
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
			var query = {s: 0},
				asModerator = iAm.user.login !== data.login && iAm.isModerator;

			if (asModerator) {
				_.assign(query, iAm.mod_rquery);
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
				var shortRegionsHash = regionController.genObjsShortRegionsArr(photos || [], asModerator ? iAm.mod_rshortlvls : iAm.rshortlvls, true);
				cb({photos: photos || [], rhash: shortRegionsHash});
			});
		}
	);
}

//Отдаем разрешенные can для фото
function giveCanPhoto(iAm, data, cb) {
	var cid = Number(data.cid);

	if (isNaN(cid)) {
		return cb({message: msg.notExists, error: true});
	}
	if (iAm.registered) {
		Photo.findOne({cid: cid}, {_id: 0, user: 1}, function (err, photo) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({can: permissions.getCan(photo, iAm)});
		});
	} else {
		cb({});
	}
}

//Сохраняем информацию о фотографии
function savePhoto(iAm, data, cb) {
	var cid = Number(data.cid),
		photoOldObj,
		newValues,
		oldGeo,
		newGeo,
		geoToNull,
		sendingBack = {};

	if (!iAm.registered) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}

	findPhoto({cid: cid}, {frags: 0}, iAm, function (err, photo) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		if (!photo) {
			return cb({message: msg.notExists, error: true});
		}
		if (!permissions.getCan(photo, iAm).edit) {
			return cb({message: msg.deny, error: true});
		}

		photoOldObj = photo.toObject();

		//Сразу парсим нужные поля, чтобы далее сравнить их с существующим распарсеным значением
		if (data.desc) {
			data.desc = Utils.inputIncomingParse(data.desc).result;
		}
		if (data.source) {
			data.source = Utils.inputIncomingParse(data.source).result;
		}
		if (data.author) {
			data.author = Utils.inputIncomingParse(data.author).result;
		}
		if (data.geo) {
			if (Utils.geo.checkLatLng(data.geo)) {
				data.geo = Utils.geo.geoToPrecisionRound(data.geo.reverse());
			} else {
				delete data.geo;
			}
		}

		//Новые значения действительно изменяемых свойств
		newValues = Utils.diff(_.pick(data, 'geo', 'region', 'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author'), photoOldObj);
		if (_.isEmpty(newValues)) {
			return cb({message: 'Nothing to save'});
		}

		if (newValues.geo === null) {
			//Обнуляем координату
			geoToNull = true;
			newValues.geo = undefined; //Удаляем координату
		}
		if (newValues.desc !== undefined) {
			sendingBack.desc = newValues.desc;
		}
		if (newValues.source !== undefined) {
			sendingBack.source = newValues.source;
		}
		if (newValues.author !== undefined) {
			sendingBack.author = newValues.author;
		}

		oldGeo = photoOldObj.geo;
		newGeo = newValues.geo;

		//Если координата обнулилась или её нет, то должны присвоить регион
		if (geoToNull || _.isEmpty(oldGeo) && !newGeo) {
			if (Number(newValues.region)) {
				sendingBack.regions = regionController.setObjRegionsByRegionCid(photo, Number(newValues.region), ['cid', 'parents', 'title_en', 'title_local']);
				//Если вернулся false, значит переданного региона не существует
				if (!sendingBack.regions) {
					return cb({message: msg.notExistsRegion, error: true});
				}
			} else {
				//Не иметь ни координаты ни региона могут только новые фотографии
				if (photo.s !== 0) {
					return cb({message: msg.mustCoord, error: true});
				}
				regionController.clearObjRegions(photo); //Очищаем привязку к регионам
				sendingBack.regions = [];
			}
		}

		if (geoToNull && photo.s === 5) {
			//При обнулении координаты
			//Если фото публичное, значит оно было на карте. Удаляем с карты.
			//Мы должны удалить с карты до удаления координаты, так как декластеризация смотрит на неё
			photoFromMap(photo, save);
		} else if (newGeo) {
			//Если координата добавилась/изменилась, запрашиваем новые регионы фотографии
			regionController.setObjRegionsByGeo(photo, newGeo, {_id: 0, cid: 1, parents: 1, title_en: 1, title_local: 1}, function (err, regionsArr) {
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

					//Если это опубликованная фотография (не обязательно публичная) и изменились регионы, устанавливаем их комментариям
					if (photoSaved.s >= 5 && sendingBack.regions) {
						var commentAdditionUpdate = {};
						if (geoToNull) {
							commentAdditionUpdate.$unset = {geo: 1};
						} else if (newGeo) {
							commentAdditionUpdate.$set = {geo: newGeo};
						}
						regionController.updateObjsRegions(Comment, {obj: photoSaved._id}, sendingBack.regions, commentAdditionUpdate);
					}
					cb({message: 'Photo saved successfully', saved: true, data: sendingBack});
				}
			});
		}
	});
}

//Говорим, что фото готово к премодерации и публикации
function readyPhoto(iAm, data, cb) {
	var cid = Number(data);

	if (!iAm.registered) {
		return cb({message: msg.deny, error: true});
	}
	if (!cid) {
		return cb({message: msg.notExists, error: true});
	}
	Photo.findOne({cid: cid}, function (err, photo) {
		if (err || !photo) {
			return cb({message: err && err.message || msg.notExists, error: true});
		}
		if (photo.s !== 0) {
			return cb({message: msg.anotherStatus, error: true});
		}
		if (!permissions.getCan(photo, iAm).edit) {
			return cb({message: msg.deny, error: true});
		}
		if (!photo.r0) {
			return cb({message: msg.mustCoord, error: true});
		}

		if (iAm.user.ranks && iAm.user.ranks.indexOf('mec_gold') > -1) {
			//Если пользователь - золотой меценат, значит он сразу публикует фото, если таких действий еще менее 100
			UserSelfPublishedPhotos.find({user: iAm.user._id}, {_id: 0, photos: 1}, {lean: true}, function (err, obj) {
				if (obj && obj.photos && obj.photos.length >= 100) {
					justSetReady();
				} else {
					approvePhoto(iAm, cid, function (result) {
						if (result.error) {
							return cb(result);
						}
						cb({message: 'Ok', published: true});
						UserSelfPublishedPhotos.update({user: iAm.user._id}, {$push: {photos: photo._id}}, {upsert: true}).exec();
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
	});
}

//Фотографии и кластеры по границам
//{z: Масштаб, bounds: [[]]}
function getBounds(data, cb) {
	if (!_.isObject(data) || !Array.isArray(data.bounds) || !data.z) {
		cb({message: 'Bad params', error: true});
		return;
	}
	// Реверсируем geo границы баунда
	for (var i = data.bounds.length; i--;) {
		data.bounds[i][0].reverse();
		data.bounds[i][1].reverse();
	}

	core.getBounds(data, function (err, photos, clusters) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb({photos: photos, clusters: clusters, startAt: data.startAt, z: data.z});
	});
}

//Отправляет выбранные фото на конвертацию
function convertPhotos(iAm, data, cb) {
	var cids = [],
		i;

	if (!iAm.isAdmin) {
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
function convertPhotosAll(iAm, data, cb) {
	if (!iAm.isAdmin) {
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
 * @param fieldSelect Выбор полей (обязательно должны присутствовать user, s, r0-rmaxRegionLevel)
 * @param usObj Объект пользователя
 * @param cb
 */
function findPhoto(query, fieldSelect, usObj, cb) {
	if (!usObj.registered) {
		query.s = 5; //Анонимам ищем только публичные
	}
	Photo.findOne(query, fieldSelect, function (err, photo) {
		if (err) {
			return cb(err);
		}
		if (photo && permissions.canSee(photo, usObj)) {
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
		squery_public_only = !iAm.registered || filter.s && filter.s.length === 1 && filter.s[0] === 5,

		region,
		contained,
		result = {query: null, s: [], rcids: [], rarr: []},

		someVar,
		i,
		j;

	if (!squery_public_only && filter.s && filter.s.length) {
		//Если есть публичный, убираем, так как непубличный squery будет использован только в rquery_mod
		filter.s = _.without(filter.s, 5, !iAm.isAdmin ? 9 : undefined);
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
		query_pub.s = 5;
		if (rquery_pub) {
			_.assign(query_pub, rquery_pub);
		}
		result.s.push(5);
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
				filter.s.push(5);
			}
			if (filter.s.length === 1) {
				query_mod.s = filter.s[0];
			} else {
				query_mod.s = {$in: filter.s};
			}
			Array.prototype.push.apply(result.s, filter.s);
		} else if (!iAm.isAdmin) {
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
		var setQuery = {vdcount: 0},
			needWeek = moment().utc().day() === 1; //Начало недели - понедельник

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
		setTimeout(resetStat, moment().utc().add('d', 1).startOf('day').diff(moment().utc()) + 2000);
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
			removePhotoIncoming(hs.usObj, data, function (err) {
				socket.emit('removePhotoIncCallback', {error: !!err});
			});
		});
		socket.on('restorePhoto', function (data) {
			restorePhoto(socket, data, function (resultData) {
				socket.emit('restorePhotoCallback', resultData);
			});
		});

		socket.on('approvePhoto', function (data) {
			if (hs.usObj && hs.usObj.user.role > 4) {
				approvePhoto(hs.usObj, data, function (resultData) {
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
			givePhoto(hs.usObj, data, function (resultData) {
				socket.emit('takePhoto', resultData);
			});
		});

		socket.on('givePhotosPublicIndex', function () {
			givePhotosPublicIndex(hs.usObj, function (resultData) {
				socket.emit('takePhotosPublicIndex', resultData);
			});
		});

		socket.on('givePhotosPublicNoGeoIndex', function () {
			givePhotosPublicNoGeoIndex(hs.usObj, function (resultData) {
				socket.emit('takePhotosPublicNoGeoIndex', resultData);
			});
		});

		socket.on('givePhotos', function (data) {
			givePhotosPS(hs.usObj, data, function (resultData) {
				socket.emit('takePhotos', resultData);
			});
		});

		socket.on('giveUserPhotos', function (data) {
			giveUserPhotos(hs.usObj, data, function (resultData) {
				socket.emit('takeUserPhotos', resultData);
			});
		});

		socket.on('givePhotosForApprove', function (data) {
			givePhotosForApprove(hs.usObj, data, function (resultData) {
				socket.emit('takePhotosForApprove', resultData);
			});
		});

		socket.on('giveUserPhotosAround', function (data) {
			giveUserPhotosAround(hs.usObj, data, function (resultData) {
				socket.emit('takeUserPhotosAround', resultData);
			});
		});

		socket.on('giveUserPhotosPrivate', function (data) {
			giveUserPhotosPrivate(hs.usObj, data, function (resultData) {
				socket.emit('takeUserPhotosPrivate', resultData);
			});
		});

		socket.on('givePhotosFresh', function (data) {
			givePhotosFresh(hs.usObj, data, function (resultData) {
				socket.emit('takePhotosFresh', resultData);
			});
		});

		socket.on('giveNearestPhotos', function (data) {
			giveNearestPhotos(data, function (resultData) {
				socket.emit('takeNearestPhotos', resultData);
			});
		});

		socket.on('giveCanPhoto', function (data) {
			giveCanPhoto(hs.usObj, data, function (resultData) {
				socket.emit('takeCanPhoto', resultData);
			});
		});

		socket.on('savePhoto', function (data) {
			savePhoto(hs.usObj, data, function (resultData) {
				socket.emit('savePhotoResult', resultData);
			});
		});

		socket.on('readyPhoto', function (data) {
			readyPhoto(hs.usObj, data, function (resultData) {
				socket.emit('readyPhotoResult', resultData);
			});
		});

		socket.on('getBounds', function (data) {
			getBounds(data, function (resultData) {
				socket.emit('getBoundsResult', resultData);
			});
		});

		socket.on('convertPhotos', function (data) {
			convertPhotos(hs.usObj, data, function (resultData) {
				socket.emit('convertPhotosResult', resultData);
			});
		});

		socket.on('convertPhotosAll', function (data) {
			convertPhotosAll(hs.usObj, data, function (resultData) {
				socket.emit('convertPhotosAllResult', resultData);
			});
		});

		socket.on('giveNewPhotosLimit', function (data) {
			giveNewPhotosLimit(hs.usObj, data, function (resultData) {
				socket.emit('takeNewPhotosLimit', resultData);
			});
		});
	});
};
module.exports.findPhoto = findPhoto;
module.exports.permissions = permissions;
module.exports.buildPhotosQuery = buildPhotosQuery;


module.exports.core = core;