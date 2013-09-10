'use strict';

var fs = require('fs'),
	path = require('path'),
	auth = require('./auth.js'),
	jade = require('jade'),
	_session = require('./_session.js'),
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
		comment: [' новый комментарий', ' новых комментария', ' новых комментариев']
	},

	throttle = ms('1m'),
	sendFreq = 2000, //Частота шага конвейера отправки в ms
	sendPerStep = 4; //Кол-во отправляемых уведомлений за шаг конвейера

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
				UserSubscr.update({obj: obj._id, user: user._id}, {$set: {type: data.type}}, {upsert: true, multi: false}, this);
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

function commentAdded(objId, user) {
	UserSubscr.find({obj: objId, user: {$ne: user._id}, noty: {$exists: false}}, {_id: 1, user: 1}, {lean: true}, function (err, objs) {
		if (err) {
			return logger.error(err.message);
		}
		if (!objs || !objs.length) {
			return;
		}

		var ids = [],
			users = [],
			i = objs.length;

		while (i--) {
			ids.push(objs[i]._id);
			users.push(objs[i].user);
		}

		UserSubscr.update({_id: {$in: ids}}, {$set: {noty: true}}, {multi: true}, function (err) {
			if (err) {
				return logger.error(err.message);
			}
			notifyUsers(users);
		});
	});
}

function notifyUsers(users) {
	//Находим время последнего и следующего уведомления каждого пользователя,
	//чтобы определить, нужно ли вычислять следующее
	UserSubscrNoty.find({user: {$in: users}}, {_id: 0}, {lean: true}, function (err, usersNoty) {
		if (err) {
			return logger.error(err.message);
		}
		var userId,
			now = Date.now(),
			usersNotyHash = {},
			nearestNoticeTimeStamp = now + 10000, //Ближайшее уведомление для пользователей, у которых не было предыдущих
			lastNoty,
			nextNoty,
			i;

		for (i = usersNoty.length; i--;) {
			//Если у пользователя еще не установленно время следующего уведомления, расчитываем его

			if (usersNoty[i].nextnoty) {
				//Значит у этого пользователя уже запланированно уведомление и ничего делать не надо
				usersNotyHash[usersNoty[i].user] = false;
			} else {
				lastNoty = usersNoty[i].lastnoty;

				//Если прошлого уведомления еще не было или с его момента прошло больше времени,
				//чем throttle или осталось менее 10сек, ставим ближайший
				if (lastNoty) {
					nextNoty = usersNoty[i].lastnoty.getTime() + throttle - now;

					if (nextNoty < 10000) {
						nextNoty = nearestNoticeTimeStamp;
					}
				} else {
					nextNoty = nearestNoticeTimeStamp;
				}
				usersNotyHash[usersNoty[i].user] = nextNoty;
			}
		}

		for (i = users.length; i--;) {
			userId = users[i];
			if (usersNotyHash[userId] !== false) {
				UserSubscrNoty.update({user: userId}, {$set: {nextnoty: new Date(usersNotyHash[userId] || nearestNoticeTimeStamp)}}, {upsert: true}).exec();
			}
		}
	});
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
						sendUserNotice(usersNoty[i].user, this.parallel());
					}
				},
				function (err) {
					UserSubscrNoty.update({user: {$in: userIds}}, {$set: {lastnoty: nowDate}, $unset: {nextnoty: 1}}, {milti: true}).exec();
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
 * @param cb
 */
function sendUserNotice(userId, cb) {
	var u = _session.getOnline(null, userId);
	if (u) {
		userProcess(null, u);
	} else {
		User.findOne({_id: userId}, {_id: 0, login: 1, disp: 1, email: 1}, {lean: true}, userProcess);
	}

	function userProcess(err, user) {
		if (err || !user) {
			return cb(err);
		}

		//Ищем все готовые к уведомлению (noty: true) подписки пользователя
		UserSubscr.find({user: userId, noty: true}, {_id: 1, obj: 1, type: 1}, {lean: true}, function (err, objs) {
			if (err || !objs || !objs.length) {
				return cb(err);
			}

			var notysId = [],//Массив _id уведомлений, который мы обработаем и сбросим в случае успеха отправки
				objsIdNews = [],
				objsIdPhotos = [],
				i = objs.length;

			while (i--) {
				notysId.push(objs[i]._id);
				if (objs.type === 'news') {
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
				UserSubscr.update({_id: {$in: notysId}}, {$unset: {noty: 1}}, {milti: true}).exec();
				cb(err);
			}

			step(
				function () {
					if (objsIdNews.length) {
						News.find({_id: {$in: objsIdNews}}, {_id: 1, cid: 1, title: 1, ccount: 1}, {lean: true}, this.parallel());
					} else {
						this.parallel()(null, []);
					}
					if (objsIdPhotos.length) {
						Photo.find({_id: {$in: objsIdPhotos}}, {_id: 1, cid: 1, title: 1, ccount: 1}, {lean: true}, this.parallel());
					} else {
						this.parallel()(null, []);
					}
				},
				function (err, news, photos) {
					if (err || ((!news || !news.length) && (!news || !photos.length))) {
						return finish(err);
					}

					//Ищем кол-во новых комментариев для каждого объекта
					if (news.length) {
						commentController.fillNewCommentsCount(news, user._id, 'news', this.parallel());
					} else {
						this.parallel()(null, []);
					}
					if (photos.length) {
						commentController.fillNewCommentsCount(photos, user._id, null, this.parallel());
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
						i;

					//Оставляем только те объекты, у который кол-во новых действительно есть.
					//Если пользователь успел зайти в объект, например, в период выполнения этого шага коневйера,
					//то новые обнулятся и уведомлять об этом объекте уже не нужно
					for (i = news.length; i--;) {
						if (news[i].ccount_new) {
							news[i].ccount_new_format = news[i].ccount_new + Utils.format.wordEndOfNum(news[i].ccount_new, declension);
							newsResult.push(news[i]);
						}
					}
					for (i = photos.length; i--;) {
						if (photos[i].ccount_new) {
							photos[i].ccount_new_format = photos[i].ccount_new + Utils.format.wordEndOfNum(photos[i].ccount_new, declension.comment);
							photosResult.push(photos[i]);
						}
					}

					//Сортируем по количеству новых комментариев
					newsResult.sort(sortNotice);
					photosResult.sort(sortNotice);

					if (newsResult.length || photosResult.length) {
						//Отправляем письмо с уведомлением, только если есть новые комментарии
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
	return a.ccount_new < b.ccount_new ? 1 : (a.ccount_new > b.ccount_new ? -1 : 0);
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
	});
};
module.exports.commentAdded = commentAdded;