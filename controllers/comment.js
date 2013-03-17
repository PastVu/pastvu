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
	var start = Date.now();
	if (!data || !Utils.isType('object', data)) {
		cb({message: 'Bad params', error: true});
		return;
	}

	step(
		function findPhoto() {
			Photo.findOne({cid: data.cid}, {_id:1}, this);
		},
		function findComments(err, pid) {
			if (err || !pid) {
				cb({message: 'No such photo', error: true});
				return;
			}
			Comment.find({photo: pid}, {_id:0, photo: 0}).sort({stamp: 1}).populate('user', {/*_id:0, */login: 1, avatar: 1, firstName: 1, lastName: 1}).exec(this);
		},
		function transComments(err, comments) {
			if (err || !comments) {
				cb({message: 'Getting photo comments error', error: true});
				return;
			}
			var startTree = Date.now(),
				tree = commentTreeRecursive2(comments);

			console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			//console.dir(tree);

			cb({message: 'ok', comments: tree, count: comments.length});
		}
	);
}

function commentTreeRecursive2(arr) {
	var i = -1,
		len = arr.length,
		hash = {},
		comment,
		commentParent,
		results = [];

	while (++i < len) {
		comment = arr[i].toObject();
		hash[comment.cid] = comment;
		comment.user.name = comment.user.firstName || comment.user.lastName || comment.user.login;
		if (typeof comment.parent === 'number' && comment.parent > 0) {
			commentParent = hash[comment.parent];
			if (commentParent.comments === undefined) {
				commentParent.comments = [];
			}
			commentParent.comments.push(comment);
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