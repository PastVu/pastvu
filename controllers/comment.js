'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	UserCommentsView,
	Photo,
	News,
	Comment,
	CommentN,
	Counter,
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	appEnv = {},
	host,
	logger,

	weekMS = ms('7d'),
	msg = {
		deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
		noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
		noComments: 'Операции с комментариями на этой странице запрещены'
	},

	photoController = require('./photo.js'),
	subscrController = require('./subscr.js');

var core = {
	getCommentsObj: function (iAm, data, cb) {
		var commentsArr,
			commentModel,
			commentObject,
			usersHash = {},
			previousView;

		if (data.type === 'news') {
			commentModel = CommentN;
		} else {
			commentModel = Comment;
		}

		step(
			function findObj() {
				if (data.type === 'news') {
					News.findOne({cid: data.cid}, {_id: 1, nocomments: 1}, this);
				} else {
					photoController.findPhoto({cid: data.cid}, null, iAm, this);
				}
			},
			function (err, obj) {
				if (err || !obj) {
					return cb({message: err && err.message || msg.noObject, error: true});
				}
				commentObject = obj;
				commentModel.find({obj: obj._id}, {_id: 0, obj: 0, hist: 0}, {lean: true, sort: {stamp: 1}}, this.parallel());

				if (iAm) {
					//Если это авторизованный пользователь, берём последнее время просмотра комментариев объекта
					//и отмечаем в менеджере подписок, что просмотрели комментарии объекта
					UserCommentsView.findOneAndUpdate({obj: obj._id, user: iAm._id}, {$set: {stamp: new Date()}}, {new: false, upsert: true, select: {_id: 0, stamp: 1}}, this.parallel());
					subscrController.commentViewed(obj._id, iAm);
				}
			},
			function (err, comments, userView) {
				if (err || !comments) {
					return cb({message: err && err.message || 'Cursor extract error', error: true});
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

				if (userView) {
					previousView = userView.stamp;
				}

				commentsArr = comments;
				User.find({_id: {$in: usersArr}}, {_id: 1, login: 1, avatar: 1, disp: 1, ranks: 1}, {lean: true}, this);
			},
			function (err, users) {
				if (err || !users) {
					return cb({message: err && err.message || 'Cursor users extract error', error: true});
				}
				var	user,
					userFormattedHash = {},
					canModerate,
					canReply,
					commentsTree,
					i;

				i = users.length;
				while (i--) {
					user = users[i];
					user.avatar = user.avatar ? '/_a/h/' + user.avatar : '/img/caps/avatarth.png';
					user.online = _session.us[user.login] !== undefined; //Для скорости смотрим непосредственно в хеше, без функции isOnline
					userFormattedHash[user.login] = usersHash[user._id] = user;
					delete user._id;
				}

				if (iAm) {
					if (data.type === 'photo' && photoController.permissions.canModerate(commentObject, iAm) || data.type === 'news' && iAm.role > 9) {
						//Если это модератор данной фотографии или администратор новости
						canModerate = canReply = true;
						commentsTree = commentsTreeBuildcanModerate(iAm, commentsArr, usersHash, previousView);
					} else if (!commentObject.nocomments) {
						//Если это зарегистрированный пользователь и комментарии к объекту разрешены
						canReply = true;
						commentsTree = commentsTreeBuildCanReply(iAm, commentsArr, usersHash, previousView);
					} else {
						//В противном случае отдаем простое дерево, как для анонимов
						commentsTree = commentsTreeBuild(commentsArr, usersHash);
					}
				} else {
					commentsTree = commentsTreeBuild(commentsArr, usersHash);
				}

				cb(null, {comments: commentsTree.tree, countTotal: commentsArr.length, countNew: commentsTree.countNew, users: userFormattedHash, canModerate: canModerate, canReply: canReply, previousView: previousView});
			}
		);
	}
};

function commentsTreeBuild(comments, usersHash) {
	var i = 0,
		len = comments.length,
		hash = {},
		comment,
		commentParent,
		tree = [];

	for (; i < len; i++) {
		comment = comments[i];
		comment.user = usersHash[comment.user].login;
		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = hash[comment.parent];
			if (commentParent.comments === undefined) {
				commentParent.comments = [];
			}
			commentParent.comments.push(comment);
		} else {
			tree.push(comment);
		}
		hash[comment.cid] = comment;
	}

	return {tree: tree};
}

function commentsTreeBuildCanReply(iAm, comments, usersHash, previousViewStamp) {
	var weekAgo = Date.now() - 604800000,
		myLogin = iAm.login,
		commentParent,
		comment,
		hash = {},
		len = comments.length,
		countNew = 0,
		tree = [],
		i = 0;

	for (; i < len; i++) {
		comment = comments[i];
		comment.user = usersHash[comment.user].login;
		comment.can = {};
		if (comment.user === myLogin && comment.stamp > weekAgo) {
			comment.can.edit = comment.can.del = true;
		}
		if (previousViewStamp && comment.stamp > previousViewStamp && comment.user !== myLogin) {
			comment.isnew = true;
			countNew++;
		}
		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = hash[comment.parent];
			if (commentParent.comments === undefined) {
				if (commentParent.can.del === true) {
					//Если родителю вставляем первый дочерний комментарий, и пользователь может удалить родительский,
					//т.е. это его комментарий, отменяем возможность удаления,
					//т.к. пользователь не может удалять свои не последние комментарии
					delete commentParent.can.del;
				}
				commentParent.comments = [];
			}
			commentParent.comments.push(comment);
		} else {
			tree.push(comment);
		}
		hash[comment.cid] = comment;
	}

	return {tree: tree, countNew: countNew};
}
function commentsTreeBuildcanModerate(iAm, comments, usersHash, previousViewStamp) {
	var myLogin = iAm.login,
		commentParent,
		comment,
		hash = {},
		len = comments.length,
		countNew = 0,
		tree = [],
		i = 0;

	for (; i < len; i++) {
		comment = comments[i];
		comment.user = usersHash[comment.user].login;

		if (previousViewStamp && comment.stamp > previousViewStamp && comment.user !== myLogin) {
			comment.isnew = true;
			countNew++;
		}
		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = hash[comment.parent];
			if (commentParent.comments === undefined) {
				commentParent.comments = [];
			}
			commentParent.comments.push(comment);
		} else {
			tree.push(comment);
		}
		hash[comment.cid] = comment;
	}

	return {tree: tree, countNew: countNew};
}

/**
 * Выбирает комментарии для объекта
 * @param iAm
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsObj(iAm, data, cb) {
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}

	data.cid = Number(data.cid);
	core.getCommentsObj(iAm, data, function (err, result) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb(_.assign(result, {message: 'ok', cid: data.cid}));
	});
}


var commentsUserPerPage = 15;
/**
 * Выбирает комментарии для пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsUser(data, cb) {
	var /*start = Date.now(),*/
		commentsArr;

	if (!data || !Utils.isType('object', data) || !data.login) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function findUser() {
			User.getUserID(data.login, this);
		},
		function createCursor(err, userid) {
			if (err || !userid) {
				return cb({message: err && err.message || 'No such user', error: true});
			}
			var page = (Math.abs(Number(data.page)) || 1) - 1,
				skip = page * commentsUserPerPage;

			Comment.collection.find({user: userid, hidden: {$exists: false}}, {_id: 0, lastChanged: 1, cid: 1, obj: 1, stamp: 1, txt: 1}, {sort: [
				['stamp', 'desc']
			], skip: skip, limit: commentsUserPerPage}, this);
		},
		Utils.cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				return cb({message: err && err.message || 'Cursor extract error', error: true});
			}
			var i = comments.length,
				photoId,
				photosArr = [],
				photosExistsHash = {};

			while (i) {
				photoId = comments[--i].obj;
				if (photosExistsHash[photoId] === undefined) {
					photosExistsHash[photoId] = true;
					photosArr.push(photoId);
				}
			}

			commentsArr = comments;
			Photo.collection.find({_id: {$in: photosArr}}, {_id: 1, cid: 1, file: 1, title: 1, year: 1, year2: 1}, this);
		},
		Utils.cursorExtract,
		function (err, photos) {
			if (err || !photos) {
				return cb({message: err && err.message || 'Cursor photos extract error', error: true});
			}
			var i,
				comment,
				commentsArrResult = [],
				photo,
				photoFormatted,
				photoFormattedHashId = {},
				photoFormattedHashCid = {};

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
				photoFormattedHashCid[photo.cid] = photoFormattedHashId[photo._id] = photoFormatted;
			}

			//Для каждого комментария проверяем существование публичной фотографии и присваиваем ему cid фотографии
			i = commentsArr.length;
			while (i) {
				comment = commentsArr[--i];
				if (photoFormattedHashId[comment.obj] !== undefined) {
					comment.obj = photoFormattedHashId[comment.obj].cid;
					commentsArrResult.push(comment);
				}
			}

			//console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', page: data.page, comments: commentsArrResult, photos: photoFormattedHashCid});
		}
	);
}

/**
 * Выбирает последние комментарии по публичным фотографиям
 * @param data Объект
 * @param cb Коллбэк
 */
var getCommentsFeed = (function () {
	var query = {hidden: null},
		selector = {_id: 0, cid: 1, obj: 1, user: 1, txt: 1},
		options = {lean: true, limit: 30, sort: {stamp: -1}};

	return Utils.memoizeAsync(function calcStats(handler) {
		var //start = Date.now(),
			commentsArr,
			photosHash = {},
			usersHash = {};

		step(
			function createCursor() {
				Comment.find(query, selector, options, this);
			},
			function (err, comments) {
				if (err || !comments) {
					return handler({message: err && err.message || 'Comments get error', error: true});
				}
				var i = comments.length,
					photoId,
					photosArr = [],
					userId,
					usersArr = [];

				while (i--) {
					photoId = comments[i].obj;
					if (photosHash[photoId] === undefined) {
						photosHash[photoId] = true;
						photosArr.push(photoId);
					}
					userId = comments[i].user;
					if (usersHash[userId] === undefined) {
						usersHash[userId] = true;
						usersArr.push(userId);
					}
				}

				commentsArr = comments;
				Photo.find({_id: {$in: photosArr}}, {_id: 1, cid: 1, file: 1, title: 1}, {lean: true}, this.parallel());
				User.find({_id: {$in: usersArr}}, {_id: 1, login: 1, disp: 1}, {lean: true}, this.parallel());
			},
			function (err, photos, users) {
				if (err || !photos || !users) {
					return handler({message: err && err.message || 'Cursor extract error', error: true});
				}
				var i,
					comment,
					photo,
					photoFormatted,
					photoFormattedHash = {},
					user,
					userFormatted,
					userFormattedHash = {};

				for (i = photos.length; i--;) {
					photo = photos[i];
					photoFormatted = {
						cid: photo.cid,
						file: photo.file,
						title: photo.title
					};
					photoFormattedHash[photo.cid] = photosHash[photo._id] = photoFormatted;
				}
				for (i = users.length; i--;) {
					user = users[i];
					userFormatted = {
						login: user.login,
						disp: user.disp,
						online: _session.us[user.login] !== undefined //Для скорости смотрим непосредственно в хеше, без функции isOnline
					};
					userFormattedHash[user.login] = usersHash[user._id] = userFormatted;
				}

				for (i = commentsArr.length; i--;) {
					comment = commentsArr[i];
					comment.obj = photosHash[comment.obj].cid;
					comment.user = usersHash[comment.user].login;
				}

				//console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
				handler({message: 'ok', comments: commentsArr, photos: photoFormattedHash, users: userFormattedHash});
			}
		);
	}, ms('15s'));
}());

/**
 * Создает комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function createComment(socket, data, cb) {
	if (!socket.handshake.session.user) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !Number(data.obj) || !data.txt || data.level > 9) {
		return cb({message: 'Bad params', error: true});
	}

	var iAm = socket.handshake.session.user,
		cid = Number(data.obj),
		obj,
		commentModel,
		content = data.txt,
		comment,
		fragAdded = data.type === 'photo' && !data.frag && Utils.isType('object', data.fragObj),
		fragObj;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	step(
		function findObjectAndParent() {
			if (data.type === 'news') {
				News.findOne({cid: cid}, {_id: 1, ccount: 1, nocomments: 1}, this.parallel());
			} else {
				photoController.findPhoto({cid: cid}, null, iAm, this.parallel());
			}

			if (data.parent) {
				commentModel.findOne({cid: data.parent}, {_id: 0, level: 1}, this.parallel());
			}
		},
		function counterUp(err, o, parent) {
			if (err || !o) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			if (o.nocomments && (!iAm.role || iAm.role < 10)) {
				return cb({message: msg.noComments, error: true}); //Operations with comments on this page are prohibited
			}
			if (data.type === 'photo' && o.s < 2) {
				return cb({message: 'Comments for new photo are not allowed', error: true});
			}
			if (data.parent && (!parent || parent.level >= 9 || data.level !== (parent.level || 0) + 1)) {
				return cb({message: 'Something wrong with parent comment', error: true});
			}

			obj = o;

			Counter.increment('comment', this);
		},
		function (err, countC) {
			if (err || !countC) {
				return cb({message: err && err.message || 'Increment comment counter error', error: true});
			}

			comment = {
				cid: countC.next,
				obj: obj,
				user: iAm,
				txt: Utils.inputIncomingParse(content)
			};
			if (data.parent) {
				comment.parent = data.parent;
				comment.level = data.level;
			}
			if (obj.s !== undefined && obj.s !== 5) {
				comment.hidden = true;
			}
			if (fragAdded) {
				comment.frag = true;
			}
			new commentModel(comment).save(this);
		},
		function (err, savedComment) {
			if (err) {
				return cb({message: err.message || 'Comment save error', error: true});
			}
			if (fragAdded) {
				fragObj = {
					cid: savedComment.cid,
					l: Utils.math.toPrecision(data.fragObj.l || 0, 2),
					t: Utils.math.toPrecision(data.fragObj.t || 0, 2),
					w: Utils.math.toPrecision(data.fragObj.w || 100, 2),
					h: Utils.math.toPrecision(data.fragObj.h || 100, 2)
				};
				obj.frags.push(fragObj);
			}

			obj.ccount = (obj.ccount || 0) + 1;
			obj.save(this.parallel());

			if (!savedComment.hidden) {
				iAm.ccount += 1;
				iAm.save(this.parallel());
			}
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			comment.user = iAm.login;
			comment.obj = cid;
			comment.can = {};
			if (comment.level === undefined) {
				comment.level = 0;
			}
			_session.emitUser(iAm.login, socket);
			cb({message: 'ok', comment: comment, frag: fragObj});

			subscrController.commentAdded(obj._id, iAm);
		}
	);
}

/**
 * Удаляет комментарий
 * @param socket Сокет пользователя
 * @param data
 * @param cb Коллбэк
 */
function removeComment(socket, data, cb) {
	if (!socket.handshake.session.user) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}
	var cid = Number(data.cid),
		iAm = socket.handshake.session.user,
		obj,
		hashComments = {},
		hashUsers = {},
		arrComments = [],
		countCommentsRemoved,
		commentModel;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	step(
		function () {
			commentModel.findOne({cid: cid}, {_id: 0, obj: 1, user: 1, stamp: 1}, this);
		},
		function findObj(err, comment) {
			if (err || !comment) {
				return cb({message: err && err.message || 'No such comment', error: true});
			}
			//Проверяем есть ли роль, либо это владелец и комментарий моложе недели
			var can = iAm.role > 4 || (comment.user.equals(iAm._id) && comment.stamp > (Date.now() - weekMS));
			if (!can) {
				return cb({message: msg.deny, error: true});
			}

			if (data.type === 'news') {
				News.findOne({_id: comment.obj}, {_id: 1, ccount: 1, nocomments: 1}, this.parallel());
			} else {
				photoController.findPhoto({_id: comment.obj}, null, iAm, this.parallel());
			}
		},
		function createCursor(err, o) {
			if (err || !o) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			if (o.nocomments && (!iAm.role || iAm.role < 10)) {
				return cb({message: msg.noComments, error: true}); //Operations with comments on this page are prohibited
			}

			obj = o;
			commentModel.collection.find({obj: obj._id}, {_id: 0, obj: 0, stamp: 0, txt: 0}, {sort: [
				['stamp', 'asc']
			]}, this.parallel());
		},
		Utils.cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				return cb({message: err && err.message || 'Cursor extract error', error: true});
			}
			var i = -1,
				len = comments.length,
				comment;

			while (++i < len) {
				comment = comments[i];
				if (comment.cid === cid || (comment.level && hashComments[comment.parent] !== undefined)) {
					hashComments[comment.cid] = comment;
					//Если комментарий скрыт, то его уже не надо вычитать из статистики пользователя
					if (!comment.hidden) {
						hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
					}
					arrComments.push(comment.cid);
				}
			}

			//Если обычный пользователь удаляет свой комментарий, то убеждаемся, что у него нет потомков, т.е. он один
			if (iAm.role < 5 && arrComments.length > 1) {
				return cb({message: msg.deny, error: true});
			}

			commentModel.remove({cid: {$in: arrComments}}, this);
		},
		function (err, countRemoved) {
			if (err) {
				return cb({message: err.message || 'Comment remove error', error: true});
			}
			var frags = obj.frags && obj.frags.toObject(),
				user,
				i,
				u;

			if (frags) {
				for (i = frags.length; i--;) {
					if (hashComments[frags[i].cid] !== undefined) {
						obj.frags.id(frags[i]._id).remove();
					}
				}
			}

			obj.ccount -= countRemoved;
			obj.save(this.parallel());

			for (u in hashUsers) {
				if (hashUsers[u] !== undefined) {
					user = _session.getOnline(null, u);
					if (user !== undefined) {
						user.ccount = user.ccount - hashUsers[u];
						_session.saveEmitUser(user.login, null, null, this.parallel());
					} else {
						User.update({_id: u}, {$inc: {ccount: -hashUsers[u]}}, this.parallel());
					}
				}
			}

			countCommentsRemoved = countRemoved;
		},
		function (err) {
			if (err) {
				return cb({message: err.message || 'Object or user update error', error: true});
			}
			var myCountRemoved = hashUsers[iAm._id] || 0; //Кол-во моих комментариев

			cb({message: 'Ok', frags: obj.frags && obj.frags.toObject(), countComments: countCommentsRemoved, myCountComments: myCountRemoved, countUsers: Object.keys(hashUsers).length});
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
	if (!socket.handshake.session.user) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !data.obj || !Number(data.cid) || !data.txt) {
		return cb({message: 'Bad params', error: true});
	}
	var cid = Number(data.cid),
		iAm = socket.handshake.session.user,
		fragRecieved;

	step(
		function () {
			if (data.type === 'news') {
				CommentN.findOne({cid: cid}, this.parallel());
				News.findOne({cid: data.obj}, {cid: 1, frags: 1, nocomments: 1}, this.parallel());
			} else {
				Comment.findOne({cid: cid}, this.parallel());
				photoController.findPhoto({cid: data.obj}, null, iAm, this.parallel());
			}
		},
		function (err, comment, obj) {
			if (err || !comment || !obj || data.obj !== obj.cid) {
				return cb({message: err && err.message || 'No such comment', error: true});
			}
			if (obj.nocomments && (!iAm.role || iAm.role < 10)) {
				return cb({message: msg.noComments, error: true}); //Operations with comments on this page are prohibited
			}

			var i,
				can = iAm.role > 4 || (comment.user.equals(iAm._id) && comment.stamp > (Date.now() - weekMS)),
				hist = {user: iAm},
				content,
				fragExists,
				fragChangedType,
				txtChanged;

			if (!can) {
				return cb({message: msg.deny, error: true});
			}
			content = Utils.inputIncomingParse(data.txt);

			if (obj.frags) {
				for (i = obj.frags.length; i--;) {
					if (obj.frags[i].cid === comment.cid) {
						fragExists = obj.frags[i];
						break;
					}
				}
			}

			fragRecieved = data.type === 'photo' && data.fragObj && {
				cid: comment.cid,
				l: Utils.math.toPrecision(data.fragObj.l || 0, 2),
				t: Utils.math.toPrecision(data.fragObj.t || 0, 2),
				w: Utils.math.toPrecision(data.fragObj.w || 100, 2),
				h: Utils.math.toPrecision(data.fragObj.h || 100, 2)
			};

			if (fragRecieved) {
				if (!fragExists) {
					//Если фрагмент получен и его небыло раньше, просто вставляем полученный
					fragChangedType = 1;
					comment.frag = true;
					obj.frags.push(fragRecieved);
				} else if (fragRecieved.l !== fragExists.l || fragRecieved.t !== fragExists.t || fragRecieved.w !== fragExists.w || fragRecieved.h !== fragExists.h) {
					//Если фрагмент получен, он был раньше, но что-то в нем изменилось, то удаляем старый и вставляем полученный
					fragChangedType = 2;
					obj.frags.pull(fragExists._id);
					obj.frags.push(fragRecieved);
				}
			} else if (fragExists) {
				//Если фрагмент не получен, но раньше он был, то просто удаляем старый
				fragChangedType = 3;
				comment.frag = undefined;
				obj.frags.pull(fragExists._id);
			}

			if (content !== comment.txt) {
				hist.txt = comment.txt;
				txtChanged = true;
			}

			if (txtChanged || fragChangedType) {
				hist.frag = fragChangedType || undefined;
				comment.hist.push(hist);
				comment.lastChanged = new Date();

				comment.txt = content;
				comment.save(this.parallel());
				if (fragChangedType) {
					obj.save(this.parallel());
				}
			} else {
				this(null, comment);
			}
		},
		function (err, comment) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb({message: 'ok', comment: comment.toObject({transform: commentDeleteHist}), frag: fragRecieved});
		}
	);
}
function commentDeleteHist(doc, ret, options) {
	delete ret.hist;
}

function objectDeleteId(doc, ret, options) {
	delete ret._id;
}

/**
 * Возвращает историю редактирования комментария
 * В базе история хранится по строкам. В одной строке содердится одно событие.
 * Такое событие может содержать 2 паказателя: изменение текста и(или) фрагмента.
 * Причем в это событие текст комментария сохраняется старый, т.е.
 * писался он в комментарий в другое время (во время другого события),
 * а флаг изменения фрагмента относится именно к этому событию.
 * Следовательно одна строка содержит события 2-х разных времен.
 * Для представления этого в более нормальном по временной шкале виде
 * необходимо изменение текста переносить во времена события предыдущего изменения текста, а
 * текущие событие отражать только если в нём есть изменение фрагмента или в будущем будет изменение текста и
 * оно будет установленно именно временем этого события
 * Т.е. событие реально отражается, если в нем есть изменениеи фрагмента или изменение текста в другом событии в будущем
 * @param data Объект
 * @param cb Коллбэк
 */
function giveCommentHist(data, cb) {
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}
	var commentModel;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	step(
		function counters() {
			commentModel.findOne({cid: Number(data.cid)}, {_id: 0, user: 1, txt: 1, stamp: 1, hist: 1}).populate({path: 'user hist.user', select: {_id: 0, login: 1, avatar: 1, disp: 1}}).exec(this);
		},
		function (err, comment) {
			if (err || !comment) {
				return cb({message: err && err.message || 'No such comment', error: true});
			}
			var i,
				hist,
				hists = comment.hist.toObject({ transform: objectDeleteId }),
				lastTxtIndex = 0, //Позиция последнего изменение текста в стеке событий
				lastTxtObj = {user: comment.user, stamp: comment.stamp}, //Первое событие изменения текста будет равнятся созданию комментария
				result = [];

			for (i = 0; i < hists.length; i++) {
				hist = hists[i];
				if (hist.txt) {
					//Если присутствует текст, то вставляем его в прошлую запись, сменившую текст
					lastTxtObj.txt = hist.txt;
					if (!lastTxtObj.frag) {
						//Если в той записи небыло фрагмента, значит она не вставлялась и запись надо вставить
						result.splice(lastTxtIndex, 0, lastTxtObj);
					}
					//Из этого события удаляем текст и оно встает на ожидание следующего изменения текста
					delete hist.txt;
					lastTxtIndex = result.length;
					lastTxtObj = hist;
				}
				//Если в записи есть изменение фрагмента, то вставляем её
				if (hist.frag) {
					result.push(hist);
				}
				//Если это последняя запись в истории и ранее была смена текста,
				//то необходимо вставить текущий текст комментария в эту последнюю запись изменения текста
				if (i === hists.length - 1 && lastTxtIndex > 0) {
					lastTxtObj.txt = comment.txt;
					if (!lastTxtObj.frag) {
						result.splice(lastTxtIndex, 0, lastTxtObj);
					}
				}
			}
			cb({hists: result});
		}
	);
}

/**
 * Переключает возможность комментирования объекта
 * @param socket Сокет пользователя
 * @param data
 * @param cb Коллбэк
 */
function setNoComments(socket, data, cb) {
	var cid = data && Number(data.cid),
		iAm = socket.handshake.session && socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !cid) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function () {
			if (data.type === 'news') {
				News.findOne({cid: cid}, this);
			} else {
				photoController.findPhoto({cid: cid}, null, iAm, this);
			}
		},
		function createCursor(err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			obj.nocomments = data.val ? true : undefined;
			obj.save(this);
		},
		function (err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || 'Save error', error: true});
			}
			cb({message: 'Ok', nocomments: obj.nocomments});
		}
	);
}

/**
 * Скрывает комментарии объекта (делает их не публичными)
 * @param oid _id объекта
 * @param hide Скрыть или наоборот
 * @param iAm Пользователь сессии, считаем сколько его комментариев затронуто
 * @param cb Коллбэк
 */
function hideObjComments(oid, hide, iAm, cb) {
	step(
		function () {
			var command = {};
			if (hide) {
				command.$set = {hidden: true};
			} else {
				command.$unset = {hidden: 1};
			}
			Comment.update({obj: oid}, command, {multi: true}, this);
		},
		function (err, count) {
			if (err) {
				return cb(err);
			}
			if (count === 0) {
				return cb(null, {myCount: 0});
			}
			Comment.collection.find({obj: oid}, this);
		},
		Utils.cursorExtract,
		function (err, comments) {
			if (err) {
				return cb(err);
			}
			var i,
				len = comments.length,
				cdelta,
				user,
				comment,
				hashUsers = {};

			for (i = 0; i < len; i++) {
				comment = comments[i];
				hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
			}
			for (i in hashUsers) {
				if (hashUsers[i] !== undefined) {
					cdelta = hide ? -hashUsers[i] : hashUsers[i];
					user = _session.getOnline(null, i);
					if (user !== undefined) {
						user.ccount = user.ccount + cdelta;
						_session.saveEmitUser(null, i);
					} else {
						User.update({_id: i}, {$inc: {ccount: cdelta}}).exec();
					}
				}
			}
			cb(null, {myCount: hashUsers[iAm._id] || 0});
		}
	);
}

/**
 * Вставляет время просмотра объекта пользователем, если его еще нет
 * @param objId
 * @param userId
 * @param cb
 */
function upsertCommentsView(objId, userId, cb) {
	UserCommentsView.update({obj: objId, user: userId}, {$setOnInsert: {stamp: new Date()}}, {upsert: true}).exec(cb);
}
/**
 * Удаляет время просмотра объекта, если указан _id пользователя, то только у него
 * @param objId
 * @param userId Опционально. Без этого параметра удалит время просмотра у всех пользователей
 * @param cb
 */
function dropCommentsView(objId, userId, cb) {
	var query = {obj: objId};
	if (userId) {
		query.user = userId;
	}
	UserCommentsView.remove(query, cb);
}

/**
 * Находим количество новых комментариев для списка объектов для пользователя
 * @param objIds Массив _id объектов
 * @param type Тип объекта
 * @param userId _id пользователя
 * @param cb
 */
function getNewCommentsCount(objIds, userId, type, cb) {
	var objIdsWithCounts = [];

	step(
		function () {
			UserCommentsView.find({obj: {$in: objIds}, user: userId}, {_id: 0, obj: 1, stamp: 1}, {lean: true}, this);
		},
		function (err, views) {
			if (err) {
				return cb(err);
			}
			var i,
				commentModel,
				objId,
				stamp,
				stampsHash = {};

			if (type === 'news') {
				commentModel = CommentN;
			} else {
				commentModel = Comment;
			}

			//Собираем хеш {idPhoto: stamp}
			for (i = views.length; i--;) {
				stampsHash[views[i].obj] = views[i].stamp;
			}

			//Запоняем массив id объектов теми у которых действительно
			//есть последние посещения, и по каждому считаем кол-во комментариев с этого посещения
			for (i = objIds.length; i--;) {
				objId = objIds[i];
				stamp = stampsHash[objId];
				if (stamp !== undefined) {
					objIdsWithCounts.push(objId);
					commentModel.count({obj: objId, stamp: {$gt: stamp}, user: {$ne: userId}}, this.parallel());
				}
			}
			this.parallel()();
		},
		function (err, counts) {
			if (err) {
				return cb(err);
			}
			var i,
				countsHash = {};

			//Собираем хеш {idPhoto: commentsNewCount}
			for (i = 0; i < objIdsWithCounts.length; i++) {
				countsHash[objIdsWithCounts[i]] = arguments[i + 1] || 0;
			}

			cb(null, countsHash);
		}
	);
}

/**
 * Заполняет для каждого из массива переданных объектов кол-во новых комментариев - поле ccount_new
 * Т.е. модифицирует исходные объекты
 * @param objs Массив объектов
 * @param type Тип объекта
 * @param userId _id пользователя
 * @param cb
 */
function fillNewCommentsCount(objs, userId, type, cb) {
	var objIdsWithCounts = [],
		obj,
		i = objs.length;

	//Составляем массив id объектов, у которых есть комментарии
	while (i) {
		obj = objs[--i];
		if (obj.ccount) {
			objIdsWithCounts.push(obj._id);
		}
	}

	if (!objIdsWithCounts.length) {
		cb(null, objs);

	} else {
		getNewCommentsCount(objIdsWithCounts, userId, type, function (err, countsHash) {
			if (err) {
				return cb(err);
			}

			//Присваиваем каждому объекту количество новых комментариев, если они есть
			for (i = objs.length; i--;) {
				obj = objs[i];
				if (countsHash[obj._id]) {
					obj.ccount_new = countsHash[obj._id];
				}
			}
			cb(null, objs);
		});
	}
}


/**
 * Находим количество новых комментариев для формирования письма уведомления пользователю
 * @param objs Массив _id объектов
 * @param newestFromDate Время, с которого считается кол-во новых
 * @param userId _id пользователя
 * @param type Тип объекта
 * @param cb
 */
function getNewCommentsBrief(objs, newestFromDate, userId, type, cb) {
	var commentModel = type === 'news' ? CommentN : Comment,
		objIdsWithCounts = [],
		objIds = [],
		i = objs.length;

	while (i) {
		objIds.push(objs[--i]._id);
	}

	step(
		function () {
			UserCommentsView.find({obj: {$in: objIds}, user: userId}, {_id: 0, obj: 1, stamp: 1}, {lean: true}, this);
		},
		function (err, views) {
			if (err) {
				return cb(err);
			}
			var i,
				objId,
				stamp,
				stampsHash = {};

			//Собираем хеш {idPhoto: stamp}
			for (i = views.length; i--;) {
				stampsHash[views[i].obj] = views[i].stamp;
			}

			//Запоняем массив id объектов теми у которых действительно есть последние посещения,
			//и по каждому выбираем комментарии со времени stamp
			for (i = objIds.length; i--;) {
				objId = objIds[i];
				stamp = stampsHash[objId];
				if (stamp !== undefined) {
					objIdsWithCounts.push(objId);
					commentModel
						.find({obj: objId, stamp: {$gt: stamp}, user: {$ne: userId}}, {_id: 0, user: 1, stamp: 1}, {lean: true, sort: {stamp: 1}})
						.populate({path: 'user', select: {_id: 0, login: 1, disp: 1}})
						.exec(this.parallel());
				}
			}
			if (!objIdsWithCounts.length) {
				this();
			}
		},
		function (err) {
			if (err) {
				return cb(err);
			}
			var i,
				j,
				obj,
				comment,
				comments,
				briefsHash = {};

			for (i = 0; i < objIdsWithCounts.length; i++) {
				comments = arguments[i + 1];
				obj = {unread: comments.length, newest: 0, users: {}};

				for (j = 0; j < comments.length; j++) {
					comment = comments[j];
					if (!newestFromDate || comment.stamp > newestFromDate) {
						obj.newest++;
						obj.users[comment.user.login] = comment.user.disp;
					}
				}
				briefsHash[objIdsWithCounts[i]] = obj;
			}

			//Присваиваем каждому объекту brief
			for (i = objs.length; i--;) {
				obj = objs[i];
				obj.brief = briefsHash[obj._id];
			}
			cb(null, objs);
		}
	);
}


module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("comment.js");
	appEnv = app.get('appEnv');
	host = appEnv.serverAddr.host;

	Settings = db.model('Settings');
	User = db.model('User');
	Photo = db.model('Photo');
	News = db.model('News');
	Comment = db.model('Comment');
	CommentN = db.model('CommentN');
	Counter = db.model('Counter');
	UserCommentsView = db.model('UserCommentsView');

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
		socket.on('giveCommentHist', function (data) {
			giveCommentHist(data, function (result) {
				socket.emit('takeCommentHist', result);
			});
		});

		socket.on('removeComment', function (data) {
			removeComment(socket, data, function (result) {
				socket.emit('removeCommentResult', result);
			});
		});

		socket.on('setNoComments', function (data) {
			setNoComments(socket, data, function (result) {
				socket.emit('setNoCommentsResult', result);
			});
		});

		socket.on('giveCommentsObj', function (data) {
			getCommentsObj(socket.handshake.session.user, data, function (result) {
				socket.emit('takeCommentsObj', result);
			});
		});
		socket.on('giveCommentsUser', function (data) {
			getCommentsUser(data, function (result) {
				socket.emit('takeCommentsUser', result);
			});
		});
		socket.on('giveCommentsFeed', function () {
			getCommentsFeed(function (result) {
				socket.emit('takeCommentsFeed', result);
			});
		});
	});

};
module.exports.hideObjComments = hideObjComments;
module.exports.upsertCommentsView = upsertCommentsView;
module.exports.dropCommentsView = dropCommentsView;
module.exports.getNewCommentsCount = getNewCommentsCount;
module.exports.fillNewCommentsCount = fillNewCommentsCount;
module.exports.getNewCommentsBrief = getNewCommentsBrief;