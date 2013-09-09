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

	msg = {
		deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
		noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
		nouser: 'Requested user does not exist'
	},

	noticeTpl,

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
				UserSubscr.update({obj: obj._id}, {$set: {user: user._id, type: data.type}}, {upsert: true, multi: false}, this);
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

//Каждые sendFreq ms отправляем sendPerStep уведомлений
var notifierConveyer = (function () {

	function conveyerStep() {
		UserSubscrNoty.find({nextnoty: {$lte: new Date()}}, {_id: 0}, {lean: true, limit: sendPerStep, sort: {nextnoty: 1}}, function (err, usersNoty) {
			if (err) {
				return this(err);
			}
			if (!usersNoty || !usersNoty.length) {
				return notifierConveyer();
			}
			var userIds = [],
				nowDate = new Date();

			step(
				function () {
					var i = usersNoty.length;

					while (i--) {
						userIds.push(usersNoty[i].user);
						sendUserNotice(usersNoty[i].user, this.parallel());
					}
				},
				function (err) {
					if (err) {
						return logger.error(err.message);
					}
					UserSubscrNoty.update({user: {$in: userIds}}, {$set: {lastnoty: nowDate}, $unset: {nextnoty: 1}}, {milti: true}).exec();
					notifierConveyer();
				}
			);
		});
	}

	return function () {
		setTimeout(conveyerStep, sendFreq);
	};
}());

/**
 * Формируем письмо для пользователя из готовых уведомлений и отправляем его
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
				return cb();
			}

			step(
				function () {
					if (objsIdNews.length) {
						News.find({_id: {$in: objsIdNews}}, {_id: 0, cid: 1, title: 1}, {lean: true}, this.parallel());
					} else {
						this.parallel()(null, []);
					}
					if (objsIdPhotos.length) {
						Photo.find({_id: {$in: objsIdPhotos}}, {_id: 0, cid: 1, title: 1}, {lean: true}, this.parallel());
					} else {
						this.parallel()(null, []);
					}
				},
				function (err, news, photos) {
					if (err || ((!news || !news.length) && (!news || !photos.length))) {
						return cb(err);
					}

					//Отправляем письмо с уведомлением
					console.dir(noticeTpl({user: user, news: news, photos: photos}));
					mailController.send2(
						{
							sender: 'noreply',
							receiver: {alias: user.disp, email: user.email},
							subject: 'Новое уведомление',
							body: noticeTpl({user: user, news: news, photos: photos})
						},
						this
					);
				},
				function (err) {
					if (err) {
						return cb(err);
					}
					//Сбрасываем флаг готовности к уведомлению (noty) у всех отправленных объектов
					UserSubscr.update({_id: {$in: notysId}}, {$unset: {noty: 1}}, {milti: true}, cb);
				}
			);
		});
	}
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
		noticeTpl = jade.compile(data, {pretty: false});
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