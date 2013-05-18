'use strict';

var auth = require('./auth.js'),
	Settings,
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


function cursorExtract(err, cursor) {
	if (err || !cursor) {
		this(err || {message: 'Create cursor error', error: true});
		return;
	}
	cursor.toArray(this);
}

/**
 * Выбирает комментарии для фотографии
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsPhoto(data, cb) {
	var //start = Date.now(),
		commentsArr,
		usersHash = {};

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
			Comment.collection.find({photo: pid._id}, {_id: 0, photo: 0}, {sort: [
				['stamp', 'asc']
			]}, this);
		},
		cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				cb({message: err || 'Cursor extract error', error: true});
				return;
			}
			var i = comments.length,
				userId,
				usersArr = [];

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
		cursorExtract,
		function (err, users) {
			if (err || !users) {
				cb({message: 'Cursor users extract error', error: true});
				return;
			}
			var i,
				comment,
				user,
				userFormatted,
				userFormattedHash = {};

			i = users.length;
			while (i) {
				user = users[--i];
				userFormatted = {
					login: user.login,
					avatar: user.avatar ? '/_avatar/th_' + user.avatar : '/img/caps/avatarth.png',
					name: ((user.firstName && (user.firstName + ' ') || '') + (user.lastName || '')) || user.login
				};
				userFormattedHash[user.login] = usersHash[user._id] = userFormatted;
			}

			i = commentsArr.length;
			while (i) {
				comment = commentsArr[--i];
				comment.user = usersHash[comment.user].login;
				if (comment.level === undefined) {
					comment.level = 0;
				}
			}

			//console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', cid: data.cid, comments: commentsArr, users: userFormattedHash});
		}
	);
}


var commentsUserPerPage = 15;
/**
 * Выбирает комментарии
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsUser(data, cb) {
	var start = Date.now(),
		commentsArr,
		photosHash = {};

	if (!data || !Utils.isType('object', data) || !data.login) {
		cb({message: 'Bad params', error: true});
		return;
	}

	step(
		function findUser() {
			User.findOne({login: data.login}, {_id: 1}, this);
		},
		function createCursor(err, uid) {
			if (err || !uid) {
				cb({message: 'No such user', error: true});
				return;
			}
			var page = (Math.abs(Number(data.page)) || 1) - 1,
				skip = page * commentsUserPerPage;
			Comment.collection.find({user: uid._id}, {_id: 0, cid: 1, photo: 1, stamp: 1, txt: 1}, { skip: skip, limit: commentsUserPerPage, sort: [
				['stamp', 'desc']
			]}, this);
		},
		cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				cb({message: err || 'Cursor extract error', error: true});
				return;
			}
			var i = comments.length,
				photoId,
				photosArr = [];

			while (i) {
				photoId = comments[--i].photo;
				if (photosHash[photoId] === undefined) {
					photosHash[photoId] = true;
					photosArr.push(photoId);
				}
			}

			commentsArr = comments;
			Photo.collection.find({"_id": { "$in": photosArr }}, {_id: 1, cid: 1, file: 1, title: 1, year: 1, year2: 1}, this);
		},
		cursorExtract,
		function (err, photos) {
			if (err || !photos) {
				cb({message: 'Cursor photos extract error', error: true});
				return;
			}
			var i,
				comment,
				photo,
				photoFormatted,
				photoFormattedHash = {};

			i = photos.length;
			while (i) {
				photo = photos[--i];
				photoFormatted = {
					cid: photo.cid,
					file: photo.file,
					title: photo.title,
					year: photo.year,
					year2: photo.year2
				};
				photoFormattedHash[photo.cid] = photosHash[photo._id] = photoFormatted;
			}

			i = commentsArr.length;
			while (i) {
				comment = commentsArr[--i];
				comment.photo = photosHash[comment.photo].cid;
			}

			//console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', page: data.page, comments: commentsArr, photos: photoFormattedHash});
		}
	);
}

/**
 * Выбирает комментарии для фотографии
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsRibbon(data, cb) {
	var start = Date.now(),
		commentsArr,
		photosHash = {};

	if (!data || !Utils.isType('object', data)) {
		cb({message: 'Bad params', error: true});
		return;
	}

	step(
		function createCursor() {
			var limit = data.limit || 15;
			Comment.collection.find({}, {_id: 0, cid: 1, photo: 1, txt: 1}, { limit: limit, sort: [
				['stamp', 'desc']
			]}, this);
		},
		cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				cb({message: err || 'Cursor extract error', error: true});
				return;
			}
			var i = comments.length,
				photoId,
				photosArr = [];

			while (i) {
				photoId = comments[--i].photo;
				if (photosHash[photoId] === undefined) {
					photosHash[photoId] = true;
					photosArr.push(photoId);
				}
			}

			commentsArr = comments;
			Photo.collection.find({"_id": { "$in": photosArr }}, {_id: 1, cid: 1, file: 1, title: 1}, this);
		},
		cursorExtract,
		function (err, photos) {
			if (err || !photos) {
				cb({message: 'Cursor photos extract error', error: true});
				return;
			}
			var i,
				comment,
				photo,
				photoFormatted,
				photoFormattedHash = {};

			i = photos.length;
			while (i) {
				photo = photos[--i];
				photoFormatted = {
					cid: photo.cid,
					file: photo.file,
					title: photo.title
				};
				photoFormattedHash[photo.cid] = photosHash[photo._id] = photoFormatted;
			}

			i = commentsArr.length;
			while (i) {
				comment = commentsArr[--i];
				comment.photo = photosHash[comment.photo].cid;
			}

			//console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', page: data.page, comments: commentsArr, photos: photoFormattedHash});
		}
	);
}

/**
 * Создает комментарий для фотографии
 * @param socket Сокет пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function createComment(socket, data, cb) {
	if (!Utils.isType('object', data) || !data.photo || !data.txt || data.level > 9) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var user = socket.handshake.session.user,
		content = data.txt,
		comment,
		photoObj,
		fragAdded = !data.frag && Utils.isType('object', data.fragObj),
		fragObj,
		countComment;

	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	step(
		function counters() {
			Counter.increment('comment', this);
		},
		function (err, countC) {
			if (err || !countC) {
				cb({message: (err && err.message) || 'Increment comment counter error', error: true});
				return;
			}
			countComment = countC.next;
			if (fragAdded) {
				fragObj = {
					cid: countComment,
					l: Utils.math.toPrecision(data.fragObj.l || 0, 2),
					t: Utils.math.toPrecision(data.fragObj.t || 0, 2),
					w: Utils.math.toPrecision(data.fragObj.w || 100, 2),
					h: Utils.math.toPrecision(data.fragObj.h || 100, 2)
				};
			}

			Photo.findOne({cid: Number(data.photo)}, {_id: 1, ccount: 1, frags: 1}, this.parallel());
			if (data.parent) {
				Comment.findOne({cid: data.parent}, {_id: 0, level: 1}, this.parallel());
			}
		},
		function (err, photo, parent) {
			if (err || !photo) {
				cb({message: err.message || 'No such photo', error: true});
				return;
			}
			if (data.parent && (!parent || parent.level >= 9 || data.level !== (parent.level || 0) + 1)) {
				cb({message: 'Something wrong with parent comment', error: true});
				return;
			}
			photoObj = photo;

			comment = {
				cid: countComment,
				photo: photo,
				user: user,
				txt: content
			};
			if (data.parent) {
				comment.parent = data.parent;
				comment.level = data.level;
			}
			if (fragAdded) {
				comment.frag = true;
			}
			new Comment(comment).save(this);
		},
		function (err) {
			if (err) {
				cb({message: err.message || 'Comment save error', error: true});
				return;
			}

			photoObj.ccount = (photoObj.ccount || 0) + 1;
			if (fragAdded) {
				photoObj.frags.push(fragObj);
			}
			photoObj.save(this.parallel());

			user.ccount += 1;
			user.save(this.parallel());
		},
		function (err) {
			if (err) {
				cb({message: err.message, error: true});
				return;
			}
			comment.user = user.login;
			comment.photo = data.photo;
			if (comment.level === undefined) {
				comment.level = 0;
			}
			auth.sendMe(socket);
			cb({message: 'ok', comment: comment, frag: fragObj});
		}
	);
}

/**
 * Редактирует комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function updateComment(socket, data, cb) {
	if (!Utils.isType('object', data) || !data.photo || !Utils.isType('number', data.cid) || !data.txt) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var user = socket.handshake.session.user,
		fragRecieved;

	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	step(
		function counters() {
			Comment.findOne({cid: data.cid}, {user: 0}).populate('photo', {cid: 1, frags: 1}).exec(this);
		},
		function (err, comment) {
			if (err || !comment || data.photo !== comment.photo.cid) {
				cb({message: (err && err.message) || 'No such comment', error: true});
				return;
			}
			var i,
				hist = {user: user},
				fragExists,
				fragChanged,
				txtChanged;

			if (comment.photo.frags) {
				for (i = comment.photo.frags.length; i--;) {
					if (comment.photo.frags[i].cid === comment.cid) {
						fragExists = comment.photo.frags[i];
						break;
					}
				}
			}

			fragRecieved = data.fragObj && {
				cid: comment.cid,
				l: Utils.math.toPrecision(data.fragObj.l || 0, 2),
				t: Utils.math.toPrecision(data.fragObj.t || 0, 2),
				w: Utils.math.toPrecision(data.fragObj.w || 100, 2),
				h: Utils.math.toPrecision(data.fragObj.h || 100, 2)
			};

			if (fragRecieved) {
				if (!fragExists) {
					//Если фрагмент получен и его небыло раньше, просто вставляем полученный
					fragChanged = true;
					comment.frag = true;
					comment.photo.frags.push(fragRecieved);
				} else if (fragRecieved.l !== fragExists.l || fragRecieved.t !== fragExists.t || fragRecieved.w !== fragExists.w || fragRecieved.h !== fragExists.h) {
					//Если фрагмент получен, он был раньше, но что-то в нем изменилось, то удаляем старый и вставляем полученный
					fragChanged = true;
					comment.photo.frags.pull(fragExists._id);
					comment.photo.frags.push(fragRecieved);
				}
			} else if (fragExists) {
				//Если фрагмент не получен, но раньше он был, то просто удаляем старый
				fragChanged = true;
				comment.frag = undefined;
				comment.photo.frags.pull(fragExists._id);
			}

			if (data.txt !== comment.txt) {
				hist.txt = comment.txt;
				txtChanged = true;
			}

			if (txtChanged || fragChanged) {
				hist.frag = fragChanged || undefined;
				comment.hist.push(hist);
				comment.lastChanged = new Date();

				comment.txt = data.txt;
				comment.save(this.parallel());
				if (fragChanged) {
					comment.photo.save(this.parallel());
				}
			} else {
				this(null, comment);
			}
		},
		function (err, comment) {
			if (err) {
				cb({message: err.message, error: true});
				return;
			}
			cb({message: 'ok', comment: comment, frag: fragRecieved});
		}
	);
}

/**
 * Удаляет комментарий
 * @param socket Сокет пользователя
 * @param cid
 * @param cb Коллбэк
 */
function removeComment(socket, cid, cb) {
	if (!Utils.isType('number', cid)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var user = socket.handshake.session.user,
		photoObj,
		hashComments = {},
		hashUsers = {},
		arrComments = [],
		countCommentsRemoved;

	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}


	step(
		function () {
			Comment.findOne({cid: cid}, {photo: 1}, this);
		},
		function findPhoto(err, comment) {
			Photo.findOne({_id: comment.photo}, {_id: 1, ccount: 1, frags: 1}, this.parallel());
		},
		function createCursor(err, photo) {
			if (err || !photo) {
				cb({message: (err && err.message) || 'No such photo', error: true});
				return;
			}
			photoObj = photo;
			Comment.collection.find({photo: photo._id}, {_id: 0, photo: 0, stamp: 0, txt: 0}, {sort: [
				['stamp', 'asc']
			]}, this.parallel());
		},
		cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				cb({message: (err && err.message) || 'Cursor extract error', error: true});
				return;
			}
			var i = -1,
				len = comments.length,
				comment;

			while (++i < len) {
				comment = comments[i];
				if (comment.cid === cid || (comment.level > 0 && hashComments[comment.parent] !== undefined)) {
					hashComments[comment.cid] = comment;
					hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
					arrComments.push(comment.cid);
				}
			}
			Comment.remove({cid: {$in: arrComments}}, this);
		},
		function (err, countRemoved) {
			if (err) {
				cb({message: err.message || 'Comment remove error', error: true});
				return;
			}
			var frags = photoObj.frags.toObject(),
				i = frags.length,
				u;
			while (i--) {
				if (hashComments[frags[i].cid] !== undefined) {
					photoObj.frags.id(frags[i]._id).remove();
				}
			}
			photoObj.ccount -= countRemoved;
			photoObj.save(this.parallel());

			for (u in hashUsers) {
				if (hashUsers[u] !== undefined) {
					User.update({_id: u}, {$inc: {ccount: -hashUsers[u]}}, this.parallel());
				}
			}
			countCommentsRemoved = countRemoved;
		},
		function (err) {
			if (err) {
				cb({message: err.message || 'Photo or user update error', error: true});
				return;
			}
			// Если среди удаляемых комментариев есть мой, вычитаем их из сессии и отправляем "обновленного себя"
			if (hashUsers[user._id] !== undefined) {
				user.ccount -= hashUsers[user._id];
				auth.sendMe(socket);
			}
			cb({message: 'Removed ' + countCommentsRemoved + ' comments from ' + Object.keys(hashUsers).length + ' users', frags: photoObj.frags.toObject(), countComments: countCommentsRemoved});
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

		socket.on('createComment', function (data) {
			createComment(socket, data, function (result) {
				socket.emit('createCommentResult', result);
			});
		});
		socket.on('updateComment', function (data) {
			updateComment(socket, data, function (result) {
				socket.emit('updateCommentResult', result);
			});
		});

		socket.on('removeComment', function (data) {
			removeComment(socket, data, function (result) {
				socket.emit('removeCommentResult', result);
			});
		});

		socket.on('giveCommentsPhoto', function (data) {
			getCommentsPhoto(data, function (result) {
				socket.emit('takeCommentsPhoto', result);
			});
		});
		socket.on('giveCommentsUser', function (data) {
			getCommentsUser(data, function (result) {
				socket.emit('takeCommentsUser', result);
			});
		});
		socket.on('giveCommentsRibbon', function (data) {
			getCommentsRibbon(data, function (result) {
				socket.emit('takeCommentsRibbon', result);
			});
		});

	});
};