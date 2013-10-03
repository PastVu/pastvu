'use strict';

var fs = require('fs'),
	path = require('path'),
	auth = require('./auth.js'),
	jade = require('jade'),
	_session = require('./_session.js'),
	settings = require('./settings.js'),
	Settings,
	User,
	UserSubscr,
	UserSubscrNoty,
	News,
	Photo,
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	logger = require('log4js').getLogger("subscr.js"),
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	mailController = require('./mail.js'),
	photoController = require('./photo.js'),
	commentController = require('./comment.js'),

	msg = {
		deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
		noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
		nouser: 'Requested user does not exist'
	},

	noticeTpl,

	declension = {
		comment: [' новый комментарий', ' новых комментария', ' новых комментариев'],
		commentUnread: [' непрочитанный', ' непрочитанных', ' непрочитанных']
	},

	sendFreq = 2000, //Частота шага конвейера отправки в ms
	sendPerStep = 4; //Кол-во отправляемых уведомлений за шаг конвейера

/**
 * Подписка объекта (внешняя, для текущего пользователя по cid объекта)
 * @param user
 * @param data
 * @param cb
 */
function subscribeUser(user, data, cb) {
	if (!user) {
		return cb({message: msg.deny, error: true});
	}
	if (!data || !Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}

	var cid = Number(data.cid);

	step(
		function findObj() {
			if (data.type === 'news') {
				News.findOne({cid: cid}, {_id: 1}, this);
			} else {
				photoController.findPhoto({cid: cid}, {_id: 1, user: 1}, user, true, this);
			}
		},
		function (err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			if (data.do) {
				UserSubscr.update({obj: obj._id, user: user._id}, {$set: {type: data.type, cdate: new Date()}}, {upsert: true, multi: false}, this.parallel());
				//Вставляем время просмотра объекта, если его еще нет, чтобы при отправке уведомления правильно посчиталось кол-во новых с момента подписки
				commentController.upsertCommentsView(obj._id, user._id, this.parallel());
			} else {
				UserSubscr.remove({obj: obj._id, user: user._id}, this);
			}
		},
		function (err) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({subscr: data.do});
		}
	);
}

/**
 * Подписка объекта по id пользователя и объекта (внутренняя, например, после подтверждения фото)
 * @param userId
 * @param objId
 * @param type
 * @param cb
 */
function subscribeUserByIds(userId, objId, type, cb) {
	step(
		function () {
			UserSubscr.update({obj: objId, user: userId}, {$set: {type: type, cdate: new Date()}}, {upsert: true, multi: false}, this.parallel());
			//Вставляем время просмотра объекта, если его еще нет, чтобы при отправке уведомления правильно посчиталось кол-во новых с момента подписки
			commentController.upsertCommentsView(objId, userId, this.parallel());
		},
		function (err) {
			if (err) {
				logger.error(err.message);
			}
			if (cb) {
				cb(err);
			}
		}
	);

}

/**
 * Устанавливает готовность уведомления для объекта по событию добавления комментария
 * @param objId
 * @param user
 */
function commentAdded(objId, user) {
	UserSubscr.find({obj: objId, user: {$ne: user._id}, noty: {$exists: false}}, {_id: 1, user: 1}, {lean: true}, function (err, objs) {
		if (err) {
			return logger.error(err.message);
		}
		if (!objs || !objs.length) {
			return; //Если никто на этот объект не подписан - выходим
		}

		var ids = [],
			users = [],
			i = objs.length;

		while (i--) {
			ids.push(objs[i]._id);
			users.push(objs[i].user);
		}

		//Устанавливает флаг готовности уведомления по объекту, для подписанных пользователей
		UserSubscr.update({_id: {$in: ids}}, {$set: {noty: true, ndate: new Date()}}, {multi: true}, function (err) {
			if (err) {
				return logger.error(err.message);
			}
			//Вызываем планировщик отправки уведомлений для подписанных пользователей
			scheduleUserNotice(users);
		});
	});
}

/**
 * Устанавливает объект комментариев как просмотренный, т.е. ненужный для уведомления
 * @param objId
 * @param user
 */
function commentViewed(objId, user) {
	UserSubscr.update({obj: objId, user: user._id}, {$unset: {noty: 1}, $set: {ndate: new Date()}}, {upsert: false, multi: false}, function (err, numberAffected) {
		if (err) {
			return logger.error(err.message);
		}
		if (!numberAffected) {
			return;
		}

		//Считаем кол-во оставшихся готовых к отправке уведомлений для пользователя
		UserSubscr.count({user: user._id, noty: true}, function (err, count) {
			if (err) {
				return logger.error(err.message);
			}
			if (!count) {
				//Если уведомлений, готовых к отправке больше нет, то сбрасываем запланированное уведомление для пользователя
				UserSubscrNoty.update({user: user._id}, {$unset: {nextnoty: 1}}).exec();
			}
		});
	});
}

/**
 * При изменении пользователем своего throttle, надо поменять время заплонированной отправки, если оно есть
 * @param userId
 * @param newThrottle
 */
function userThrottleChange(userId, newThrottle) {
	if (!newThrottle) {
		return;
	}
	UserSubscrNoty.findOne({user: userId, nextnoty: {$exists: true}}, {_id: 0}, {lean: true}, function (err, userNoty) {
		if (err) {
			return logger.error(err.message);
		}
		if (!userNoty) {
			return;
		}
		var newNextNoty,
			nearestNoticeTimeStamp = Date.now() + 10000;

		if (userNoty.lastnoty && userNoty.lastnoty.getTime) {
			newNextNoty = Math.max(userNoty.lastnoty.getTime() + newThrottle, nearestNoticeTimeStamp);
		} else {
			newNextNoty = nearestNoticeTimeStamp;
		}

		UserSubscrNoty.update({user: userId}, {$set: {nextnoty: new Date(newNextNoty)}}).exec();
	});
}

/**
 * Планируем отправку уведомлений для пользователей
 * @param users Массив _id пользователй
 */
function scheduleUserNotice(users) {
	step(
		function () {
			//Находим для каждого пользователя параметр throttle
			User.find({_id: {$in: users}}, {_id: 1, 'settings.subscr_throttle': 1}, {lean: true}, this.parallel());
			//Находим noty пользователей из списка, и берем даже запланированных, если их не возьмем, то не сможем понять, кто уже запланирован, а кто первый раз планируется
			UserSubscrNoty.find({user: {$in: users}}, {_id: 0}, {lean: true}, this.parallel());
		},
		function (err, usersThrottle, usersNoty) {
			if (err) {
				return logger.error(err.message);
			}
			var userId,
				usersTrottleHash = {},
				usersNotyHash = {},
				defThrottle = settings.getUserSettingsDef().subscr_throttle,
				nearestNoticeTimeStamp = Date.now() + 10000, //Ближайшее уведомление для пользователей, у которых не было предыдущих
				lastnoty,
				nextnoty,
				i;

			for (i = usersThrottle.length; i--;) {
				usersTrottleHash[usersThrottle[i]._id] = usersThrottle[i].settings && usersThrottle[i].settings.subscr_throttle;
			}

			for (i = usersNoty.length; i--;) {
				if (usersNoty[i].nextnoty) {
					//Значит у этого пользователя уже запланированно уведомление и ничего делать не надо
					usersNotyHash[usersNoty[i].user] = false;
				} else {
					//Если у пользователя еще не установленно время следующего уведомления, расчитываем его
					lastnoty = usersNoty[i].lastnoty;

					//Если прошлого уведомления еще не было или с его момента прошло больше времени,
					//чем throttle пользователя или осталось менее 10сек, ставим ближайший
					if (lastnoty && lastnoty.getTime) {
						nextnoty = Math.max(lastnoty.getTime() + (usersTrottleHash[usersNoty[i].user] || defThrottle), nearestNoticeTimeStamp);
					} else {
						nextnoty = nearestNoticeTimeStamp;
					}
					usersNotyHash[usersNoty[i].user] = nextnoty;
				}
			}

			for (i = users.length; i--;) {
				userId = users[i];
				if (usersNotyHash[userId] !== false) {
					UserSubscrNoty.update({user: userId}, {$set: {nextnoty: new Date(usersNotyHash[userId] || nearestNoticeTimeStamp)}}, {upsert: true}).exec();
				}
			}
		}
	);
}

//Конвейер отправки уведомлений
//Каждые sendFreq ms отправляем sendPerStep уведомлений
var notifierConveyer = (function () {
	function conveyerStep() {
		//Находим уведомления, у которых прошло время nextnoty
		UserSubscrNoty.find({nextnoty: {$lte: new Date()}}, {_id: 0}, {lean: true, limit: sendPerStep, sort: {nextnoty: 1}}, function (err, usersNoty) {
			if (err) {
				logger.error(err.message);
				return notifierConveyer();
			}
			if (!usersNoty || !usersNoty.length) {
				return notifierConveyer();
			}
			var userIds = [],
				nowDate = new Date();

			step(
				function () {
					for (var i = usersNoty.length; i--;) {
						userIds.push(usersNoty[i].user);
						sendUserNotice(usersNoty[i].user, usersNoty[i].lastnoty, this.parallel());
					}
				},
				function (err) {
					UserSubscrNoty.update({user: {$in: userIds}}, {$set: {lastnoty: nowDate}, $unset: {nextnoty: 1}}, {multi: true}).exec();
					notifierConveyer();

					if (err) {
						logger.error(err.message);
					}
				}
			);
		});
	}

	return function () {
		setTimeout(conveyerStep, sendFreq);
	};
}());

/**
 * Формируем письмо для пользователя из готовых уведомлений (noty: true) и отправляем его
 * @param userId
 * @param lastnoty Время прошлого уведомления пользователя для подсчета кол-ва новых
 * @param cb
 */
function sendUserNotice(userId, lastnoty, cb) {
	var u = _session.getOnline(null, userId);
	if (u) {
		userProcess(null, u);
	} else {
		User.findOne({_id: userId}, {_id: 1, login: 1, disp: 1, email: 1}, {lean: true}, userProcess);
	}

	function userProcess(err, user) {
		if (err || !user) {
			return cb(err);
		}

		//Ищем все готовые к уведомлению (noty: true) подписки пользователя
		UserSubscr.find({user: userId, noty: true}, {noty: 0}, {lean: true}, function (err, objs) {
			if (err || !objs || !objs.length) {
				return cb(err);
			}

			var noticesId = [],//Массив _id уведомлений, который мы обработаем и сбросим в случае успеха отправки
				objsIdNews = [],
				objsIdPhotos = [],
				i = objs.length;

			while (i--) {
				noticesId.push(objs[i]._id);
				if (objs[i].type === 'news') {
					objsIdNews.push(objs[i].obj);
				} else {
					objsIdPhotos.push(objs[i].obj);
				}
			}

			if (!objsIdNews.length && !objsIdPhotos.length) {
				return finish();
			}

			function finish(err) {
				//Сбрасываем флаг готовности к уведомлению (noty) у всех отправленных объектов
				UserSubscr.update({_id: {$in: noticesId}}, {$unset: {noty: 1}, $set: {ndate: new Date()}}, {multi: true}).exec();
				cb(err);
			}

			step(
				function () {
					if (objsIdNews.length) {
						News.find({_id: {$in: objsIdNews}, ccount: {$gt: 0}}, {_id: 1, cid: 1, title: 1, ccount: 1}, {lean: true}, this.parallel());
					} else {
						this.parallel()(null, []);
					}
					if (objsIdPhotos.length) {
						Photo.find({_id: {$in: objsIdPhotos}, ccount: {$gt: 0}}, {_id: 1, cid: 1, title: 1, ccount: 1}, {lean: true}, this.parallel());
					} else {
						this.parallel()(null, []);
					}
				},
				function (err, news, photos) {
					if (err || ((!news || !news.length) && (!news || !photos.length))) {
						return finish(err);
					}

					//Ищем кол-во непрочитанных комментариев для каждого объекта
					if (news.length) {
						commentController.getNewCommentsBrief(news, lastnoty, user._id, 'news', this.parallel());
					} else {
						this.parallel()(null, []);
					}
					if (photos.length) {
						commentController.getNewCommentsBrief(photos, lastnoty, user._id, null, this.parallel());
					} else {
						this.parallel()(null, []);
					}
				},
				function (err, news, photos) {
					if (err || (!news.length && !photos.length)) {
						return finish(err);
					}
					var newsResult = [],
						photosResult = [],
						obj,
						i;

					//Оставляем только те объекты, у который кол-во новых действительно есть.
					//Если пользователь успел зайти в объект, например, в период выполнения этого шага коневйера,
					//то новые обнулятся и уведомлять об этом объекте уже не нужно
					for (i = news.length; i--;) {
						obj = news[i];
						if (obj.brief && obj.brief.newest) {
							newsResult.push(objProcess(obj));
						}
					}
					for (i = photos.length; i--;) {
						obj = photos[i];
						if (obj.brief && obj.brief.newest) {
							photosResult.push(objProcess(obj));
						}
					}

					function objProcess(obj) {
						obj.briefFormat = {};
						obj.briefFormat.newest = obj.brief.newest + Utils.format.wordEndOfNum(obj.brief.newest, declension.comment);
						if (obj.brief.newest !== obj.brief.unread) {
							obj.briefFormat.unread = obj.brief.unread + Utils.format.wordEndOfNum(obj.brief.unread, declension.commentUnread);
						}
						return obj;
					}

					if (newsResult.length || photosResult.length) {
						//Отправляем письмо с уведомлением, только если есть новые комментарии

						//Сортируем по количеству новых комментариев
						newsResult.sort(sortNotice);
						photosResult.sort(sortNotice);

						mailController.send(
							{
								sender: 'noreply',
								receiver: {alias: user.disp, email: user.email},
								subject: 'Новое уведомление',
								head: true,
								body: noticeTpl({
									username: user.disp,
									greeting: 'Уведомление о событиях на PastVu',
									addr: global.appVar.serverAddr,
									user: user,
									news: newsResult,
									photos: photosResult
								})
							},
							finish
						);
					} else {
						finish();
					}
				}
			);
		});
	}
}
function sortNotice(a, b) {
	return a.brief.newest < b.brief.newest ? 1 : (a.brief.newest > b.brief.newest ? -1 : 0);
}

var subscrPerPage = 24;
function sortSubscr(a, b) {
	return a.cdate < b.cdate ? 1 : (a.cdate > b.cdate ? -1 : 0);
}
//Отдача постраничного списка подписанных объектов пользователя
function getUserSubscr(iAm, data, cb) {
	if (!data || !Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}
	if (!iAm || (iAm.role < 5 && iAm.login !== data.login)) {
		return cb({message: msg.deny, error: true});
	}
	User.findOne({login: data.login}, {_id: 1}, function (err, user) {
		if (err || !user) {
			return cb({message: err && err.message || msg.nouser, error: true});
		}
		var page = (Math.abs(Number(data.page)) || 1) - 1,
			skip = page * subscrPerPage;

		UserSubscr.find({user: user._id, type: data.type}, {_id: 0, obj: 1, cdate: 1, noty: 1}, {lean: true, skip: skip, limit: subscrPerPage, sort: {cdate: -1}}, function (err, subscrs) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (!subscrs || !subscrs.length) {
				return cb({subscr: []});
			}

			var objIds = [],
				subscrHash = {},
				i = subscrs.length;

			while (i--) {
				subscrHash[subscrs[i].obj] = subscrs[i];
				objIds.push(subscrs[i].obj);
			}

			step(
				function () {
					if (data.type === 'news') {
						News.find({_id: {$in: objIds}}, {_id: 1, cid: 1, title: 1, ccount: 1}, {lean: true}, this);
					} else {
						photoController.findPhotosAll({photo: {$in: objIds}}, {_id: 1, cid: 1, title: 1, ccount: 1, file: 1}, {lean: true}, iAm, this);
					}
				},
				function (err, objs) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					if (!objs || !objs.length) {
						return this(null, []);
					}

					//Ищем кол-во новых комментариев для каждого объекта
					commentController.fillNewCommentsCount(objs, user._id, data.type, this.parallel());
					UserSubscr.count({user: user._id, type: 'photo'}, this.parallel());
					UserSubscr.count({user: user._id, type: 'news'}, this.parallel());
					UserSubscrNoty.findOne({user: user._id, nextnoty: {$exists: true}}, {_id: 0, nextnoty: 1}, {lean: true}, this.parallel());
				},
				function (err, objs, countPhoto, countNews, nextNoty) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					for (var i = objs.length; i--;) {
						objs[i].cdate = subscrHash[objs[i]._id].cdate;
						if (subscrHash[objs[i]._id].noty) {
							objs[i].noty = true;
						}
						delete objs[i]._id;
					}
					objs.sort(sortSubscr);

					cb({subscr: objs, countPhoto: countPhoto || 0, countNews: countNews || 0, nextNoty: nextNoty && nextNoty.nextnoty, page: page + 1, perPage: subscrPerPage, type: data.type});
				}
			);
		});
	});
}


module.exports.loadController = function (app, db, io) {
	Settings = db.model('Settings');
	User = db.model('User');
	UserSubscr = db.model('UserSubscr');
	UserSubscrNoty = db.model('UserSubscrNoty');
	News = db.model('News');
	Photo = db.model('Photo');

	fs.readFile(path.normalize('./views/mail/notice.jade'), 'utf-8', function (err, data) {
		if (err) {
			return logger.error('Notice jade read error: ' + err.message);
		}
		noticeTpl = jade.compile(data, {filename: path.normalize('./views/mail/notice.jade'), pretty: false});
		notifierConveyer();
	});

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('subscr', function (data) {
			subscribeUser(hs.session.user, data, function (createData) {
				socket.emit('subscrResult', createData);
			});
		});
		socket.on('giveUserSubscr', function (data) {
			getUserSubscr(hs.session.user, data, function (createData) {
				socket.emit('takeUserSubscr', createData);
			});
		});
	});
};
module.exports.subscribeUserByIds = subscribeUserByIds;
module.exports.commentAdded = commentAdded;
module.exports.commentViewed = commentViewed;
module.exports.userThrottleChange = userThrottleChange;