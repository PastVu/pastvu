'use strict';

var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	Counter,
	PhotoCluster = require('./photoCluster.js'),
	PhotoConverter = require('./photoConverter.js'),
	_ = require('lodash'),
	fs = require('fs'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	logger,
	photoDir = process.cwd() + '/../store/public/photos',
	imageFolders = [photoDir + '/micros/', photoDir + '/micro/', photoDir + '/mini/', photoDir + '/midi/', photoDir + '/thumb/', photoDir + '/standard/', photoDir + '/origin/'];

/**
 * Создает фотографии в базе данных
 * @param session Сессия польщователя
 * @param data Объект или массив фотографий
 * @param cb Коллбэк
 */
var dirs = ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'];
function createPhotos(session, data, cb) {
	if (!session.user || !session.user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	if (!data || (!Array.isArray(data) && !Utils.isType('object', data))) {
		cb({message: 'Bad params', error: true});
		return;
	}

	if (!Array.isArray(data) && Utils.isType('object', data)) {
		data = [data];
	}

	var resultCids = [];

	step(
		function increment() {
			Counter.incrementBy('photo', data.length, this);
		},
		function savePhotos(err, count) {
			if (err || !count) {
				cb({message: 'Increment photo counter error', error: true});
				return;
			}
			data.forEach(function (item, index) {
				var photo = new Photo({
					cid: count.next - index,
					user: session.user._id,
					file: item.file.replace(/((.)(.)(.))/, "$2/$3/$4/$1"),
					type: item.type,
					size: item.size,
					geo: undefined,
					//geo: [_.random(36546649, 38456140) / 1000000, _.random(55465922, 56103812) / 1000000],
					//dir: dirs[_.random(0, dirs.length - 1)],
					fresh: true
				});

				resultCids.push({file: item.file, cid: photo.cid});
				if (data.length > 1) {
					photo.save(this.parallel());
				} else {
					photo.save(this);
				}
			}.bind(this));

		},
		function (err) {
			if (err) {
				cb({message: err.message || '', error: true});
				return;
			}
			cb({message: data.length + ' photo successfully saved ' + data[0].file, cids: resultCids});
		}
	);
}

/**
 * Проставляет фотографии в базе флаг удаления и удаляет ее из конвейера конвертаций
 * @param socket Сокет пользователя
 * @param data
 * @param cb Коллбэк
 */
function removePhoto(socket, data, cb) {
	var user = socket.handshake.session.user,
		query;
	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	if (!data && (!Utils.isType('number', data))) {
		cb({message: 'Bad params', error: true});
		return;
	}

	query = {cid: data, del: {$exists: false}};

	step(
		function () {
			Photo.findOneAndUpdate(query, { $set: { del: true }}, { new: true, upsert: false, select: {cid: 1, user: 1}}, this);
		},
		function (err, photo) {
			if (err || !photo) {
				cb({message: (err && err.message) || 'No such photo for this user', error: true});
				return;
			}
			PhotoConverter.removePhotos([photo.cid]);

			if (photo.user.equals(user._id)) {
				user.pcount = user.pcount - 1;
				user.save();
				auth.sendMe(socket);
			} else {
				User.update({_id: photo.user}, {$inc: {pcount: -1}}).exec();
			}
			cb({message: 'Photo removed'});
		}
	);
}

/**
 * Ококнчательно удаляет фотографии у которых проставлен флаг удаления из базы и с диска
 * @param cb Коллбэк
 */
function dropPhotos(cb) {
	Photo.where('del').equals(true).select('file -_id').find(function (err, photos) {
		var files = _.pluck(photos, 'file');
		if (files.length === 0) {
			return;
		}
		files.forEach(function (file, index) {
			imageFolders.forEach(function (folder) {
				fs.unlink(folder + file);
			});
		});
		Photo.where('file').in(files).remove(function (err, deleteQuantity) {
			if (cb) {
				cb('Removed ' + deleteQuantity + 'photos');
			}
		});
	});
}

/**
 * Ежедневно обнуляет статистику дневных просмотров
 */
function resetStatDay() {
	Photo.resetStatDay(function (err, updatedCount) {
		logger.info('Reset day display statistics for ' + updatedCount + ' photos');
		if (err) {
			logger.error(err);
			return;
		}
		planResetStatDay();
	});
}
function planResetStatDay() {
	setTimeout(resetStatDay, moment().add('d', 1).startOf('day').diff(moment()) + 1000);
}
/**
 * Еженедельно обнуляет статистику недельных просмотров
 */
function resetStatWeek() {
	Photo.resetStatWeek(function (err, updatedCount) {
		logger.info('Reset week display statistics for ' + updatedCount + ' photos');
		if (err) {
			logger.error(err);
			return;
		}
		planResetStatWeek();
	});
}
function planResetStatWeek() {
	setTimeout(resetStatWeek, moment().add('w', 1).day(1).startOf('day').diff(moment()) + 1000);
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("photo.js");

	Settings = db.model('Settings');
	User = db.model('User');
	Photo = db.model('Photo');
	Counter = db.model('Counter');

	PhotoCluster.loadController(app, db, io);
	PhotoConverter.loadController(app, db, io);

	planResetStatDay(); //Планируем очистку статистики за ltym
	planResetStatWeek(); //Планируем очистку статистики за неделю

	// Регулярно проводим чистку удаленных файлов
	setInterval(dropPhotos, ms('5m'));
	dropPhotos();

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('createPhoto', function (data) {
			createPhotos(hs.session, data, function (createData) {
				if (!createData.error) {
					if (!Array.isArray(data) && Utils.isType('object', data)) {
						data = [data];
					}
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
		socket.on('dropPhotos', function (data) {
			dropPhotos(function (msg) {
				socket.emit('dropPhotosResult', {message: msg});
			});
		});


		/**
		 * Подтверждаем фотографию
		 */
		function approvePhotoResult(data) {
			socket.emit('approvePhotoResult', data);
		}

		socket.on('approvePhoto', function (cid) {
			if (!hs.session.user) {
				approvePhotoResult({message: 'Not authorized', error: true});
				return;
			}
			Photo.findOneAndUpdate({cid: cid, fresh: true}, { $unset: {fresh: 1}, $set: {adate: new Date()} }, {select: {user: 1}}, function (err, photo) {
				if (err || !photo) {
					approvePhotoResult({message: err && err.message || 'No photo affected', error: true});
					return;
				}
				approvePhotoResult({message: 'Photo approved successfully'});

				if (photo.user.equals(hs.session.user._id)) {
					hs.session.user.pcount = hs.session.user.pcount + 1;
					hs.session.user.save();
					auth.sendMe(socket);
				} else {
					User.update({_id: photo.user}, {$inc: {pcount: 1}}).exec();
				}
			});
		});

		/**
		 * Активация/деактивация фото
		 */
		function disablePhotoResult(data) {
			socket.emit('disablePhotoResult', data);
		}

		socket.on('disablePhoto', function (cid) {
			if (!hs.session.user) {
				disablePhotoResult({message: 'Not authorized', error: true});
				return;
			}
			if (!cid) {
				disablePhotoResult({message: 'cid is not defined', error: true});
				return;
			}
			Photo.findOne({cid: cid, fresh: {$exists: false}, del: {$exists: false}}).select('user disabled').exec(function (err, photo) {
				if (err) {
					disablePhotoResult({message: err && err.message || 'Change state error', error: true});
					return;
				}
				if (photo.disabled) {
					photo.disabled = undefined;
				} else {
					photo.disabled = true;
				}
				photo.save(function (err, photoSaved) {
					if (err) {
						disablePhotoResult({message: err && err.message || '', error: true});
						return;
					}
					disablePhotoResult({message: 'Photo state saved successfully', disabled: photoSaved.disabled});

					var userPCountDelta = photoSaved.disabled ? -1 : 1;
					if (photoSaved.user.equals(hs.session.user._id)) {
						hs.session.user.pcount = hs.session.user.pcount + userPCountDelta;
						hs.session.user.save();
						auth.sendMe(socket);
					} else {
						User.update({_id: photoSaved.user}, {$inc: {pcount: userPCountDelta}}).exec(); //Для выполнения без коллбэка нужен .exec()
					}
				});
			});
		});

		(function () {
			function result(data) {
				socket.emit('convertPhotosResult', data);
			}

			socket.on('convertPhotos', function (data) {
				if (!hs.session.user) {
					result({message: 'You are not authorized for this action.', error: true});
					return;
				}
				if (!Array.isArray(data) || data.length === 0) {
					result({message: 'Bad params. Need to be array of file names', error: true});
					return;
				}
				PhotoConverter.addPhotos(data, function (addResult) {
					result(addResult);
				});
			});
		}());

		(function () {
			function result(data) {
				socket.emit('convertPhotosAllResult', data);
			}

			socket.on('convertPhotosAll', function (data) {
				if (!hs.session.user) {
					result({message: 'You are not authorized for this action.', error: true});
					return;
				}
				if (!Utils.isType('object', data)) {
					result({message: 'Bad params. Need to be object', error: true});
					return;
				}
				PhotoConverter.addPhotosAll(data, function (addResult) {
					result(addResult);
				});
			});
		}());

		/**
		 * Отдаем фотографии пользователя в компактном виде
		 */
		function takeUserPhotos(data) {
			socket.emit('takeUserPhotos', data);
		}

		socket.on('giveUserPhotos', function (data) {
			User.getUserID(data.login, function (err, user) {
				if (err) {
					takeUserPhotos({message: err && err.message, error: true});
					return;
				}
				var photosFresh,
					skip = data.skip || 0,
					limit = data.limit || 20,
					criteria = {user: user._id, fresh: {$exists: false}, del: {$exists: false}};

				step(
					function () {
						var stepthis = this;
						if (hs.session.user && user._id.equals(hs.session.user._id)) {
							Photo.count({user: user._id, fresh: true, del: {$exists: false}}, function (err, count) {
								if (err) {
									takeUserPhotos({message: err && err.message, error: true});
									return;
								}

								if (skip > count) {
									skip -= count;
									stepthis();
								} else {
									var selectingFreshCount = count - skip;
									limit = Math.max(0, limit - selectingFreshCount);
									Photo.getPhotosFreshCompact({user: user._id, fresh: true, del: {$exists: false}}, {skip: skip}, function (err, pFresh) {
										photosFresh = pFresh;
										stepthis();
									});
									skip = 0;
								}
							});
						} else {
							criteria.disabled = {$exists: false};
							stepthis();
						}
					},
					function () {
						if (limit > 0) {
							Photo.getPhotosCompact(criteria, {skip: skip, limit: limit}, this);
						} else {
							this();
						}
					},
					function (err, photos) {
						if (err) {
							takeUserPhotos({message: err && err.message, error: true});
							return;
						}
						if (!photos) {
							photos = [];
						}
						var result;
						if (photosFresh && photosFresh.length > 0) {
							result = photosFresh.concat(photos);
						} else {
							result = photos;
						}
						takeUserPhotos({photos: result});
						criteria = photosFresh = skip = limit = result = null;
					}
				);
			});
		});


		/**
		 * Отдаем фотографии с ограниченным доступом
		 */
		function takeUserPhotosPrivate(data) {
			socket.emit('takeUserPhotosPrivate', data);
		}

		socket.on('giveUserPhotosPrivate', function (data) {
			User.getUserID(data.login, function (err, user) {
				if (err) {
					takeUserPhotosPrivate({message: err && err.message, error: true});
					return;
				}
				if (!hs.session.user || !user._id.equals(hs.session.user._id)) {
					takeUserPhotosPrivate({message: 'Not authorized', error: true});
					return;
				}

				step(
					function () {
						var filters = {user: user._id, disabled: true, del: {$exists: false}};
						if (data.startTime || data.endTime) {
							filters.adate = {};
							if (data.startTime) {
								filters.adate.$gte = data.startTime;
							}
							if (data.endTime) {
								filters.adate.$lte = data.endTime;
							}
						}
						Photo.getPhotosCompact(filters, {}, this.parallel());
						Photo.getPhotosFreshCompact({user: user._id, fresh: true, del: {$exists: false}}, {}, this.parallel());
						filters = null;
					},
					function (err, disabled, fresh) {
						if (err) {
							takeUserPhotosPrivate({message: err && err.message, error: true});
							return;
						}
						takeUserPhotosPrivate({fresh: fresh || [], disabled: disabled || [], len: fresh.length + disabled.length});
					}
				);
			});
		});

		/**
		 * Отдаем неподтвержденные фотографии
		 */
		function takePhotosFresh(data) {
			socket.emit('takePhotosFresh', data);
		}

		socket.on('givePhotosFresh', function (data) {
			if (!hs.session.user) {
				takePhotosFresh({message: 'Not authorized', error: true});
				return;
			}
			if (!data || !Utils.isType('object', data)) {
				takePhotosFresh({message: 'Bad params', error: true});
				return;
			}
			step(
				function () {
					if (data.login) {
						User.getUserID(data.login, this);
					} else {
						this();
					}
				},
				function (err, user) {
					if (err) {
						takePhotosFresh({message: err && err.message, error: true});
						return;
					}
					var criteria = {disabled: {$exists: false}, del: {$exists: false}},
						options = {};
					if (user) {
						criteria.user = user;
					}
					if (data.after) {
						criteria.ldate = {$gt: data.after};
					}
					if (data.limit) {
						options.limit = data.limit;
					}
					if (data.skip) {
						options.skip = data.skip;
					}
					Photo.getPhotosFreshCompact(criteria, options, this.parallel());
				},
				function (err, photos) {
					if (err) {
						takePhotosFresh({message: err && err.message, error: true});
						return;
					}
					takePhotosFresh({photos: photos || []});
				}
			);
		});


		(function () {
			/**
			 * Новые фотографии
			 */
			function result(data) {
				socket.emit('takePhotosNew', data);
			}

			socket.on('givePhotosNew', function (data) {
				if (!Utils.isType('object', data)) {
					result({message: 'Bad params', error: true});
					return;
				}

				step(
					function () {
						Photo.getPhotosCompact({convqueue: {$exists: false}, fresh: {$exists: false}, disabled: {$exists: false}, del: {$exists: false}}, {skip: 0, limit: data.limit || 20}, function (err, photos) {
							if (err) {
								result({message: err && err.message, error: true});
								return;
							}
							result({photos: photos});
						});
					}
				);

			});
		}());


		/**
		 * Отдаем фотографию
		 */
		function takePhoto(data) {
			socket.emit('takePhoto', data);
		}

		socket.on('givePhoto', function (data) {
			Photo.getPhoto({cid: data.cid}, function (err, photo) {
				if (err) {
					takePhoto({message: err && err.message, error: true});
					return;
				}
				//console.dir(photo);
				takePhoto(photo.toObject());
			});
		});

		/**
		 * Берем массив до и после указанной фотографии указанной длины
		 */
		function takeUserPhotosAround(data) {
			socket.emit('takeUserPhotosAround', data);
		}

		socket.on('giveUserPhotosAround', function (data) {
			if (!data.cid || (!data.limitL && !data.limitR)) {
				takeUserPhotosAround({message: 'Bad params', error: true});
				return;
			}

			step(
				function findUserId() {
					Photo.findOne({cid: data.cid}).select('-_id user').exec(this);
				},
				function findAroundPhotos(err, photo) {
					if (err || !photo || !photo.user) {
						takeUserPhotosAround({message: 'No such photo', error: true});
						return;
					}
					var filters = {user: photo.user, del: {$exists: false}};
					if (!hs.session.user || !photo.user.equals(hs.session.user._id)) {
						filters.fresh = {$exists: false};
						filters.disabled = {$exists: false};
					}
					if (data.limitL > 0) {
						Photo.find(filters).gt('cid', data.cid).sort('adate').limit(data.limitL).select('-_id cid file title year').exec(this.parallel());
					}
					if (data.limitR > 0) {
						Photo.find(filters).lt('cid', data.cid).sort('-adate').limit(data.limitR).select('-_id cid file title year').exec(this.parallel());
					}
					filters = null;
				},
				function (err, photosL, photosR) {
					if (err) {
						takeUserPhotosAround({message: err.message || '', error: true});
						return;
					}
					takeUserPhotosAround({left: photosL, right: photosR});
				}
			);
		});


		(function () {
			/**
			 * Фотографии и кластеры по границам
			 */
			function result(data) {
				socket.emit('getBoundsResult', data);
			}

			socket.on('getBounds', function (data) {
				if (!Utils.isType('object', data) || !Array.isArray(data.bounds) || !data.z) {
					result({message: 'Bad params', error: true});
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
								criteria = {geo: { "$within": {"$box": data.bounds[i]} }};
								if (year) {
									criteria.year = yearCriteria;
								}
								criteria.del = {$exists: false};
								criteria.fresh = {$exists: false};
								criteria.disabled = {$exists: false};
								Photo.collection.find(criteria, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1}, this.parallel());
							}
						},
						function cursors(err) {
							if (err) {
								result({message: err && err.message, error: true});
								return;
							}
							var i = arguments.length;
							while (i > 1) {
								arguments[--i].toArray(this.parallel());
							}
						},
						function (err, photos) {
							if (err) {
								res(err);
								return;
							}
							var result = photos,
								i = arguments.length;

							while (i > 2) {
								result.push.apply(result, arguments[--i]);
							}
							res(err, result);
						}
					);
				}

				function res(err, photos, clusters) {
					if (err) {
						result({message: err && err.message, error: true});
						return;
					}

					// Реверсируем geo
					var i = photos.length;
					while (i--) {
						photos[i].geo.reverse();
					}
					result({photos: photos, clusters: clusters, startAt: data.startAt});
				}
			});
		}());


		(function () {

			function geoCheck(geo) {
				if (!Array.isArray(geo) || geo.length !== 2 || geo[0] < -180 || geo[0] > 180 || geo[1] < -90 || geo[1] > 90) {
					return false;
				}
				return true;
			}

			function diff(a, b) {
				var res = {},
					i;
				for (i in a) {
					if (a[i] !== undefined && !_.isEqual(a[i], b[i])) {
						res[i] = a[i];
					}
				}
				return res;
			}

			/**
			 * Сохраняем информацию о фотографии
			 */
			function result(data) {
				socket.emit('savePhotoResult', data);
			}

			socket.on('savePhoto', function (data) {
				if (!hs.session.user) {
					result({message: 'Not authorized', error: true});
					return;
				}
				if (!Utils.isType('object', data) || !data.cid) {
					result({message: 'Bad params', error: true});
					return;
				}
				if (data.geo && !geoCheck(data.geo)) {
					delete data.geo;
				}

				var newValues,
					oldValues,
					newGeo,
					oldGeo,
					oldYear;

				step(
					function findPhoto() {
						Photo.findOne({cid: data.cid}).populate('user', 'login').exec(this);
					},
					function checkData(err, photo) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						var photoObj = photo.toObject(),
							i;

						//Новые значения действительно изменяемых свойств
						newValues = diff(_.pick(data, 'geo', 'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author'), photoObj);
						if (_.isEmpty(newValues)) {
							result({message: 'Nothing to save', error: true});
							return;
						}
						if (newValues.geo !== undefined) {
							Utils.geo.geoToPrecisionRound(newValues.geo);
						}
						_.assign(photo, newValues);

						//Старые значения изменяемых свойств
						oldValues = {};
						for (i in newValues) {
							if (newValues[i] !== undefined) {
								oldValues[i] = photoObj[i];
							}
						}

						oldYear = photoObj.year;
						oldGeo = photoObj.geo;
						newGeo = photo.geo;

						photo.save(this);
					},
					function savePhoto(err) {
						if (err) {
							result({message: err.message || 'Save error', error: true});
							return;
						}

						// Если есть старая или новая координаты и (они не равны или есть чем обновить постер кластера),
						// то запускаем пересчет кластеров этой фотографии
						if ((!_.isEmpty(oldGeo) || !_.isEmpty(newGeo)) && (!_.isEqual(oldGeo, newGeo) || !_.isEmpty(_.pick(oldValues, 'dir', 'title', 'year', 'year2')))) {
							PhotoCluster.clusterPhoto(data.cid, oldGeo, oldYear, this);
						} else {
							this(null);
						}
					},
					function (obj) {
						if (obj && obj.error) {
							result({message: obj.message || '', error: true});
							return;
						}
						result({message: 'Photo saved successfully'});
					}
				);

			});
		}());

	});
};