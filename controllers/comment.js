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
		noComments: 'Операции с комментариями на этой странице запрещены',
		noCommentExists: 'Комментария не существует'
	},

	actionLogController = require('./actionlog.js'),
	regionController = require('./region.js'),
	photoController = require('./photo.js'),
	subscrController = require('./subscr.js'),

	permissions = {
		canModerate: function (type, obj, user) {
			return user && (type === 'photo' && photoController.permissions.canModerate(obj, user) || type === 'news' && user.role > 9);
		},
		canEdit: function (comment, obj, user) {
			return user && !obj.nocomments && comment.user.equals(user._id) && comment.stamp > (Date.now() - weekMS);
		},
		canReply: function (type, obj, user) {
			return user && !obj.nocomments && (type === 'photo' && obj.s > 1 || type === 'news');
		}
	};

var core = {
	//Упрощенная отдача комментариев анонимным пользователям
	getCommentsObjAnonym: function (data, cb) {
		var commentsArr,
			commentModel,
			usersHash = {};

		if (data.type === 'news') {
			commentModel = CommentN;
			News.findOne({cid: data.cid}, {_id: 1}, findComments);
		} else {
			commentModel = Comment;
			photoController.findPhoto({cid: data.cid}, null, null, findComments);
		}

		function findComments(err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}

			step(
				function () {
					commentModel.find({obj: obj._id, del: null}, {_id: 0, obj: 0, hist: 0, del: 0}, {lean: true, sort: {stamp: 1}}, this);
				},
				function (err, comments) {
					if (err || !comments) {
						return cb({message: err && err.message || 'Cursor extract error', error: true});
					}
					var i = comments.length,
						userId,
						usersArr;

					commentsArr = comments;

					if (i) {
						usersArr = [];
						while (i--) {
							userId = String(comments[i].user);
							if (usersHash[userId] === undefined) {
								usersHash[userId] = true;
								usersArr.push(userId);
							}
						}

						getUsersHashForComments(usersArr, this);
					} else {
						this(null, {}, {});
					}

				},
				function (err, usersById, usersByLogin) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					cb(null, {comments: commentsArr.length ? commentsTreeBuildAnonym(commentsArr, usersById).tree : [], countTotal: commentsArr.length, users: usersByLogin});
				}
			);
		}
	},
	getCommentsObjAuth: function (iAm, data, cb) {
		var commentModel;

		if (data.type === 'news') {
			commentModel = CommentN;
			News.findOne({cid: data.cid}, {_id: 1, nocomments: 1}, findComments);
		} else {
			commentModel = Comment;
			photoController.findPhoto({cid: data.cid}, null, iAm, findComments);
		}

		function findComments(err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			var canModerate,
				canReply;

			step(
				function () {
					//Берём все комментарии
					commentModel.find({obj: obj._id}, {_id: 0, obj: 0, hist: 0, 'del.reason': 0}, {lean: true, sort: {stamp: 1}}, this.parallel());
					//Берём последнее время просмотра комментариев объекта
					UserCommentsView.findOneAndUpdate({obj: obj._id, user: iAm._id}, {$set: {stamp: new Date()}}, {new: false, upsert: true, select: {_id: 0, stamp: 1}}, this.parallel());
					//Отмечаем в менеджере подписок, что просмотрели комментарии объекта
					subscrController.commentViewed(obj._id, iAm);
				},
				function (err, comments, userView) {
					if (err || !comments) {
						return cb({message: err && err.message || 'Cursor extract error', error: true});
					}
					var previousViewStamp = userView && userView.stamp && userView.stamp.getTime();

					canModerate = permissions.canModerate(data.type, obj, iAm);
					canReply = canModerate || permissions.canReply(data.type, obj, iAm);

					if (comments.length) {
						if (canModerate) {
							//Если это модератор данной фотографии или администратор новости
							commentsTreeBuildCanModerate(String(iAm._id), comments, previousViewStamp, this);
						} else {
							//Если это зарегистрированный пользователь
							commentsTreeBuildAuth(String(iAm._id), comments, previousViewStamp, !obj.nocomments, this);
						}
					} else {
						this(null, {tree: [], users: {}, countTotal: 0, countNew: 0});
					}
				},
				function (err, commentsTree) {
					if (err) {
						return cb({message: err.message, error: true});
					}

					cb(null, {comments: commentsTree.tree, users: commentsTree.users, countTotal: commentsTree.countTotal, countNew: commentsTree.countNew, canModerate: canModerate, canReply: canReply});
				}
			);
		}
	},
	getDelTree: function (iAm, data, cb) {
		var commentModel;

		if (data.type === 'news') {
			commentModel = CommentN;
		} else {
			commentModel = Comment;
		}

		commentModel.findOne({cid: data.cid, del: {$exists: true}}, {_id: 0, hist: 0, del: 0}, {lean: true}, function (err, comment) {
			if (err || !comment) {
				return cb({message: err && err.message || msg.noCommentExists, error: true});
			}
			var canModerate;

			step(
				function () {
					//Находим объект, которому принадлежит комментарий
					if (data.type === 'news') {
						News.findOne({_id: comment.obj}, {_id: 1, nocomments: 1}, this.parallel());
					} else {
						photoController.findPhoto({_id: comment.obj}, null, iAm, this.parallel());
					}
					//Берём все удаленные комментарии, оставленные позже запрашиваемого удалённого, и ниже его уровнем
					commentModel.find({obj: comment.obj, del: {$exists: true}, stamp: {$gte: comment.stamp}, level: {$gt: comment.level || 0}}, {_id: 0, obj: 0, hist: 0, del: 0}, {lean: true, sort: {stamp: 1}}, this.parallel());
					delete comment.obj;
				},
				function (err, obj, childs) {
					if (err || !obj) {
						return cb({message: err && err.message || msg.noObject, error: true});
					}
					canModerate = permissions.canModerate(data.type, obj, iAm);
					commentsTreeBuildDel(comment, childs, canModerate ? undefined : String(iAm._id), this);
				},
				function (err, commentsTree) {
					if (err) {
						return cb({message: err.message, error: true});
					}

					cb(null, {comments: commentsTree.tree, users: commentsTree.users});
				}
			);
		});
	}
};

function commentsTreeBuildAnonym(comments, usersHash) {
	var i = 0,
		len = comments.length,
		hash = {},
		comment,
		commentParent,
		tree = [];

	for (; i < len; i++) {
		comment = comments[i];
		comment.user = usersHash[String(comment.user)].login;
		//Время отдаём в ms
		comment.stamp = comment.stamp.getTime();
		if (comment.lastChanged !== undefined) {
			comment.lastChanged = comment.lastChanged.getTime();
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

	return {tree: tree};
}

function commentsTreeBuildAuth(myId, comments, previousViewStamp, canReply, cb) {
	var weekAgo = Date.now() - weekMS,
		comment,
		commentParent,
		commentIsDeleted,
		commentIsMine,
		commentsHash = {},
		commentsArrMid = [],

		countTotal = 0,
		countNew = 0,
		len = comments.length,
		i = 0,

		usersHash = {},
		usersArr = [],
		userId;

	for (; i < len; i++) {
		comment = comments[i];

		comment.user = userId = String(comment.user);
		if (usersHash[userId] === undefined) {
			usersHash[userId] = true;
			usersArr.push(userId);
		}

		comment.stamp = comment.stamp.getTime(); //Время отдаём в ms

		commentIsMine = comment.user === myId; //Мой комментарий
		commentIsDeleted = comment.del !== undefined; //Комментарий удалён

		if (commentIsDeleted) {
			comment.delRoot = comment; //Сначала в качестве корневого удалённого указываем сам удалённый
		}

		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = commentsHash[comment.parent];

			//Чтобы узнать, есть ли в удалённой ветке комментарий текущего пользователя (тогда он должен видеть эту ветку)
			//надо сохранять ссылку на корневой удалённый комментарий у всех дочерних, пока не встретим комментарий текущего пользователя
			//и в этом случае помечаем родительский удалённый как сохраняемый и отбрасываем его потомков (они не передаются)

			if (commentParent === undefined) {
				//Если родителя нет в хеше, возможно он в сохранённой ветке удаленных комментариев (но не корневой) и
				//поэтому уже отброшен, значит текущий тоже надо отбросить
				continue;
			}
			if (commentIsDeleted) {
				if (commentParent.del !== undefined) {
					if (commentParent.delRoot.delSave === true) {
						continue; //Если корневой удаляемый родитель уже сохранён, отбрасываем текущий
					}
					comment.delRoot = commentParent.delRoot; //Сохраняем ссылку на корневой родительский
					if (commentIsMine) {
						//Если это собственный, указываем что корневой нужно сохранить и отбрасываем текущий
						comment.delRoot.delSave = true;
						continue;
					}
				} else if (commentIsMine) {
					//Если это собственный корневой удаленный комментарий (нет удалённых родителей), сразу сохраняем его
					comment.delRoot.delSave = true;
				}
			}
			if (commentParent.comments === undefined) {
				if (canReply && commentParent.del === undefined && !commentIsDeleted && commentParent.can.del === true) {
					//Если у неудаленного родителя обнаруживаем первый дочерний неудаленный комментарий, и пользователь может удалить родительский,
					//т.е. это его комментарий, отменяем возможность удаления,
					//т.к. пользователь не может удалять свои не последние комментарии
					delete commentParent.can.del;
				}
				commentParent.comments = [];
			}
		} else if (commentIsDeleted && commentIsMine) {
			//Если это собственный удаленный комментарий первого уровня, сразу сохраняем его
			comment.delSave = true;
		}

		if (!commentIsDeleted) {
			countTotal++;
			if (canReply) {
				comment.can = {};
				if (commentIsMine && comment.stamp > weekAgo) {
					//Пользователь может удалить свой последний комментарий или редактировать свои в течении недели
					comment.can.edit = comment.can.del = true;
				}
			}
			if (previousViewStamp && !commentIsMine && comment.stamp > previousViewStamp) {
				comment.isnew = true;
				countNew++;
			}
		}
		commentsHash[comment.cid] = comment;
		commentsArrMid.push(comment);
	}

	getUsersHashForComments(usersArr, function (err, usersById, usersByLogin) {
		if (err) {
			return cb(err);
		}

		var comments = commentsArrMid,
			commentsTree = [],
			comment,
			len = comments.length,
			i = 0;

		//Растим дерево комментариев
		for (; i < len; i++) {
			comment = comments[i];

			if (comment.del !== undefined) {
				if (comment.delRoot.delSave === true) {
					//Просто передаём флаг, что комментарий удалён. Подробности можно посмотреть в истории изменений
					comment.del = true;
					//Удалённый корневой комментарий (схлопнутый) передается без текста
					delete comment.txt;
					delete comment.frag;
					delete comment.delRoot;
					delete comment.delSave; //Удаляем delSave, и тогда его потомки не войдут в эту ветку
					delete comment.comments;
				} else {
					continue;
				}
			}

			comment.user = usersById[comment.user].login;
			if (comment.lastChanged !== undefined) {
				comment.lastChanged = comment.lastChanged.getTime();
			}

			if (comment.level > 0) {
				commentsHash[comment.parent].comments.push(comment);
			} else {
				commentsTree.push(comment);
			}
		}

		cb(null, {tree: commentsTree, users: usersByLogin, countTotal: countTotal, countNew: countNew});
	});
}

function commentsTreeBuildCanModerate(myId, comments, previousViewStamp, cb) {
	var commentsHash = {},
		commentsPlain = [],
		commentsTree = [],
		commentParent,
		comment,

		countTotal = 0,
		countNew = 0,

		len = comments.length,
		i = 0,

		usersHash = {},
		usersArr = [],
		userId;

	for (; i < len; i++) {
		comment = comments[i];

		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = commentsHash[comment.parent];
			if (commentParent === undefined || commentParent.del !== undefined) {
				//Если родитель удален или его нет (т.е. родитель родителя удален), отбрасываем комментарий
				continue;
			}
			if (commentParent.comments === undefined) {
				commentParent.comments = [];
			}
			commentParent.comments.push(comment);
		} else {
			commentsTree.push(comment);
		}

		commentsHash[comment.cid] = comment;
		commentsPlain.push(comment);

		comment.user = userId = String(comment.user);
		if (usersHash[userId] === undefined) {
			usersHash[userId] = true;
			usersArr.push(userId);
		}

		//Время отдаём в ms
		comment.stamp = comment.stamp.getTime();
		if (comment.lastChanged !== undefined) {
			comment.lastChanged = comment.lastChanged.getTime();
		}

		if (comment.del !== undefined) {
			//Для просмотра списка просто передаём флаг, что комментарий удалён. Подробности можно посмотреть в истории изменений
			comment.del = true;
			//Удалённые комментарии передаются без текста
			delete comment.txt;
			delete comment.frag;
			delete comment.comments;
			continue;
		} else if (previousViewStamp && comment.stamp > previousViewStamp && comment.user !== myId) {
			comment.isnew = true;
			countNew++;
		}

		countTotal++;
	}

	getUsersHashForComments(usersArr, function (err, usersById, usersByLogin) {
		if (err) {
			return cb(err);
		}
		var i = commentsPlain.length, c;

		while (i--) {
			c = commentsPlain[i];
			c.user = usersById[c.user].login;
		}

		cb(null, {tree: commentsTree, users: usersByLogin, countTotal: countTotal, countNew: countNew});
	});
}
function commentsTreeBuildDel(comment, childs, checkMyId, cb) {
	var commentsHash = {},
		commentParent,
		child,

		canSee = checkMyId ? false : true,//Может ли пользователь видеть ветку комментариев. Если checkMyId не передан - может. Если передан, будем смотреть, является ли он автором одного из удаленных в запрашиваемом дереве
		len = childs.length,
		i = 0,

		usersHash = {},
		usersArr = [],
		userId;

	//Сначала обрабатываем удалённого родителя, по которому запрашиваем ветку
	comment.user = String(comment.user);
	usersHash[comment.user] = true;
	usersArr.push(comment.user);
	commentsHash[comment.cid] = comment;
	comment.stamp = comment.stamp.getTime();
	comment.lastChanged = comment.lastChanged.getTime();
	if (comment.level === undefined) {
		comment.level = 0;
	}

	//Если обычный пользователь является автором удалённого родителя, значит сразу решаем что может видеть ветку
	if (checkMyId && comment.user === checkMyId) {
		canSee = true;
	}

	//Бежим по дочерним удалённого родителя
	for (; i < len; i++) {
		child = childs[i];
		commentParent = commentsHash[child.parent];

		//Если такого комментария нет в хеше, значит он не дочерний запрашиваемому
		if (commentParent === undefined) {
			continue;
		}

		child.user = userId = String(child.user);
		if (usersHash[userId] === undefined) {
			usersHash[userId] = true;
			usersArr.push(userId);
		}
		if (checkMyId && userId === checkMyId) {
			canSee = true;
		}
		child.stamp = child.stamp.getTime();
		child.lastChanged = child.lastChanged.getTime();

		if (commentParent.comments === undefined) {
			commentParent.comments = [];
		}
		commentParent.comments.push(child);
		commentsHash[child.cid] = child;
	}

	//Если запрашивает не модератор и не тот, у кого среди комментариев ветки есть комментарии, то он не може видеть их, возвращаем "не существует"
	if (!canSee) {
		return cb({message: msg.noCommentExists});
	}

	getUsersHashForComments(usersArr, function (err, usersById, usersByLogin) {
		if (err) {
			return cb(err);
		}
		var c, i;

		for (i in commentsHash) {
			c = commentsHash[i];
			c.user = usersById[c.user].login;
		}

		cb(null, {tree: [comment], users: usersByLogin});
	});
}

//Готовим хэш пользователей для комментариев
function getUsersHashForComments(usersArr, cb) {
	User.find({_id: {$in: usersArr}}, {_id: 1, login: 1, avatar: 1, disp: 1, ranks: 1}, {lean: true}, function (err, users) {
		if (err || !users) {
			return cb({message: err && err.message || 'Users find error', error: true});
		}
		var hashByLogin = {},
			hashById = {},
			user,
			i = users.length;

		while (i--) {
			user = users[i];
			if (user.avatar) {
				user.avatar = '/_a/h/' + user.avatar;
			}
			user.online = _session.us[user.login] !== undefined; //Для скорости смотрим непосредственно в хеше, без функции isOnline
			hashByLogin[user.login] = hashById[String(user._id)] = user;
			delete user._id;
		}

		cb(null, hashById, hashByLogin);
	});
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

	if (iAm) {
		core.getCommentsObjAuth(iAm, data, finish);
	} else {
		core.getCommentsObjAnonym(data, finish);
	}
	function finish(err, result) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb(_.assign(result, {message: 'ok', cid: data.cid}));
	}
}

/**
 * Выбирает ветку удалённых комментариев начиная с запрошенного
 * @param iAm
 * @param data Объект
 * @param cb Коллбэк
 */
function getDelTree(iAm, data, cb) {
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}
	data.cid = Number(data.cid);

	core.getDelTree(iAm, data, function finish(err, result) {
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

			Comment.collection.find({user: userid, del: null, hidden: null}, {_id: 0, lastChanged: 1, cid: 1, obj: 1, stamp: 1, txt: 1}, {sort: [
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
	var query = {del: null, hidden: null},
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
			if (!permissions.canReply(data.type, o, iAm) && !permissions.canModerate(data.type, o, iAm)) {
				return cb({message: o.nocomments ? msg.noComments : msg.deny, error: true});
			}
			if (data.parent && (!parent || parent.level >= 9 || data.level !== (parent.level || 0) + 1)) {
				return cb({message: 'Что-то не так с родительским комментарием. Возможно его удалили. Пожалуйста, обновите страницу.', error: true});
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
				stamp: new Date(),
				txt: Utils.inputIncomingParse(content),
				del: undefined
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
 * Удаляет комментарий и его дочерние комментарии
 * @param socket Сокет пользователя
 * @param data
 * @param cb Коллбэк
 */
function removeComment(socket, data, cb) {
	if (!socket.handshake.session.user) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !Number(data.cid) || !data.reason || (!Number(data.reason.key) && !data.reason.desc)) {
		return cb({message: 'Bad params', error: true});
	}
	var cid = Number(data.cid),
		iAm = socket.handshake.session.user,
		canEdit,
		canModerate,
		obj,
		commentsHash = {},
		hashUsers = {},
		countCommentsRemoved = 1,
		commentModel,

		delInfo,
		childsCids;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	commentModel.findOne({cid: cid, del: null}, {_id: 1, obj: 1, user: 1, stamp: 1, hidden: 1}, {lean: true}, function (err, comment) {
		if (err || !comment) {
			return cb({message: err && err.message || msg.noCommentExists, error: true});
		}
		step(
			function () {
				if (data.type === 'news') {
					News.findOne({_id: comment.obj}, {_id: 1, ccount: 1, nocomments: 1}, this.parallel());
				} else {
					photoController.findPhoto({_id: comment.obj}, null, iAm, this.parallel());
				}
			},
			function (err, o) {
				if (err || !o) {
					return cb({message: err && err.message || msg.noObject, error: true});
				}
				obj = o;
				//Считаем количество непосредственных неудаленных потомков
				commentModel.count({obj: obj._id, parent: cid, del: null}, this);
			},
			function (err, childCount) {
				if (err) {
					return cb({message: err.message, error: true});
				}

				//Возможно удалять как простой пользователь, если нет неудалённых потомков и это собственный свежий комментарий
				canEdit = !childCount && permissions.canEdit(comment, obj, iAm);
				if (!canEdit) {
					//В противном случае нужны права модератора/администратора
					canModerate = permissions.canModerate(data.type, obj, iAm);
					if (!canModerate) {
						return cb({message: obj.nocomments ? msg.noComments : msg.deny, error: true});
					}
				}

				if (childCount) {
					//Находим все неудалённые комментарии этого объекта ниже уровнем текущего и оставленных позже него
					//Затем найдем из них потомков удаляемого
					commentModel.find({obj: obj._id, del: null, stamp: {$gte: comment.stamp}, level: {$gt: comment.level || 0}}, {_id: 0, obj: 0, stamp: 0, txt: 0, hist: 0}, {lean: true, sort: {stamp: 1}}, this);
				} else {
					this(null, []);
				}
			},
			function (err, childs) {
				if (err || !childs) {
					return cb({message: err && err.message || 'Cursor extract error', error: true});
				}
				var delInfoChilds,
					child,
					len = childs.length,
					i = 0;

				delInfo = {user: iAm._id, stamp: new Date(), reason: {}};
				childsCids = [];

				//Операции с корневым удаляемым комментарием
				commentsHash[cid] = comment;
				if (!comment.hidden) {
					//Если комментарий скрыт (т.е. объект не публичный), его уже не надо вычитать из статистики пользователя
					hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
				}

				//Находим потомков именно удаляемого комментария через заполнение commentsHash
				for (; i < len; i++) {
					child = childs[i];
					if (child.level && commentsHash[child.parent] !== undefined && !child.del) {
						if (!child.hidden) {
							hashUsers[child.user] = (hashUsers[child.user] || 0) + 1;
						}
						childsCids.push(child.cid);
						commentsHash[child.cid] = child;
					}
				}

				if (canModerate && iAm.role) {
					//Если для изменения потребовалась роль модератора/адиминитратора, записываем её на момент удаления
					delInfo.role = iAm.role;
					if (iAm.role === 5) {
						delInfo.roleregion = canModerate; //В случае с модератором региона, permissions.canModerate возвращает cid роли,
					}
				}

				if (Number(data.reason.key)) {
					delInfo.reason.key = Number(data.reason.key);
				}
				if (data.reason.desc) {
					delInfo.reason.desc = Utils.inputIncomingParse(data.reason.desc);
				}

				commentModel.update({cid: cid}, {$set: {lastChanged: delInfo.stamp, del: delInfo}}, this.parallel());

				if (childsCids.length) {
					countCommentsRemoved += childsCids.length;
					delInfoChilds = _.assign(_.omit(delInfo, 'reason'), {origin: cid});
					commentModel.update({cid: {$in: childsCids}}, {$set: {lastChanged: delInfo.stamp, del: delInfoChilds}}, {multi: true}, this.parallel());
				}
			},
			function (err) {
				if (err) {
					return cb({message: err.message || 'Comment remove error', error: true});
				}
				var frags = obj.frags && obj.frags.toObject(),
					user,
					i,
					u;

				if (frags) {
					for (i = frags.length; i--;) {
						if (commentsHash[frags[i].cid] !== undefined) {
							obj.frags.id(frags[i]._id).del = true;
						}
					}
				}

				obj.ccount -= countCommentsRemoved;
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
			},
			function (err) {
				if (err) {
					return cb({message: err.message || 'Object or user update error', error: true});
				}
				var myCountRemoved = hashUsers[iAm._id] || 0, //Кол-во моих комментариев
					frags,
					frag,
					i;

				//Не отдаем фрагменты только не удаленных комментариев, для замены на клиенте
				if (obj.frags) {
					obj.frags = obj.frags.toObject();
					frags = [];
					for (i = 0; i < obj.frags.length; i++) {
						frag = obj.frags[i];
						if (!frag.del) {
							frags.push(frag);
						}
					}
				}

				actionLogController.logIt(iAm, comment._id, actionLogController.OBJTYPES.COMMENT, actionLogController.TYPES.REMOVE, delInfo.stamp, delInfo.reason, delInfo.roleregion, childsCids.length ? {childs: childsCids.length} : undefined);
				cb({message: 'Ok', frags: frags, countComments: countCommentsRemoved, myCountComments: myCountRemoved, countUsers: Object.keys(hashUsers).length, stamp: delInfo.stamp.getTime(), delInfo: delInfo});
			}
		);
	});
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
		canEdit,
		canModerate,
		fragRecieved;

	step(
		function () {
			if (data.type === 'news') {
				News.findOne({cid: data.obj}, {cid: 1, frags: 1, nocomments: 1}, this.parallel());
				CommentN.findOne({cid: cid}, this.parallel());
			} else {
				photoController.findPhoto({cid: data.obj}, null, iAm, this.parallel());
				Comment.findOne({cid: cid}, this.parallel());
			}
		},
		function (err, obj, comment) {
			if (err || !comment || !obj || data.obj !== obj.cid) {
				return cb({message: err && err.message || msg.noCommentExists, error: true});
			}

			var i,
				hist = {user: iAm},
				content,
				fragExists,
				fragChangedType,
				txtChanged;

			//Возможно редактировать как простой пользователь, если это собственный комментарий моложе недели
			canEdit = permissions.canEdit(comment, obj, iAm);
			if (!canEdit) {
				//В противном случае нужны права модератора/администратора
				canModerate = permissions.canModerate(data.type, obj, iAm);
				if (!canModerate) {
					return cb({message: obj.nocomments ? msg.noComments : msg.deny, error: true});
				}
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

				if (canModerate && iAm.role) {
					//Если для изменения потребовалась роль модератора/адиминитратора, записываем её на момент изменения
					hist.role = iAm.role;
					if (iAm.role === 5) {
						hist.roleregion = canModerate; //В случае с модератором региона, permissions.canModerate возвращает cid роли,
					}
				}

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

	commentModel.findOne({cid: Number(data.cid)}, {_id: 0, user: 1, txt: 1, stamp: 1, hist: 1, del: 1}, {lean: true}).populate({path: 'user hist.user del.user', select: {_id: 0, login: 1, avatar: 1, disp: 1}}).exec(function (err, comment) {
		if (err || !comment) {
			return cb({message: err && err.message || msg.noCommentExists, error: true});
		}
		var i,
			hist,
			hists = comment.hist || [],
			lastTxtIndex = 0, //Позиция последнего изменение текста в стеке событий
			lastTxtObj = {user: comment.user, stamp: comment.stamp}, //Первое событие изменения текста будет равнятся созданию комментария
			result = [],
			getregion = function (regionId) {
				var result;
				if (regionId) {
					result = regionController.getRegionsHashFromCache([regionId])[regionId];
					if (result) {
						result = _.omit(result, '_id', 'parents');
					}
				}
				return result;
			};


		if (comment.del) {
			hists.push({
				user: comment.del.user,
				stamp: comment.del.stamp,
				del: comment.del,
				role: comment.del.role,
				roleregion: comment.del.roleregion
			});
		}

		for (i = 0; i < hists.length; i++) {
			hist = hists[i];

			if (hist.role && hist.roleregion) {
				hist.roleregion = getregion(hist.roleregion);
			}

			if (hist.del) {
				hist.del = _.pick(hist.del, 'reason', 'origin');
				result.push(hist);
				continue;
			}

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
	});
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

	if (!iAm || !iAm.role) {
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
		function (err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			if (!permissions.canModerate(data.type, obj, iAm)) {
				return cb({message: msg.deny, error: true});
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
		/*socket.on('restoreComment', function (data) {
		 restoreComment(socket, data, function (result) {
		 socket.emit('restoreCommentResult', result);
		 });
		 });*/

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
		socket.on('giveCommentsDel', function (data) {
			getDelTree(socket.handshake.session.user, data, function (result) {
				socket.emit('takeCommentsDel', result);
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