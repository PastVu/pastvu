'use strict';

var Settings,
	User,
	Photo,
	Comment,
	Counter,
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	logger;

/**
 * Выбирает комментарии для фотографии
 * @param session Сессия польщователя
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsPhoto(session, data, cb) {
	var start = Date.now(),
		commentsArr,
		usersHash = {},
		usersArr = [];
	if (!data || !Utils.isType('object', data)) {
		cb({message: 'Bad params', error: true});
		return;
	}

	step(
		function findPhoto() {
			Photo.findOne({cid: data.cid}, {_id: 1}, this);
		},
		function createCursor(err, pid) {
			if (err || !pid) {
				cb({message: 'No such photo', error: true});
				return;
			}
			Comment.collection.find({photo: pid._id}, {_id: 0, photo: 0}, this);
		},
		function cursorCommentsExtract(err, cursor) {
			if (err || !cursor) {
				cb({message: 'Create cursor error', error: true});
				return;
			}
			cursor.sort({stamp: 1}).toArray(this);
		},
		function (err, comments) {
			if (err || !comments) {
				cb({message: err || 'Cursor extract error', error: true});
				return;
			}
			var i = comments.length,
				userId;

			while (i) {
				userId = comments[--i].user;
				if (usersHash[userId] === undefined) {
					usersHash[userId] = true;
					usersArr.push(userId);
				}
			}

			commentsArr = comments;
			User.collection.find({"_id": { "$in": usersArr }}, {_id: 1, login: 1, avatar: 1, firstName: 1, lastName: 1}, this);
		},
		function cursorUserExtract(err, cursor) {
			if (err || !cursor) {
				cb({message: 'Create user cursor error', error: true});
				return;
			}
			cursor.toArray(this);
		},
		function (err, users) {
			if (err || !users) {
				cb({message: 'Cursor users extract error', error: true});
				return;
			}
			var i,
				comment,
				user,
				userHashFormatted = {},
				userFormatted;

			i = users.length;
			while (i) {
				user = users[--i];
				userFormatted = {
					login: user.login,
					avatar: user.avatar ? '/_avatar/th_' + user.avatar : '/img/caps/avatarth.png',
					name: ((user.firstName && (user.firstName + ' ') || '') + (user.lastName || '')) || user.login
				};
				userHashFormatted[user.login] = usersHash[user._id] = userFormatted;
			}

			i = commentsArr.length;
			while (i) {
				comment = commentsArr[--i];
				comment.user = usersHash[comment.user].login;
				if (comment.level === undefined) {
					comment.level = 0;
				}
			}

			console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', cid: data.cid, comments: commentsArr, users: userHashFormatted});
		}
	);
}

/**
 * Создает комментарий для фотографии
 * @param session Сессия польщователя
 * @param data Объект
 * @param cb Коллбэк
 */
function createComment(session, data, cb) {
	if (!session.user || !session.user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}
	if (!Utils.isType('object', data) || !data.photo || !data.txt) {
		cb({message: 'Bad params', error: true});
		return;
	}

	var content = data.txt,
		comment;
	step(
		function () {
			Photo.findOne({cid: Number(data.photo)}, {_id: 1}, this.parallel());
			Counter.increment('comment', this.parallel());
			if (data.parent) {
				Comment.findOne({cid: data.parent}, {_id: 0, level: 1}, this.parallel());
			}
		},
		function (err, photo, count, parent) {
			if (err || !photo || !count) {
				cb({message: err.message || 'Increment comment counter error', error: true});
				return;
			}
			if (data.parent && (!parent || data.level !== (parent.level || 0) + 1)) {
				cb({message: 'Something wrong with parent comment', error: true});
				return;
			}
			comment = {
				cid: count.next,
				photo: photo,
				user: session.user,
				txt: content
			};
			if (data.parent) {
				comment.parent = data.parent;
				comment.level = data.level;
			}
			var commentObj = new Comment(comment);
			commentObj.save(this);
		},
		function (err) {
			if (err) {
				cb({message: err.message || 'Comment save error', error: true});
				return;
			}
			session.user.ccount += 1;
			session.user.save(this.parallel());
			Photo.update({cid: data.photo}, {$inc: {ccount: 1}}, this.parallel());
		},
		function (err) {
			if (err) {
				cb({message: err.message, error: true});
				return;
			}
			comment.user = session.user.login;
			comment.photo = data.photo;
			if (comment.level === undefined) {
				comment.level = 0;
			}
			cb({message: 'ok', comment: comment});
		}
	);
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("comment.js");

	Settings = db.model('Settings');
	User = db.model('User');
	Photo = db.model('Photo');
	Comment = db.model('Comment');
	Counter = db.model('Counter');


	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveCommentsPhoto', function (data) {
			getCommentsPhoto(hs.session, data, function (result) {
				socket.emit('takeCommentsPhoto', result);
			});
		});

		socket.on('createComment', function (data) {
			createComment(hs.session, data, function (result) {
				socket.emit('createCommentResult', result);
			});
		});

	});
};