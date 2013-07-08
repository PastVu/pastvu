'use strict';

var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	PhotoFresh,
	PhotoDis,
	PhotoDel,
	PhotoSort,
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

var shift10y = ms('10y'),
	compactFields = {_id: 0, cid: 1, file: 1, ldate: 1, adate: 1, title: 1, year: 1, ccount: 1, conv: 1, convqueue: 1, ready: 1},
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
				can.edit = user.role > 4 || photo.user && photo.user.equals(user._id);
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
			var photo,
				photoSort,
				now = Date.now(),
				photoLoadTime,
				item,
				i;

			for (i = 0; i < data.length; i++) {
				item = data[i];

				photoLoadTime = now + i * 10; //Время загрузки каждого файла инкрементим на 10мс для правильной сортировки
				photo = new PhotoFresh({
					cid: count.next + i,
					user: user._id,
					file: item.fullfile,
					ldate: new Date(photoLoadTime),
					type: item.type,
					size: item.size,
					geo: undefined,
					title: item.name || undefined,
					convqueue: true
					//geo: [_.random(36546649, 38456140) / 1000000, _.random(55465922, 56103812) / 1000000],
					//dir: dirs[_.random(0, dirs.length - 1)],
				});
				photoSort = new PhotoSort({
					photo: photo._id,
					user: user._id,
					stamp: new Date(photoLoadTime + shift10y), //Прибавляем 10 лет новым, чтобы они были всегда в начале сортировки
					state: 1
				});

				result.push({cid: photo.cid});
				photo.save(this.parallel());
				photoSort.save(this.parallel());
			}
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
			Photo.findOneAndUpdate(query, { $set: { del: true }}, {new: true, upsert: false, select: {cid: 1, user: 1}}, this);
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

/**
 * Находим фотографии по сквозной таблице, независимо от статуса
 * @param query
 * @param fieldSelect Выбор полей
 * @param options
 * @param user Пользователь сессии
 * @param noPublicToo Искать ли в непубличных при наличии прав
 * @param cb
 */
var findPhotosAll = (function () {
	function findInCollection(model, arr, fieldSelect, cb) {
		if (arr.length) {
			model.find({_id: {$in: arr}}, fieldSelect, {lean: true}, cb);
		} else {
			cb(null, []);
		}
	}

	function stateCheck(source, fresh, pub, dis, del) {
		var item,
			i;
		for (i = source.length; i--;) {
			item = source[i];
			if (item.state === 1) {
				fresh.push(item.photo);
			} else if (item.state === 5) {
				pub.push(item.photo);
			} else if (item.state === 7) {
				dis.push(item.photo);
			} else if (item.state === 9) {
				del.push(item.photo);
			}
		}
	}

	return function (query, fieldSelect, options, user, noPublicToo, cb) {
		var photoSort;
		step(
			function () {
				if (user.role < 9) {
					query.state = {$ne: 9}; //Не обладающие ролью админа не могут видеть удаленные фотографии
				}
				options = options || {};
				options.lean = true;
				PhotoSort.find(query, {_id: 0, photo: 1, state: 1}, options, this);
			},
			function (err, pSort) {
				if (err) {
					cb(err);
				}
				var fresh = [],
					pub = [],
					dis = [],
					del = [];

				//Если в выборе нет _id, то еключаем его, т.к. он нужен для меппинга
				if (!fieldSelect._id) {
					fieldSelect = _.clone(fieldSelect);
					fieldSelect._id = 1;
				}

				stateCheck(pSort, fresh, pub, dis, del);
				findInCollection(PhotoFresh, fresh, fieldSelect, this.parallel());
				findInCollection(Photo, pub, fieldSelect, this.parallel());
				findInCollection(PhotoDis, dis, fieldSelect, this.parallel());
				findInCollection(PhotoDel, del, fieldSelect, this.parallel());
				photoSort = pSort;
			},
			function (err, fresh, pub, dis, del) {
				if (err) {
					cb(err);
				}
				var res = [],
					photosHash = {},
					item,
					i;

				for (i = fresh.length; i--;) {
					item = fresh[i];
					item.fresh = true;
					photosHash[item._id] = item;
				}
				for (i = pub.length; i--;) {
					item = pub[i];
					photosHash[item._id] = item;
				}
				for (i = dis.length; i--;) {
					item = dis[i];
					item.disabled = true;
					photosHash[item._id] = item;
				}
				for (i = del.length; i--;) {
					item = del[i];
					item.del = true;
					photosHash[item._id] = item;
				}

				for (i = photoSort.length; i--;) {
					item = photosHash[photoSort[i].photo];
					if (item) {
						res.unshift(item);
					}
				}
				cb(err, res);
			}
		);
	};
}());

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
	PhotoSort = db.model('PhotoSort');
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
						PhotoFresh.findOne({cid: cid}, {}, {lean: true}, this);
					},
					function (err, photoFresh) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						if (!photoFresh) {
							return result({message: 'Requested photo does not exist', error: true});
						}
						delete photoFresh.ready;

						var photo = new Photo(photoFresh);

						photo.adate = new Date();
						photo.frags = undefined;
						if (!Utils.geoCheck(photoFresh.geo)) {
							photo.geo = undefined;
						}

						photo.save(this.parallel());
						PhotoSort.update({photo: photo._id}, {$set: {state: 5, stamp: photo.adate}}, {upsert: false}, this.parallel());
					},
					function (err, photoSaved) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result({message: 'Photo approved successfully'});

						if (Utils.geoCheck(photoSaved.geo)) {
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

						if (!Array.isArray(p.frags) || !p.frags.length) {
							photo.frags = undefined;
						}
						if (!Utils.geoCheck(p.geo)) {
							photo.geo = undefined;
						}

						photo = p;
						newPhoto.save(this.parallel());
						PhotoSort.update({photo: photo._id}, {$set: {state: makeDisabled ? 7 : 5}}, {upsert: false}, this.parallel());
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
						if (Utils.geoCheck(photo.geo)) {
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
				var can;
				if (checkCan) {
					can = photoPermissions.getCan(photo, hs.session.user);
				}
				photo.populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1}}, function (err, photo) {
					if (err) {
						return result({message: err && err.message, error: true});
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

		//Отдаем галерею пользователя в компактном виде
		(function () {
			function result(data) {
				socket.emit('takeUserPhotos', data);
			}

			socket.on('giveUserPhotos', function (data) {
				User.collection.findOne({login: data.login}, {_id: 1, pfcount: 1}, function (err, user) {
					if (err || !user) {
						return result({message: err && err.message || 'Such user does not exist', error: true});
					}
					var query = {user: user._id},
						noPublic = hs.session.user && (hs.session.user.role > 4 || user._id.equals(hs.session.user._id)),
						photosFresh,
						skip = data.skip || 0,
						limit = Math.min(data.limit || 20, 100);

					if (noPublic) {
						findPhotosAll(query, compactFields, {sort: {stamp: -1}, skip: skip, limit: limit}, hs.session.user, true, finish);
					} else {
						Photo.find(query, compactFields, {lean: true, sort: {adate: -1}, skip: skip, limit: limit}, finish);
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

		//Берем массив до и после указанной фотографии пользователя указанной длины
		(function () {
			function result(data) {
				socket.emit('takeUserPhotosAround', data);
			}

			socket.on('giveUserPhotosAround', function (data) {
				var cid = Number(data && data.cid),
					limitL = Math.min(Number(data.limitL), 100),
					limitR = Math.min(Number(data.limitR), 100);

				if (!cid || (!limitL && !limitR)) {
					return result({message: 'Bad params', error: true});
				}

				findPhoto({cid: cid}, {_id: 0, user: 1, adate: 1, ldate: 1}, hs.session.user, true, function (err, photo) {
					if (err || !photo || !photo.user) {
						return result({message: 'Requested photo does not exist', error: true});
					}

					step(
						function () {
							var query = {user: photo.user},
								noPublic = hs.session.user && (hs.session.user.role > 4  || photo.user._id.equals(hs.session.user._id));

							if (limitL) {
								if (noPublic) {
									//Если текущая фотография новая, то stamp должен быть увеличен на 10 лет
									query.stamp = {$gt: photo.adate || new Date(photo.ldate.getTime() + shift10y)};
									findPhotosAll(query, compactFields, {sort: {stamp: 1}, limit: limitL}, hs.session.user, true, this.parallel());
								} else {
									query.adate = {$gt: photo.adate};
									Photo.find(query, compactFields, {lean: true, sort: {adate: 1}, limit: limitL}, this.parallel());
								}
							} else {
								this.parallel()(null, []);
							}

							if (limitR) {
								if (noPublic) {
									query.stamp = {$lt: photo.adate || new Date(photo.ldate.getTime() + shift10y)};
									findPhotosAll(query, compactFields, {sort: {stamp: -1}, limit: limitR}, hs.session.user, true, this.parallel());
								} else {
									query.adate = {$lt: photo.adate};
									Photo.find(query, compactFields, {lean: true, sort: {adate: -1}, limit: limitR}, this.parallel());
								}
							} else {
								this.parallel()(null, []);
							}
						},
						function (err, photosL, photosR) {
							if (err) {
								return result({message: err && err.message, error: true});
							}
							result({left: photosL, right: photosR});
						}
					);
				});
			});
		}());


		//Отдаем непубличные фотографии
		(function () {
			function result(data) {
				socket.emit('takeUserPhotosPrivate', data);
			}

			socket.on('giveUserPhotosPrivate', function (data) {
				if (!hs.session.user ||
					(hs.session.user.role < 5 && hs.session.user.login !== data.login)) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				User.getUserID(data.login, function (err, userid) {
					if (err) {
						return result({message: err && err.message, error: true});
					}

					step(
						function () {
							var query = {user: userid};
							if (data.startTime || data.endTime) {
								query.adate = {};
								if (data.startTime) {
									query.adate.$gte = new Date(data.startTime);
								}
								if (data.endTime) {
									query.adate.$lte = new Date(data.endTime);
								}
							}

							PhotoFresh.collection.find({user: userid}, compactFields, {sort: {ldate: -1}}, this.parallel());
							PhotoDis.collection.find(query, compactFields, this.parallel());
							if (hs.session.user.role > 9) {
								PhotoDel.collection.find(query, compactFields, this.parallel());
							}
						},
						Utils.cursorsExtract,
						function (err, fresh, disabled, del) {
							if (err) {
								return result({message: err && err.message, error: true});
							}
							var res = {fresh: fresh || [], disabled: disabled || [], len: fresh.length + disabled.length},
								i;
							for (i = res.fresh.length; i--;) {
								res.fresh[i].fresh = true;
							}
							for (i = res.disabled.length; i--;) {
								res.disabled[i].disabled = true;
							}
							if (hs.session.user.role > 9) {
								res.del = del || [];
								res.len += res.del.length;
								for (i = res.del.length; i--;) {
									res.del[i].del = true;
								}
							}
							result(res);
						}
					);
				});
			});
		}());

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
					Photo.findOne({cid: cid}, {_id: 0, user: 1}, function (err, photo) {
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

		//Сохраняем информацию о фотографии
		(function () {
			function result(data) {
				socket.emit('savePhotoResult', data);
			}

			socket.on('savePhoto', function (data) {
				if (!hs.session.user) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				if (!Utils.isType('object', data) || !Number(data.cid)) {
					return result({message: 'Bad params', error: true});
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

		//Говорим, что фото готово к подтверждению
		(function () {
			function result(data) {
				socket.emit('readyPhotoResult', data);
			}

			socket.on('readyPhoto', function (cid) {
				if (!hs.session.user) {
					return result({message: 'You do not have permission for this action', error: true});
				}
				cid = Number(cid);
				if (!cid) {
					return result({message: 'Requested photo does not exist', error: true});
				}
				step(
					function () {
						PhotoFresh.findOne({cid: cid}, this);
					},
					function (err, photo) {
						if (err && !photo) {
							return result({message: err && err.message || 'Requested photo does not exist', error: true});
						}
						if (!photoPermissions.getCan(photo, hs.session.user).edit) {
							return result({message: 'You do not have permission for this action', error: true});
						}
						photo.ready = true;
						photo.save(this);
					},
					function (err) {
						if (err) {
							return result({message: err && err.message, error: true});
						}
						result({message: 'Ok'});
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