'use strict';

var _session = require('./_session.js'),
	Settings,
	User,
	_ = require('lodash'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	appEnv = {},
	host,
	logger,

	Chat,
	ChatRecord,

	msgMaxLength = 2e3,
	msg = {
		deny: 'У вас нет разрешения на это действие'
	};

var core = {
	//Отдача списков чатов, доступных для пользователя
	getUserChats: (function () {
		var chatSelectFields = {_id: 0, cid: 1, multi: 1, members: 1},
			chatSelectOptions = {lean: true, sort: {last: -1}},
			chatClosedSelectFields = {_id: 0, cid: 1, multi: 1, members: 1, closed: 1},
			chatClosedSelectOptions = {lean: true, sort: {create: -1}};

		return function (iAm, data, cb) {
			var myUser = iAm.login === data.login;

			step(
				function () {
					if (myUser) {
						this(null, iAm._id);
					} else {
						User.getUserID(data.login, this);
					}
				},
				function (err, userid) {
					if (err || !userid) {
						return cb({message: err && err.message || 'No such user', error: true});
					}
					//Активные чаты, в которых участвует пользователь
					Chat.find({members: userid, closed: null}, chatSelectFields, chatSelectOptions, this.parallel());
					//Активные мультичаты, из которых пользователь вышел сам (выйти можно только из мультичата)
					Chat.find({members_off: userid, closed: null}, chatSelectFields, chatSelectOptions, this.parallel());
					//Закрытые мультичаты или мультичаты, из которых пользователя удалил админ чата
					Chat.find({$or: [
						{closed: true, $or: [
							{members: userid},
							{members_off: userid}
						]},
						{members_del: userid}
					]}, chatClosedSelectFields, chatClosedSelectOptions, this.parallel());
				},
				function (err, chats, chats_off, chats_archive) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					//TODO: Архивные мультичаты брать только кол-во
					//TODO: Выбирать members для показа аватар в списке, возможно populate
				}
			);

			cb(null);
		};
	}())
};

/**
 * Выбирает чаты доступные для пользователя
 * @param iAm
 * @param data Объект
 * @param cb Коллбэк
 */
function getUserChats(iAm, data, cb) {
	if (!Utils.isType('object', data) || !data.login) {
		return cb({message: 'Bad params', error: true});
	}
	if (!iAm || data.login !== iAm.login && iAm.role !== 11) {
		return cb({message: msg.deny, error: true});
	}

	core.getUserChats(iAm, data, function finish(err, result) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb(_.assign(result, {message: 'ok', cid: data.cid}));
	});
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("comment.js");
	appEnv = app.get('appEnv');
	host = appEnv.serverAddr.host;

	Settings = db.model('Settings');
	Chat = db.model('Chat');
	ChatRecord = db.model('ChatRecord');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveUserChats', function (data) {
			getUserChats(hs.session.user, data, function (result) {
				socket.emit('takeUserChats', result);
			});
		});
	});

};
module.exports.core = core;