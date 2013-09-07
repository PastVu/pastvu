'use strict';

var fs = require('fs'),
	path = require('path'),
	auth = require('./auth.js'),
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
	photoController = require('./photo.js'),

	msg = {
		deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
		noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
		nouser: 'Requested user does not exist'
	};

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

function commentAdded(obj, user) {
	UserSubscr.find({obj: obj._id, user: {$ne: user._id}, noty: {$exists: false}}, {_id: 1, user: 1}, {lean: true}, function (err, objs) {
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


/**
 * Формируем письмо для пользователя из готовых уведомлений и отправляем его
 * @param userId
 */
function sendUserNotice(userId) {
	User.findOne({_id: userId}, {_id: 0, disp: 1, email: 1}, {lean: true}, function (err, user) {
		if (err) {
			return logger.error(err.message);
		}
		if (!user) {
			return;
		}

		//Ищем все готовые к уведомлению (noty: true) подписки пользователя
		UserSubscr.find({user: userId, noty: true}, {_id: 1, obj: 1, type: 1}, {lean: true}, function (err, objs) {
			if (err) {
				return logger.error(err.message);
			}
			if (!objs || !objs.length) {
				return;
			}

			var nitysId = [],//Массив _id уведомлений, который мы обработаем и сбросим в случае успеха отправки
				objsIdNews = [],
				objsIdPhotos = [],
				i = objs.length;

			while (i--) {
				nitysId.push(objs[i]._id);
				if (objs.type === 'news') {
					objsIdNews.push(objs[i].obj);
				} else {
					objsIdPhotos.push(objs[i].obj);
				}
			}

			if (!objsIdNews.length && !objsIdPhotos.length) {
				return;
			}

			step (
				function () {
					if (objsIdNews.length) {
						News.find({_id: {$in: objsIdNews}}, {_id: 0, cid: 1, title: 1}, {lean: true}, this.parallel());
					}
					if (objsIdPhotos.length) {
						News.find({_id: {$in: objsIdPhotos}}, {_id: 0, cid: 1, title: 1}, {lean: true}, this.parallel());
					}
				},
				function (err, news, photos) {
					if (err) {
						return logger.error(err.message);
					}

					noticeTpl({news: news, photos: photos});
				}
			);
		});
	});
}

var userWaitings = {};
function notifyUsers(users) {
	for (var i = users.length; i--;) {
		if (!userWaitings[users[i]]) {
			userWaitings[users[i]] = setTimeout(function () {

			});
		}
	}
}

module.exports.loadController = function (app, db, io) {
	Settings = db.model('Settings');
	User = db.model('User');
	UserSubscr = db.model('UserSubscr');
	UserSubscrNoty = db.model('UserSubscrNoty');
	News = db.model('News');
	Photo = db.model('Photo');

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