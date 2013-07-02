'use strict';

var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	PhotoFresh,
	PhotoDis,
	PhotoDel,
	UsersPhotos,
	Counter,
	PhotoCluster = require('./photoCluster.js'),
	PhotoConverter = require('./photoConverter.js'),
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
	imageFolders = [publicDir + 'x/', publicDir + 's/', publicDir + 'q/', publicDir + 'm/', publicDir + 'h/', publicDir + 'd/', publicDir + 'a/'],

	commentController = require('./comment.js');

var compactFields = {_id: 0, cid: 1, file: 1, ldate: 1, adate: 1, title: 1, year: 1, ccount: 1, conv: 1, convqueue: 1},
	photoPermissions = {
		getCan: function (photo, user) {
			var can = {
				edit: false,
				disable: false,
				remove: false,
				approve: false,
				convert: false
			};

			if (user) {
				can.edit = user.role > 4 || photo.user && photo.user.login === user.login;
				if (user.role > 4) {
					can.disable = true;
					can.remove = true;
					if (photo.fresh) {
						can.approve = true;
					}
					if (user.role > 9) {
						can.convert = true;
					}
				}
			}
			return can;
		},
		checkType: function (type, photo, user) {
			if (type === 'fresh' || type === 'dis') {
				return user.role > 4 || photo.user.equals(user._id);
			} else if (type === 'del') {
				return user.role > 9;
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
		return cb({message: 'You do not have permission for this action', error: true});
	}
	if (!data || (!Array.isArray(data) && !Utils.isType('object', data))) {
		return cb({message: 'Bad params', error: true});
	}

	if (!Array.isArray(data) && Utils.isType('object', data)) {
		data = [data];
	}

	var result = [];

	step(
		function filesToPrivate() {
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
			data.forEach(function (item, index) {
				var photo = new PhotoFresh({
					cid: count.next - index,
					user: user._id,
					file: item.fullfile,
					type: item.type,
					size: item.size,
					geo: undefined,
					title: item.name || undefined,
					convqueue: true
					//geo: [_.random(36546649, 38456140) / 1000000, _.random(55465922, 56103812) / 1000000],
					//dir: dirs[_.random(0, dirs.length - 1)],
				});

				result.push({cid: photo.cid});
				if (data.length > 1) {
					photo.save(this.parallel());
				} else {
					photo.save(this);
				}
			}.bind(this));
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			user.pfcount = user.pfcount + data.length;
			user.save(this);
			auth.sendMe(socket);
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb({message: data.length + ' photo successfully saved', cids: result});
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

//Последовательно ищем фотографию в новых, неактивных и удаленных, если у пользователя есть на них права
function findPhotoNotPublic(query, fieldSelect, user, cb) {
	if (!user) {
		cb({message: 'No such photo for this user'});
	}
	async.series(
		[
			function (callback) {
				PhotoFresh.findOne(query, fieldSelect, function (err, photo) {
					if (err) {
						return cb(err);
					}

					if (photo && photoPermissions.checkType('fresh', photo, user)) {
						photo = {photo: photo};
					} else {
						photo = null;
					}
					callback(photo);
				});
			},
			function (callback) {
				PhotoDis.findOne(query, fieldSelect, function (err, photo) {
					if (err) {
						return cb(err);
					}

					if (photo && photoPermissions.checkType('dis', photo, user) || user.role < 10) {
						photo = {photo: photo};
					} else {
						photo = null; //Если фото не найдено и юзер админ, то ищем дальше в удаленных
					}
					callback(photo);
				});
			},
			function (callback) {
				PhotoDel.findOne(query, fieldSelect, function (err, photo) {
					if (err) {
						return cb(err);
					}
					callback({photo: photo});
				});
			}
		],
		function (obj) {
			cb(null, obj.photo);
		}
	);
}

/**
 * Находим фотографию
 * @param query
 * @param fieldSelect Выбор полей
 * @param user Пользователь сессии
 * @param noPublicToo Искать ли в непубличных при наличии прав
 * @param cb
 */
function findPhoto(query, fieldSelect, user, noPublicToo, cb) {
	Photo.findOne(query, fieldSelect, function (err, photo) {
		if (err) {
			return cb(err);
		}
		if (!photo && noPublicToo && user) {
			findPhotoNotPublic(query, fieldSelect, user, function (err, photo) {
				cb(err, photo);
			});
		} else {
			cb(null, photo);
		}
	});
}

//Обнуляет статистику просмотров за день и неделю
var planResetDisplayStat = (function () {
	function resetStat() {
		var setQuery = {vdcount: 0},
			needWeek = moment().day() === 1; //Начало недели - понедельник

		if (needWeek) {
			setQuery.vwcount = 0;
		}
		step(
			function () {
				Photo.update({}, {$set: setQuery}, {multi: true}, this.parallel());
				PhotoDis.update({}, {$set: setQuery}, {multi: true}, this.parallel());
				PhotoDel.update({}, {$set: setQuery}, {multi: true}, this.parallel());
			},
			function (err, count, countDis, countDel) {
				planResetDisplayStat();
				if (err) {
					return logger.error(err);
				}
				logger.info('Reset day' + (needWeek ? ' and week ' : ' ') + 'display statistics for %s public, %s disabled and %s deleted photos', count, countDis, countDel);
			}
		);
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
	PhotoFresh = db.model('PhotoFresh');
	PhotoDis = db.model('PhotoDisabled');
	PhotoDel = db.model('PhotoDel');
	UsersPhotos = db.model('UsersPhotos');
	Counter = db.model('Counter');

	PhotoCluster.loadController(app, db, io);
	PhotoConverter.loadController(app, db, io);

	planResetDisplayStat(); //Планируем очистку статистики

	// Регулярно проводим чистку удаленных файлов
	setInterval(dropPhotos, ms('5m'));
	dropPhotos();

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
		socket.on('dropPhotos', function (data) {
			dropPhotos(function (msg) {
				socket.emit('dropPhotosResult', {message: msg});
			});
		});


		//Подтверждаем новую фотографию
		(function () {
			function result(data) {
				socket.emit('approvePhotoResult', data);
			}

			socket.on('approvePhoto', function (cid) {
				cid = Number(cid);
				if (!cid) {
					return result({message: 'Requested photo does not exist', error: true});
				}
				if (!hs.session.user || hs.session.user.role < 5) {
					return result({message: 'You do not have permission for this action', error: true});
				}

				step(
					function () {
						PhotoFresh.findOne({cid: cid}, {_id: 0}).populate('user', {_id: 1, login: 1}).exec(this);
					},
					function (err, photoFresh) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						if (!photoFresh) {
							return result({message: 'Requested photo does not exist', error: true});
						}

						var userPhoto = new UsersPhotos({
								login: photoFresh.user.login,
								cid: photoFresh.cid,
								stamp: new Date()
							}),
							photo;

						photoFresh = photoFresh.toObject();
						photoFresh.user = photoFresh.user._id;

						photo = new Photo(photoFresh);
						photo.adate = userPhoto.stamp;
						photo.frags = undefined;
						if (!photoFresh.geo) {
							photo.geo = undefined;
						}

						photo.save(this.parallel());
						userPhoto.save(this.parallel());
					},
					function (err, photoSaved) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result({message: 'Photo approved successfully'});

						if (!_.isEmpty(photoSaved.geo)) {
							console.log('Go cluster');
							PhotoCluster.clusterPhoto(photoSaved);
						}

						//Удаляем из коллекции новых
						PhotoFresh.remove({cid: cid}).exec();
						if (photoSaved.user.equals(hs.session.user._id)) {
							hs.session.user.pcount = hs.session.user.pcount + 1;
							hs.session.user.pfcount = hs.session.user.pfcount - 1;
							hs.session.user.save();
							auth.sendMe(socket);
						} else {
							User.update({_id: photoSaved.user}, {$inc: {pcount: 1, pfcount: -1}}).exec();
						}
					}
				);
			});
		}());


		//Активация/деактивация фото
		(function () {
			function result(data) {
				socket.emit('disablePhotoResult', data);
			}

			socket.on('disablePhoto', function (data) {
				if (!hs.session.user || hs.session.user.role < 5) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				if (!data || !Utils.isType('object', data)) {
					return result({message: 'Bad params', error: true});
				}
				var cid = Number(data.cid),
					photo,
					makeDisabled = !!data.disable,
					affectMe;

				if (!cid) {
					return result({message: 'Requested photo does not exist', error: true});
				}

				step(
					function () {
						if (makeDisabled) {
							Photo.collection.findOne({cid: cid}, {__v: 0}, this);
						} else {
							PhotoDis.collection.findOne({cid: cid}, {__v: 0}, this);
						}
					},
					function createInNewModel(err, p) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						if (!p) {
							return result({message: 'Requested photo does not exist', error: true});
						}
						var newPhoto;

						if (makeDisabled) {
							newPhoto = new PhotoDis(p);
						} else {
							newPhoto = new Photo(p);
						}

						photo = p;
						newPhoto.save(this);
					},
					function removeFromOldModel(err, photoSaved) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						if (makeDisabled) {
							Photo.remove({cid: cid}).exec(this);
						} else {
							PhotoDis.remove({cid: cid}).exec(this);
						}
					},
					function (err) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						//Скрываем или показываем комментарии и пересчитываем их публичное кол-во у пользователей
						commentController.hideObjComments(photo._id, makeDisabled, hs.session.user, this.parallel());

						//Пересчитывам кол-во публичных фото у владельца
						User.update({_id: photo.user}, {$inc: {pcount: makeDisabled ? -1 : 1}}, this.parallel());
						if (photo.user.equals(hs.session.user._id)) {
							hs.session.user.pcount = hs.session.user.pcount + (makeDisabled ? -1 : 1);
							affectMe = true;
						}

						//Если у фото есть координаты, значит надо провести действие с кластером
						if (!_.isEmpty(photo.geo)) {
							if (makeDisabled) {
								PhotoCluster.declusterPhoto(photo, this.parallel());
							} else {
								PhotoCluster.clusterPhoto(photo, null, null, this.parallel());
							}
						}
					},
					function (err, hideCommentsResult) {
						if (err) {
							return result({message: err && err.message || 'Comments hide error', error: true});
						}
						if (hideCommentsResult.myCount) {
							hs.session.user.ccount = hs.session.user.ccount + (makeDisabled ? -1 : 1) * hideCommentsResult.myCount;
							affectMe = true;
						}
						// Если поменялись данные в своей сессии, отправляем их себе
						if (affectMe) {
							auth.sendMe(socket);
						}
						result({disabled: makeDisabled});
					}
				);
			});
		}());


		//Отдаем фотографию для её страницы
		(function () {
			function result(data) {
				socket.emit('takePhoto', data);
			}

			function process(photo, checkCan) {
				if (!photo) {
					return result({message: 'Requested photo does not exist', error: true});
				}
				photo.populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1}}, function (err, photo) {
					if (err) {
						return result({message: err && err.message, error: true});
					}
					var can;
					if (checkCan) {
						can = photoPermissions.getCan(photo, hs.session.user);
					}
					result({photo: photo.toObject({getters: true}), can: can});
				});
			}

			socket.on('givePhoto', function (data) {
				var cid = Number(data.cid),
					fieldSelect = {_id: 0, 'frags._id': 0};

				if (isNaN(cid)) {
					return result({message: 'Requested photo does not exist', error: true});
				}
				//Инкрементируем кол-во просмотров только у публичных фото
				Photo.findOneAndUpdate({cid: cid}, {$inc: {vdcount: 1, vwcount: 1, vcount: 1}}, {new: true, select: fieldSelect}, function (err, photo) {
					if (err) {
						return result({message: err && err.message, error: true});
					}

					//Если фото не найдено и пользователь залогинен, то ищем в новых, неактивных и удаленных
					if (!photo && hs.session.user) {
						findPhotoNotPublic({cid: cid}, fieldSelect, hs.session.user, function (err, photo) {
							if (err) {
								return result({message: err && err.message, error: true});
							}
							process(photo, data.checkCan);
						});
					} else {
						process(photo, data.checkCan);
					}
				});
			});
		}());


		//Отдаем последние публичные фотографии
		(function () {
			function result(data) {
				socket.emit('takePhotosPublic', data);
			}

			socket.on('givePhotosPublic', function (data) {
				if (!Utils.isType('object', data)) {
					return result({message: 'Bad params', error: true});
				}
				step(
					function () {
						Photo.collection.find({}, compactFields, {sort: [
							['adate', 'desc']
						], skip: data.skip || 0, limit: Math.min(data.limit || 20, 100)}, this);
					},
					Utils.cursorExtract,
					function (err, photos) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result({photos: photos});
					}
				);
			});
		}());

		//Отдаем фотографии пользователя в компактном виде
		(function () {
			function result(data) {
				socket.emit('takeUserPhotos', data);
			}

			function sortAdate(a, b) {
				return a.adate > b.adate ? -1 : (a.adate < b.adate ? 1 : 0);
			}

			socket.on('giveUserPhotos', function (data) {
				User.collection.findOne({login: data.login}, {_id: 1, pfcount: 1}, function (err, user) {
					if (err || !user) {
						return result({message: err && err.message || 'Such user does not exist', error: true});
					}
					var query = {user: user._id},
						photosFresh,
						skip = data.skip || 0,
						limit = Math.min(data.limit || 20, 100);

					if (hs.session.user && (user._id.equals(hs.session.user._id) || hs.session.user.role > 4)) {
						step(
							function () {
								var _this = this;
								user.pfcount = user.pfcount || 0;
								if (user.pfcount > skip) {
									//Если кол-во новых больше пропуска, значит они попадают на страницу
									PhotoFresh.collection.find(query, compactFields, {sort: {ldate: -1}, skip: skip, limit: limit}, function (err, cursor) {
										cursor.toArray(_this);
									});
									skip = 0;
								} else {
									//Если новых меньше чем пропуск, значит они не попадаю на страницу,
									//но уменьшают пропуск остальных на свое кол-во
									skip -= user.pfcount;
									this(null, []);
								}
							},
							function (err, pFresh) {
								if (err) {
									return finish(err);
								}

								if (pFresh && pFresh.length) {
									limit -= pFresh.length; //Кол-во остальных уменьшаем на кол-во новых
									photosFresh = pFresh;
								}

								UsersPhotos.collection.find({login: data.login}, {_id: 0, cid: 1}, {sort: [
									['stamp', 'desc']
								], skip: skip, limit: limit}, this);

							},
							Utils.cursorExtract,
							function (err, usersPhotos) {
								if (err) {
									return finish(err);
								}
								var cids = [],
									i;

								for (i = usersPhotos.length; i--;) {
									cids.push(usersPhotos[i].cid);
								}

								Photo.collection.find({cid: {$in: cids}}, compactFields, {sort: [
									['adate', 'desc']
								]}, this.parallel());
								PhotoDis.collection.find({cid: {$in: cids}}, compactFields, this.parallel());
								if (hs.session.user.role > 9) {
									PhotoDel.collection.find({cid: {$in: cids}}, compactFields, this.parallel());
								}

							},
							Utils.cursorsExtract,
							function (err, photosPublic, photosDis, photosDel) {
								if (err) {
									return finish(err);
								}
								var needSort,
									i;

								if (photosDis && photosDis.length) {
									for (i = photosDis.length; i--;) {
										photosDis[i].disabled = true;
										photosPublic.push(photosDis[i]);
									}
									needSort = true;
								}
								if (photosDel && photosDel.length) {
									for (i = photosDel.length; i--;) {
										photosDis[i].del = true;
										photosPublic.push(photosDel[i]);
									}
									needSort = true;
								}
								if (needSort) {
									photosPublic.sort(sortAdate);
								}

								if (photosFresh && photosFresh.length) {
									for (i = photosFresh.length; i--;) {
										photosFresh[i].fresh = true;
										photosPublic.unshift(photosFresh[i]);
									}
								}

								finish(null, photosPublic);
							}
						);
					} else {
						step(
							function () {
								Photo.collection.find(query, compactFields, {sort: [
									['adate', 'desc']
								], skip: skip, limit: limit}, this);
							},
							Utils.cursorExtract,
							function (err, photos) {
								finish(err, photos);
							}
						);
					}


					function finish(err, photos) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result({photos: photos});
						photosFresh = skip = limit = null;
					}
				});
			});
		}());


		/**
		 * Отдаем фотографии с ограниченным доступом
		 */
		function takeUserPhotosPrivate(data) {
			socket.emit('takeUserPhotosPrivate', data);
		}

		socket.on('giveUserPhotosPrivate', function (data) {
			User.getUserID(data.login, function (err, userid) {
				if (err) {
					takeUserPhotosPrivate({message: err && err.message, error: true});
					return;
				}
				if (!hs.session.user || !userid.equals(hs.session.user._id)) {
					takeUserPhotosPrivate({message: 'You do not have permission for this action', error: true});
					return;
				}

				step(
					function () {
						var filters = {user: userid, disabled: true, del: {$exists: false}};
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
						Photo.getPhotosFreshCompact({user: userid, fresh: true, del: {$exists: false}}, {}, this.parallel());
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

		//Отдаем новые фотографии
		(function () {
			function result(data) {
				socket.emit('takePhotosFresh', data);
			}

			socket.on('givePhotosFresh', function (data) {
				if (!hs.session.user ||
					(!data.login && hs.session.user.role < 5) ||
					(data.login && hs.session.user.role < 5 && hs.session.user.login !== data.login)) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				if (!data || !Utils.isType('object', data)) {
					return result({message: 'Bad params', error: true});
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
							return result({message: err && err.message, error: true});
						}
						var criteria = {};
						if (userid) {
							criteria.user = userid;
						}
						if (data.after) {
							criteria.ldate = {$gt: new Date(data.after)};
						}
						PhotoFresh.collection.find(criteria, compactFields, {skip: data.skip || 0, limit: Math.min(data.limit || 100, 100)}, this);
					},
					Utils.cursorExtract,
					function (err, photos) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						for (var i = photos.length; i--;) {
							photos[i].fresh = true;
						}
						result({photos: photos || []});
					}
				);
			});
		}());


		//Отдаем разрешенные can для фото
		(function () {
			function result(data) {
				socket.emit('takeCanPhoto', data);
			}

			socket.on('giveCanPhoto', function (data) {
				var cid = Number(data.cid);

				if (isNaN(cid)) {
					return result({message: 'Requested photo does not exist', error: true});
				}
				if (hs.session.user) {
					Photo.findOne({cid: cid}, {_id: 1, user: 1}).populate('user', {_id: 0, login: 1}).exec(function (err, photo) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result({can: photoPermissions.getCan(photo, hs.session.user)});
					});
				} else {
					result({});
				}
			});
		}());

		(function () {
			/**
			 * Берем массив до и после указанной фотографии указанной длины
			 */
			function result(data) {
				socket.emit('takeUserPhotosAround', data);
			}

			socket.on('giveUserPhotosAround', function (data) {
				if (!data.cid || (!data.limitL && !data.limitR)) {
					result({message: 'Bad params', error: true});
					return;
				}

				step(
					function findUserId() {
						Photo.findOne({cid: data.cid}, {_id: 0, user: 1}, this);
					},
					function findAroundPhotos(err, photo) {
						if (err || !photo || !photo.user) {
							result({message: 'No such photo', error: true});
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
							result({message: err.message || '', error: true});
							return;
						}
						result({left: photosL, right: photosR});
					}
				);
			});
		}());


		//Сохраняем информацию о фотографии
		(function () {
			function result(data) {
				socket.emit('savePhotoResult', data);
			}

			socket.on('savePhoto', function (data) {
				if (!hs.session.user) {
					result({message: 'You do not have permission for this action', error: true});
					return;
				}
				if (!Utils.isType('object', data) || !Number(data.cid)) {
					result({message: 'Bad params', error: true});
					return;
				}

				var cid = Number(data.cid),
					photoOldObj,
					newValues,
					sendingBack = {};

				step(
					function () {
						findPhoto({cid: cid}, {frags: 0}, hs.session.user, true, this);
					},
					function checkPhoto(err, photo) {
						if (!photo) {
							return result({message: 'Requested photo does not exist', error: true});
						}
						if (!photoPermissions.getCan(photo, hs.session.user).edit) {
							return result({message: 'You do not have permission for this action', error: true});
						}
						this(null, photo);
					},
					function checkData(err, photo) {
						photoOldObj = photo.toObject({getters: true});

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
							return result({message: 'Nothing to save'});
						}

						if (newValues.geo !== undefined) {
							Utils.geo.geoToPrecisionRound(newValues.geo);
						}
						if (newValues.desc !== undefined) {
							sendingBack.desc = newValues.desc;
						}
						if (newValues.source !== undefined) {
							sendingBack.source = newValues.source;
						}

						_.assign(photo, newValues);
						photo.save(this);
					},
					function savePhoto(err, photoSaved) {
						if (err) {
							return result({message: err.message || 'Save error', error: true});
						}
						var oldValues = {}, //Старые значения изменяемых свойств
							oldGeo,
							newGeo,
							i;

						for (i in newValues) {
							if (newValues[i] !== undefined) {
								oldValues[i] = photoOldObj[i];
							}
						}

						oldGeo = photoOldObj.geo;
						newGeo = photoSaved.geo;

						// Если фото - публичное, у него
						// есть старая или новая координаты и (они не равны или есть чем обновить постер кластера),
						// то запускаем пересчет кластеров этой фотографии
						if (!photoOldObj.fresh && !photoOldObj.disabled && !photoOldObj.del &&
							(!_.isEmpty(oldGeo) || !_.isEmpty(newGeo)) &&
							(!_.isEqual(oldGeo, newGeo) || !_.isEmpty(_.pick(oldValues, 'dir', 'title', 'year', 'year2')))) {
							console.log('Go cluster save');
							PhotoCluster.clusterPhoto(photoSaved, oldGeo, photoOldObj.year, this);
						} else {
							this(null);
						}
					},
					function (obj) {
						if (obj && obj.error) {
							return result({message: obj.message || '', error: true});
						}
						result({message: 'Photo saved successfully', saved: true, data: sendingBack});
					}
				);
			});
		}());


		//Фотографии и кластеры по границам
		(function () {
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
								Photo.collection.find(criteria, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1}, this.parallel());
							}
						},
						function cursors(err) {
							if (err) {
								return result({message: err && err.message, error: true});
							}
							var i = arguments.length;
							while (i > 1) {
								arguments[--i].toArray(this.parallel());
							}
						},
						function (err, photos) {
							if (err) {
								return result({message: err && err.message, error: true});
							}
							var allPhotos = photos,
								i = arguments.length;

							while (i > 2) {
								allPhotos.push.apply(allPhotos, arguments[--i]);
							}
							res(err, allPhotos);
						}
					);
				}

				function res(err, photos, clusters) {
					if (err) {
						return result({message: err && err.message, error: true});
					}

					// Реверсируем geo
					for (var i = photos.length; i--;) {
						photos[i].geo.reverse();
					}
					result({photos: photos, clusters: clusters, startAt: data.startAt});
				}
			});
		}());


		//Отправляет выбранные фото на конвертацию
		(function () {
			function result(data) {
				socket.emit('convertPhotosResult', data);
			}

			socket.on('convertPhotos', function (data) {
				if (!hs.session.user || hs.session.user.role < 10) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				if (!Array.isArray(data) || data.length === 0) {
					return result({message: 'Bad params', error: true});
				}
				var cids = [],
					i = data.length;

				while (i--) {
					data[i].cid = Number(data[i].cid);
					if (data[i].cid) {
						cids.push(data[i].cid);
					}
				}
				if (!cids.length) {
					return result({message: 'Bad params', error: true});
				}
				step(
					function () {
						Photo.update({cid: {$in: cids}}, {$set: {convqueue: true}}, {multi: true}, this);
					},
					function (err, count) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						//Если не все нашлись в публичных, пробуем обновить в остальных статусах
						if (count !== cids.length) {
							PhotoFresh.update({cid: {$in: cids}}, {$set: {convqueue: true}}, {multi: true}, this.parallel());
							PhotoDis.update({cid: {$in: cids}}, {$set: {convqueue: true}}, {multi: true}, this.parallel());
							PhotoDel.update({cid: {$in: cids}}, {$set: {convqueue: true}}, {multi: true}, this.parallel());
						} else {
							this();
						}
					},
					function (err) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						PhotoConverter.addPhotos(data, this);
					},
					function (err, addResult) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result(addResult);
					}
				);
			});
		}());

		//Отправляет все фото выбранных вариантов на конвертацию
		(function () {
			function result(data) {
				socket.emit('convertPhotosAllResult', data);
			}

			socket.on('convertPhotosAll', function (data) {
				if (!hs.session.user || hs.session.user.role < 10) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				if (!Utils.isType('object', data)) {
					return result({message: 'Bad params', error: true});
				}
				PhotoConverter.addPhotosAll(data, function (addResult) {
					result(addResult);
				});
			});
		}());
	});
};
module.exports.findPhoto = findPhoto;
module.exports.findPhotoNotPublic = findPhotoNotPublic;