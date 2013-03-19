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
 * Создает фотографии в базе данных
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
			Photo.findOne({cid: data.cid}, {_id:1}, this);
		},
		function createCursor(err, pid) {
			if (err || !pid) {
				cb({message: 'No such photo', error: true});
				return;
			}
			Comment.collection.find({photo: pid._id}, {_id:0, photo: 0}, this);
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
			var i = users.length,
				tree,
				user,
				userHashFormatted = {},
				userFormatted;

			while (i) {
				user = users[--i];
				userFormatted = {
					login: user.login,
					avatar: user.avatar,
					name: user.firstName || user.lastName || user.login
				};
				userHashFormatted[user.login] = userFormatted;
				usersHash[user._id] = userFormatted;
			}
			tree = commentTreeRecursive(commentsArr, usersHash);

			//console.dir(userHashFormatted);
			//console.dir(tree);
			console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', cid: data.cid, comments: tree, users: userHashFormatted, count: commentsArr.length});
		}
	);
}

function commentTreeRecursive(arr, usersHash) {
	var i = -1,
		len = arr.length,
		hash = {},
		comment,
		commentParent,
		results = [];

	while (++i < len) {
		comment = arr[i];
		hash[comment.cid] = comment;
		comment.user = usersHash[comment.user].login;
		if (typeof comment.parent === 'number' && comment.parent > 0) {
			commentParent = hash[comment.parent];
			comment.level = commentParent.level + 1;
			if (commentParent.comments === undefined) {
				commentParent.comments = [];
			}
			commentParent.comments.push(comment);
		} else {
			comment.level = 0;
		}
	}
	i = -1;
	while (++i < len) {
		comment = hash[arr[i].cid];
		if (comment.parent === undefined) {
			results.push(comment);
		}
	}

	return results;
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

	});
};