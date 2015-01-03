'use strict';

var _session = require('./_session.js'),
	Settings,
	User,
	UserObjectRel,
	Photo,
	News,
	Comment,
	CommentN,
	Counter,
	_ = require('lodash'),
	Bluebird = require('bluebird'),
	ms = require('ms'), // Tiny milisecond conversion utility
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	appEnv = {},
	host,
	logger,

	constants = require('./constants'),

	weekMS = ms('7d'),
	commentMaxLength = 12e3,
	msg = {
		deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
		noUser: 'Запрашиваемый пользователь не существует',
		noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
		noComments: 'Операции с комментариями на этой странице запрещены',
		noCommentExists: 'Комментария не существует',
		badParams: 'Неверные параметры запроса',
		maxLength: 'Комментарий длиннее допустимого значения (' + commentMaxLength + ')'
	},

	actionLogController = require('./actionlog.js'),
	regionController = require('./region.js'),
	photoController = require('./photo.js'),
	subscrController = require('./subscr.js'),
	reasonController = require('./reason.js'),
	userObjectRelController = require('./userobjectrel'),

	maxRegionLevel = global.appVar.maxRegionLevel,

	permissions = {
		canModerate: function (type, obj, usObj) {
			return usObj.registered && (type === 'photo' && photoController.permissions.canModerate(obj, usObj) || type === 'news' && usObj.isAdmin);
		},
		canEdit: function (comment, obj, usObj) {
			return usObj.registered && !obj.nocomments && comment.user.equals(usObj.user._id) && comment.stamp > (Date.now() - weekMS);
		},
		canReply: function (type, obj, usObj) {
			return usObj.registered && !obj.nocomments && (type === 'photo' && obj.s >= constants.photo.status.PUBLIC || type === 'news');
		}
	};

var commentsTreeBuildAnonym = Bluebird.method(function (comments, usersHash) {
	var user;
	var hash = {};
	var comment;
	var commentParent;
	var tree = [];

	for (var i = 0, len = comments.length; i < len; i++) {
		comment = comments[i];
		user = usersHash[String(comment.user)];

		if (!user) {
			logger.error('User for comment undefined. Comment userId: ' + String(comment.user) + ' Comment: ' + JSON.stringify(comment));
			throw { message: 'Unknow user in comments' };
		} else {
			comment.user = user.login;
		}

		// Время отдаём в ms
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

	return tree;
});

var commentsTreeBuildAuth = Bluebird.method(function (myId, comments, previousViewStamp, canReply) {
	var weekAgo = Date.now() - weekMS;
	var comment;
	var commentParent;
	var commentIsDeleted;
	var commentIsMine;
	var commentsHash = {};
	var commentsArrMid = [];

	var countTotal = 0;
	var countNew = 0;

	var usersHash = {};
	var usersArr = [];
	var userId;

	for (var i = 0, len = comments.length; i < len; i++) {
		comment = comments[i];

		comment.user = userId = String(comment.user);
		if (usersHash[userId] === undefined) {
			usersHash[userId] = true;
			usersArr.push(userId);
		}

		comment.stamp = comment.stamp.getTime(); // Время отдаём в ms

		commentIsMine = comment.user === myId; // Мой комментарий
		commentIsDeleted = comment.del !== undefined; // Комментарий удалён

		if (commentIsDeleted) {
			comment.delRoot = comment; // Сначала в качестве корневого удалённого указываем сам удалённый
		}

		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = commentsHash[comment.parent];

			// Чтобы узнать, есть ли в удалённой ветке комментарий текущего пользователя (тогда он должен видеть эту ветку)
			// надо сохранять ссылку на корневой удалённый комментарий у всех дочерних, пока не встретим комментарий текущего пользователя
			// и в этом случае помечаем родительский удалённый как сохраняемый и отбрасываем его потомков (они не передаются)

			if (commentParent === undefined) {
				// Если родителя нет в хеше, возможно он в сохранённой ветке удаленных комментариев (но не корневой) и
				// поэтому уже отброшен, значит текущий тоже надо отбросить
				continue;
			}
			if (commentIsDeleted) {
				if (commentParent.del !== undefined) {
					if (commentParent.delRoot.delSave === true) {
						continue; // Если корневой удаляемый родитель уже сохранён, отбрасываем текущий
					}
					comment.delRoot = commentParent.delRoot; //Сохраняем ссылку на корневой родительский
					if (commentIsMine) {
						// Если это собственный, указываем что корневой нужно сохранить и отбрасываем текущий
						comment.delRoot.delSave = true;
						continue;
					}
				} else if (commentIsMine) {
					// Если это собственный корневой удаленный комментарий (нет удалённых родителей), сразу сохраняем его
					comment.delRoot.delSave = true;
				}
			}
			if (commentParent.comments === undefined) {
				if (canReply && commentParent.del === undefined && !commentIsDeleted && commentParent.can.del === true) {
					// Если у неудаленного родителя обнаруживаем первый дочерний неудаленный комментарий, и пользователь может удалить родительский,
					// т.е. это его комментарий, отменяем возможность удаления,
					// т.к. пользователь не может удалять свои не последние комментарии
					delete commentParent.can.del;
				}
				commentParent.comments = [];
			}
		} else if (commentIsDeleted && commentIsMine) {
			// Если это собственный удаленный комментарий первого уровня, сразу сохраняем его
			comment.delSave = true;
		}

		if (!commentIsDeleted) {
			countTotal++;
			if (canReply) {
				comment.can = {};
				if (commentIsMine && comment.stamp > weekAgo) {
					// Пользователь может удалить свой последний комментарий или редактировать свои в течении недели
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

	return getUsersHashForComments(usersArr)
		.spread(function (usersById, usersByLogin) {
			var comments = commentsArrMid;
			var commentsTree = [];
			var comment;

			// Растим дерево комментариев
			for (var i = 0, len = comments.length; i < len; i++) {
				comment = comments[i];

				if (comment.del !== undefined) {
					if (comment.delRoot.delSave === true) {
						// Просто передаём флаг, что комментарий удалён. Подробности можно посмотреть в истории изменений
						comment.del = true;
						// Удалённый корневой комментарий (схлопнутый) передается без текста
						delete comment.txt;
						delete comment.frag;
						delete comment.delRoot;
						delete comment.delSave; // Удаляем delSave, и тогда его потомки не войдут в эту ветку
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

			return { tree: commentsTree, users: usersByLogin, countTotal: countTotal, countNew: countNew };
		});
});

var commentsTreeBuildCanModerate = Bluebird.method(function (myId, comments, previousViewStamp) {
	var commentsHash = {};
	var commentsPlain = [];
	var commentsTree = [];
	var commentParent;
	var comment;

	var countTotal = 0;
	var countNew = 0;

	var usersHash = {};
	var usersArr = [];
	var userId;

	for (var i = 0, len = comments.length; i < len; i++) {
		comment = comments[i];

		if (comment.level === undefined) {
			comment.level = 0;
		}
		if (comment.level > 0) {
			commentParent = commentsHash[comment.parent];
			if (commentParent === undefined || commentParent.del !== undefined) {
				// Если родитель удален или его нет (т.е. родитель родителя удален), отбрасываем комментарий
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

		// Время отдаём в ms
		comment.stamp = comment.stamp.getTime();
		if (comment.lastChanged !== undefined) {
			comment.lastChanged = comment.lastChanged.getTime();
		}

		if (comment.del !== undefined) {
			// Для просмотра списка просто передаём флаг, что комментарий удалён. Подробности можно посмотреть в истории изменений
			comment.del = true;
			// Удалённые комментарии передаются без текста
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

	return getUsersHashForComments(usersArr)
		.spread(function (usersById, usersByLogin) {
			var c;

			for (var i = commentsPlain.length; i--;) {
				c = commentsPlain[i];
				c.user = usersById[c.user].login;
			}

			return { tree: commentsTree, users: usersByLogin, countTotal: countTotal, countNew: countNew };
		});
});

var commentsTreeBuildDel = Bluebird.method(function (comment, childs, checkMyId) {
	var commentsHash = {};
	var commentParent;
	var child;

	var usersHash = {};
	var usersArr = [];
	var userId;

	// Может ли пользователь видеть ветку комментариев. Если checkMyId не передан - может.
	// Если передан, будем смотреть, является ли он автором одного из удаленных в запрашиваемом дереве
	var canSee = checkMyId ? false : true;

	// Сначала обрабатываем удалённого родителя, по которому запрашиваем ветку
	comment.user = String(comment.user);
	usersHash[comment.user] = true;
	usersArr.push(comment.user);
	commentsHash[comment.cid] = comment;

	comment.del = { origin: comment.del.origin || undefined };
	comment.stamp = comment.stamp.getTime();
	comment.lastChanged = comment.lastChanged.getTime();

	if (comment.level === undefined) {
		comment.level = 0;
	}

	// Если обычный пользователь является автором удалённого родителя, значит сразу решаем что может видеть ветку
	if (checkMyId && comment.user === checkMyId) {
		canSee = true;
	}

	// Бежим по дочерним удалённого родителя
	for (var i = 0, len = childs.length; i < len; i++) {
		child = childs[i];
		commentParent = commentsHash[child.parent];

		// Если такого комментария нет в хеше, значит он не дочерний запрашиваемому
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
		child.del = { origin: child.del.origin || undefined };
		child.stamp = child.stamp.getTime();
		child.lastChanged = child.lastChanged.getTime();

		if (commentParent.comments === undefined) {
			commentParent.comments = [];
		}
		commentParent.comments.push(child);
		commentsHash[child.cid] = child;
	}

	// Если запрашивает не модератор и не тот, у кого среди комментариев ветки есть комментарии,
	// то он не може видеть их, возвращаем "не существует"
	if (!canSee) {
		throw { message: msg.noCommentExists };
	}

	return getUsersHashForComments(usersArr)
		.spread(function (usersById, usersByLogin) {
			var c, i;

			for (i in commentsHash) {
				c = commentsHash[i];
				c.user = usersById[c.user].login;
			}

			return { tree: [comment], users: usersByLogin };
		});
});

// Готовим хэш пользователей для комментариев
function getUsersHashForComments(usersArr) {
	return User.findAsync({ _id: { $in: usersArr } }, { _id: 1, login: 1, avatar: 1, disp: 1, ranks: 1 }, { lean: true })
		.then(function (users) {
			if (!users) {
				throw { message: 'Users find for comments error' };
			}
			var hashByLogin = {};
			var hashById = {};
			var user;

			for (var i = users.length; i--;) {
				user = users[i];
				if (user.avatar) {
					user.avatar = '/_a/h/' + user.avatar;
				}
				user.online = _session.usLogin[user.login] !== undefined; //Для скорости смотрим непосредственно в хеше, без функции isOnline
				hashByLogin[user.login] = hashById[String(user._id)] = user;
				delete user._id;
			}

			return [hashById, hashByLogin];
		});
}


var core = {
	// Упрощенная отдача комментариев анонимным пользователям
	getCommentsObjAnonym: function (iAm, data) {
		var commentModel;
		var promise;

		if (data.type === 'news') {
			commentModel = CommentN;
			promise = News.findOneAsync({ cid: data.cid }, { _id: 1 });
		} else {
			commentModel = Comment;
			promise = photoController.findPhoto({ cid: data.cid }, null, iAm);
		}

		return promise
			.bind({})
			.then(function (obj) {
				if (!obj) {
					throw { message: msg.noObject };
				}

				return commentModel.findAsync(
					{ obj: obj._id, del: null },
					{ _id: 0, obj: 0, hist: 0, del: 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
					{ lean: true, sort: { stamp: 1 } }
				);
			})
			.then(function (comments) {
				if (!comments) {
					throw { message: 'Comments for anonym find error' };
				}
				var userId;
				var usersArr;
				var usersHash;
				var i = comments.length;

				this.comments = comments;

				if (i) {
					usersArr = [];
					usersHash = {};

					while (i--) {
						userId = String(comments[i].user);
						if (usersHash[userId] === undefined) {
							usersHash[userId] = true;
							usersArr.push(userId);
						}
					}
				}

				if (usersArr && usersArr.length) {
					return getUsersHashForComments(usersArr);
				}

				return [{}, {}];
			})
			.spread(function (usersById, usersByLogin) {
				var len = this.comments.length;

				return Bluebird.props({
					comments: len ? commentsTreeBuildAnonym(this.comments, usersById) : [],
					countTotal: len,
					users: usersByLogin
				});
			});
	},
	getCommentsObjAuth: function (iAm, data) {
		var commentModel;
		var promise;

		if (data.type === 'news') {
			commentModel = CommentN;
			promise = News.findOneAsync({ cid: data.cid }, { _id: 1, nocomments: 1 });
		} else {
			commentModel = Comment;
			promise = photoController.findPhoto({ cid: data.cid }, null, iAm);
		}

		return promise
			.bind({})
			.then(function (obj) {
				if (!obj) {
					throw { message: msg.noObject };
				}

				this.obj = obj;

				return Bluebird.join(
					// Берём все комментарии
					commentModel.findAsync(
						{ obj: obj._id },
						{ _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
						{ lean: true, sort: { stamp: 1 } }
					),
					// Берём последнее время просмотра комментариев объекта и
					// выставляем вместо него текущее время со сбросом уведомления, если есть
					userObjectRelController.setCommentView(obj._id, iAm.user._id, data.type)
				);
			})
			.spread(function (comments, relBeforeUpdate) {
				var previousViewStamp;

				if (relBeforeUpdate) {
					if (relBeforeUpdate.comments) {
						previousViewStamp = relBeforeUpdate.comments.getTime();
					}
					if (relBeforeUpdate.sbscr_noty) {
						// Если было заготовлено уведомление, просим менеджер подписок проверить есть ли уведомления по другим объектам
						subscrController.commentViewed(this.obj._id, iAm.user);
					}
				}

				this.canModerate = permissions.canModerate(data.type, this.obj, iAm);
				this.canReply = this.canModerate || permissions.canReply(data.type, this.obj, iAm);

				if (!comments.length) {
					return { tree: [], users: {}, countTotal: 0, countNew: 0 };
				}

				if (this.canModerate) {
					// Если это модератор данной фотографии или администратор новости
					return commentsTreeBuildCanModerate(String(iAm.user._id), comments, previousViewStamp);
				}
				// Если это зарегистрированный пользователь
				return commentsTreeBuildAuth(String(iAm.user._id), comments, previousViewStamp, !this.obj.nocomments);
			})
			.then(function (commentsTree) {
				return ({
					comments: commentsTree.tree,
					users: commentsTree.users,
					countTotal: commentsTree.countTotal,
					countNew: commentsTree.countNew,
					canModerate: this.canModerate || undefined,
					canReply: this.canReply || undefined
				});
			});
	},
	getDelTree: function (iAm, data) {
		var commentModel;

		if (data.type === 'news') {
			commentModel = CommentN;
		} else {
			commentModel = Comment;
		}

		return commentModel.findOneAsync(
			{ cid: data.cid, del: { $exists: true } },
			{ _id: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
			{ lean: true }
		)
			.bind({})
			.then(function (comment) {
				if (!comment) {
					throw { message: msg.noCommentExists };
				}
				var objPromise;
				var objId = comment.obj;

				delete comment.obj;

				this.comment = comment;

				// Находим объект, которому принадлежит комментарий
				if (data.type === 'news') {
					objPromise = News.findOneAsync({ _id: objId }, { _id: 1, nocomments: 1 });
				} else {
					objPromise = photoController.findPhoto({ _id: objId }, null, iAm);
				}

				return Bluebird.join(
					objPromise,
					// Берём все удаленные комментарии, оставленные позже запрашиваемого удалённого, и ниже его уровнем
					commentModel.findAsync(
						{ obj: objId, del: { $exists: true }, stamp: { $gte: comment.stamp }, level: { $gt: comment.level || 0 } },
						{ _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
						{ lean: true, sort: { stamp: 1 } }
					)
				);
			})
			.spread(function (obj, childs) {
				if (!obj) {
					throw { message: msg.noObject };
				}

				var canModerate = permissions.canModerate(data.type, obj, iAm);

				return commentsTreeBuildDel(this.comment, childs, canModerate ? undefined : String(iAm.user._id));
			})
			.then(function (commentsTree) {
				return { comments: commentsTree.tree, users: commentsTree.users };
			});
	}
};


/**
 * Выбирает комментарии для объекта
 * @param iAm
 * @param data Объект
 */
var getCommentsObj = Bluebird.method(function (iAm, data) {
	if (!_.isObject(data) || !Number(data.cid)) {
		throw { message: msg.badParams };
	}

	data.cid = Number(data.cid);

	return (iAm.registered ? core.getCommentsObjAuth(iAm, data) : core.getCommentsObjAnonym(iAm, data))
		.then(function (result) {
			result.cid = data.cid;

			return result;
		});
});

/**
 * Выбирает ветку удалённых комментариев начиная с запрошенного
 * @param iAm
 * @param data Объект
 */
var getDelTree = Bluebird.method(function (iAm, data) {
	if (!_.isObject(data) || !Number(data.cid)) {
		throw { message: msg.badParams };
	}

	data.cid = Number(data.cid);

	return core.getDelTree(iAm, data)
		.then(function finish(result) {
			result.cid = data.cid;

			return result;
		});
});


var commentsUserPerPage = 15;
/**
 * Выбирает комментарии для пользователя
 * @param data Объект
 */
var getCommentsUser = Bluebird.method(function (data) {
	if (!_.isObject(data) || !data.login) {
		throw { message: msg.badParams };
	}

	return User.getUserID(data.login)
		.bind({})
		.then(function (userid) {
			if (!userid) {
				throw { message: msg.noUser };
			}
			var page = (Math.abs(Number(data.page)) || 1) - 1;
			var skip = page * commentsUserPerPage;

			return Comment.findAsync(
				{ user: userid, del: null, hidden: null },
				{ _id: 0, lastChanged: 1, cid: 1, obj: 1, stamp: 1, txt: 1 },
				{ lean: true, sort: { stamp: -1 }, skip: skip, limit: commentsUserPerPage }
			);
		})
		.then(function (comments) {
			if (!comments) {
				throw { message: msg.noComments };
			}

			var photoId;
			var photosArr = [];
			var photosExistsHash = {};

			for (var i = comments.length; i--;) {
				photoId = comments[i].obj;
				if (photosExistsHash[photoId] === undefined) {
					photosExistsHash[photoId] = true;
					photosArr.push(photoId);
				}
			}

			this.comments = comments;
			return Photo.findAsync({ _id: { $in: photosArr } }, { _id: 1, cid: 1, file: 1, title: 1, year: 1, year2: 1 }, { lean: true });
		})
		.then(function (photos) {
			if (!photos) {
				throw { message: msg.noObject };
			}

			var photoFormattedHashCid = {};
			var photoFormattedHashId = {};
			var photoFormatted;
			var photo;
			var commentsArrResult = [];
			var comment;
			var i;

			for (i = photos.length; i--;) {
				photo = photos[i];
				photoFormatted = {
					cid: photo.cid,
					file: photo.file,
					title: photo.title,
					year: photo.year,
					year2: photo.year2
				};
				photoFormattedHashCid[photo.cid] = photoFormattedHashId[photo._id] = photoFormatted;
			}

			// Для каждого комментария проверяем существование публичной фотографии и присваиваем ему cid фотографии
			for (i = photos.length; i--;) {
				comment = this.comments[i];
				if (photoFormattedHashId[comment.obj] !== undefined) {
					comment.obj = photoFormattedHashId[comment.obj].cid;
					commentsArrResult.push(comment);
				}
			}

			return { message: 'ok', page: data.page, comments: commentsArrResult, photos: photoFormattedHashCid };
		});
});

/**
 * Берем комментарии
 * @param data Объект параметров, включая стринг фильтра
 */
var getComments = (function () {
	var commentSelect = { _id: 0, cid: 1, obj: 1, user: 1, txt: 1 };
	var photosSelectAllRegions = _.assign({ _id: 1, cid: 1, file: 1, title: 1, geo: 1 }, regionController.regionsAllSelectHash);

	return Bluebird.method(function (iAm, query, data) {
		var skip = Math.abs(Number(data.skip)) || 0;
		var limit = Math.min(data.limit || 30, 100);
		var options = { lean: true, limit: limit, sort: { stamp: -1 } };
		var commentsArr;
		var photosHash = {};
		var usersHash = {};

		if (skip) {
			options.skip = skip;
		}

		return Comment.findAsync(query, commentSelect, options)
			.then(function (comments) {
				if (!comments) {
					throw { message: 'Comments get error' };
				}

				var photosSelect = { _id: 1, cid: 1, file: 1, title: 1, geo: 1 };
				var photosArr = [];
				var usersArr = [];
				var photoId;
				var userId;

				for (var i = comments.length; i--;) {
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

				return Bluebird.join(
					Photo.findAsync(
						{ _id: { $in: photosArr } },
						iAm && iAm.rshortsel ? _.assign(photosSelect, iAm.rshortsel) : photosSelectAllRegions,
						{ lean: true }
					),
					User.findAsync(
						{ _id: { $in: usersArr } },
						{ _id: 1, login: 1, disp: 1 },
						{ lean: true }
					)
				);
			})
			.spread(function (photos, users) {
				var shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm && iAm.rshortlvls);
				var photoFormattedHash = {};
				var userFormattedHash = {};
				var photoFormatted;
				var userFormatted;
				var comment;
				var photo;
				var user;
				var i;

				for (i = photos.length; i--;) {
					photo = photos[i];
					photoFormatted = {
						cid: photo.cid,
						file: photo.file,
						title: photo.title,
						rs: photo.rs // Массив регионов краткого отображения
					};
					photoFormattedHash[photo.cid] = photosHash[photo._id] = photoFormatted;
				}

				for (i = users.length; i--;) {
					user = users[i];
					userFormatted = {
						login: user.login,
						disp: user.disp,
						online: _session.usLogin[user.login] !== undefined // Для скорости смотрим непосредственно в хеше, без функции isOnline
					};
					userFormattedHash[user.login] = usersHash[user._id] = userFormatted;
				}

				for (i = commentsArr.length; i--;) {
					comment = commentsArr[i];
					comment.obj = photosHash[comment.obj].cid;
					comment.user = usersHash[comment.user].login;
				}

				return {
					photos: photoFormattedHash,
					regions: shortRegionsHash,
					users: userFormattedHash,
					comments: commentsArr
				};
			});
	});
}());

/**
 * Выбирает последние комментарии по публичным фотографиям
 */
var getCommentsFeed = (function () {
	var globalOptions = { limit: 30 };
	var globalQuery = { del: null, hidden: null };
	var globalFeed = Utils.memoizePromise(function () {
		return getComments(null, globalQuery, globalOptions);
	}, ms('10s'));

	return function (iAm) {
		if (_.isEmpty(iAm.rquery)) {
			// Пользователям без установленной региональной фильтрации отдаем запомненный результат глобальной выборки
			return globalFeed();
		} else {
			return getComments(iAm, _.assign({ del: null, hidden: null }, iAm.rquery), globalOptions);
		}
	};
}());

/**
 * Создает комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 */
var createComment = Bluebird.method(function (socket, data) {
	var iAm = socket.handshake.usObj;

	if (!iAm.registered) {
		throw { message: msg.deny };
	}

	if (!_.isObject(data) || !Number(data.obj) || !data.txt || data.level > 9) {
		throw { message: msg.badParams };
	}
	if (data.txt.length > commentMaxLength) {
		throw { message: msg.maxLength };
	}

	var fragAdded = data.type === 'photo' && !data.frag && _.isObject(data.fragObj);
	var cid = Number(data.obj);
	var stamp = new Date();
	var promises = [];
	var CommentModel;

	if (data.type === 'news') {
		CommentModel = CommentN;
	} else {
		CommentModel = Comment;
	}

	// Find object and comment's parent
	if (data.type === 'news') {
		promises.push(News.findOneAsynv({ cid: cid }, { _id: 1, ccount: 1, nocomments: 1 }));
	} else {
		promises.push(photoController.findPhoto({ cid: cid }, null, iAm));
	}

	if (data.parent) {
		promises.push(CommentModel.findOneAsync({ cid: data.parent }, { _id: 0, level: 1, del: 1 }, { lean: true }));
	}

	return Bluebird.all(promises)
		.bind({})
		.spread(function counterUp(obj, parent) {
			if (!obj) {
				throw { message: msg.noObject };
			}
			if (!permissions.canReply(data.type, obj, iAm) && !permissions.canModerate(data.type, obj, iAm)) {
				throw { message: obj.nocomments ? msg.noComments : msg.deny };
			}
			if (data.parent && (!parent || parent.del || parent.level >= 9 || data.level !== (parent.level || 0) + 1)) {
				throw { message: 'Что-то не так с родительским комментарием. Возможно его удалили. Пожалуйста, обновите страницу.' };
			}

			this.obj = obj;
			this.parent = parent;

			return Counter.increment('comment');
		})
		.then(function (countC) {
			if (!countC) {
				throw { message: 'Increment comment counter error' };
			}

			this.comment = {
				cid: countC.next,
				obj: this.obj,
				user: iAm.user,
				stamp: stamp,
				txt: Utils.inputIncomingParse(data.txt).result,
				del: undefined
			};

			var i;
			var r;

			// Записываем комментарию фотографии ее регионы
			if (data.type === 'photo') {
				if (this.obj.geo) {
					this.comment.geo = this.obj.geo;
				}
				for (i = 0; i <= maxRegionLevel; i++) {
					r = 'r' + i;
					if (this.obj[r]) {
						this.comment[r] = this.obj[r];
					}
				}
			}
			if (data.parent) {
				this.comment.parent = data.parent;
				this.comment.level = data.level;
			}
			if (this.obj.s !== undefined && this.obj.s !== constants.photo.status.PUBLIC) {
				this.comment.hidden = true;
			}
			if (fragAdded) {
				this.comment.frag = true;
			}

			return new CommentModel(this.comment).saveAsync();
		})
		.then(function () {
			var promises = [];

			if (fragAdded) {
				this.fragObj = {
					cid: this.comment.cid,
					l: Utils.math.toPrecision(Number(data.fragObj.l) || 0, 2),
					t: Utils.math.toPrecision(Number(data.fragObj.t) || 0, 2),
					w: Utils.math.toPrecision(Number(data.fragObj.w) || 20, 2),
					h: Utils.math.toPrecision(Number(data.fragObj.h) || 15, 2)
				};
				this.obj.frags.push(this.fragObj);
			}

			this.obj.ccount = (this.obj.ccount || 0) + 1;
			promises.push(this.obj.saveAsync());

			if (!this.comment.hidden) {
				iAm.user.ccount += 1;
				promises.push(iAm.user.saveAsync());
			}

			return Bluebird.all(promises);
		})
		.then(function () {
			this.comment.user = iAm.user.login;
			this.comment.obj = cid;
			this.comment.can = {};

			if (this.comment.level === undefined) {
				this.comment.level = 0;
			}

			_session.emitUser(iAm, null, socket);
			subscrController.commentAdded(this.obj._id, iAm.user, stamp);

			return { comment: this.comment, frag: this.fragObj };
		});
});

/**
 * Удаляет комментарий и его дочерние комментарии
 * @param socket Сокет пользователя
 * @param data
 */
var removeComment = Bluebird.method(function (socket, data) {
	var iAm = socket.handshake.usObj;

	if (!iAm.registered) {
		throw { message: msg.deny };
	}
	if (!_.isObject(data) || !Number(data.cid) || !data.reason || (!Number(data.reason.cid) && !data.reason.desc)) {
		throw { message: msg.badParams };
	}

	var cid = Number(data.cid);
	var countCommentsRemoved = 1;
	var commentModel;
	var delInfo;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	return commentModel.findOneAsync({ cid: cid, del: null }, { _id: 1, obj: 1, user: 1, stamp: 1, hidden: 1 }, { lean: true })
		.bind({})
		.then(function (comment) {
			if (!comment) {
				throw { message: msg.noCommentExists };
			}

			if (data.type === 'news') {
				return News.findOneAsync({ _id: comment.obj }, { _id: 1, ccount: 1, nocomments: 1 });
			}

			this.comment = comment;

			return photoController.findPhoto({ _id: comment.obj }, null, iAm);
		})
		.then(function (obj) {
			if (!obj) {
				throw { message: msg.noObject };
			}
			this.obj = obj;

			// Считаем количество непосредственных неудаленных потомков
			return commentModel.countAsync({ obj: obj._id, parent: cid, del: null });
		})
		.then(function (childCount) {
			// Возможно удалять как простой пользователь, если нет неудалённых потомков и это собственный свежий комментарий
			this.canEdit = !childCount && permissions.canEdit(this.comment, this.obj, iAm);

			if (!this.canEdit) {
				// В противном случае нужны права модератора/администратора
				this.canModerate = permissions.canModerate(data.type, this.obj, iAm);

				if (!this.canModerate) {
					throw { message: this.obj.nocomments ? msg.noComments : msg.deny };
				}
			}

			if (childCount) {
				// Находим все неудалённые комментарии этого объекта ниже уровнем текущего и оставленных позже него
				// Затем найдем из них потомков удаляемого
				return commentModel.findAsync(
					{ obj: this.obj._id, del: null, stamp: { $gte: this.comment.stamp }, level: { $gt: this.comment.level || 0 } },
					{ _id: 0, obj: 0, stamp: 0, txt: 0, hist: 0 },
					{ lean: true, sort: { stamp: 1 } }
				);
			}

			return [];
		})
		.then(function (childs) {
			var childsCids = [];
			var promises = [];
			var delInfoChilds;
			var child;

			delInfo = { user: iAm.user._id, stamp: new Date(), reason: {} };

			this.hashUsers = Object.create(null);
			this.commentsHash = Object.create(null);

			// Операции с корневым удаляемым комментарием
			this.commentsHash[cid] = this.comment;

			if (!this.comment.hidden) {
				// Если комментарий скрыт (т.е. объект не публичный), его уже не надо вычитать из статистики пользователя
				this.hashUsers[this.comment.user] = (this.hashUsers[this.comment.user] || 0) + 1;
			}

			// Находим потомков именно удаляемого комментария через заполнение commentsHash
			for (var i = 0, len = childs.length; i < len; i++) {
				child = childs[i];
				if (child.level && this.commentsHash[child.parent] !== undefined && !child.del) {
					if (!child.hidden) {
						this.hashUsers[child.user] = (this.hashUsers[child.user] || 0) + 1;
					}
					childsCids.push(child.cid);
					this.commentsHash[child.cid] = child;
				}
			}

			if (this.canModerate && iAm.user.role) {
				// Если для изменения потребовалась роль модератора/адиминитратора, записываем её на момент удаления
				delInfo.role = iAm.user.role;

				if (iAm.isModerator && _.isNumber(this.canModerate)) {
					delInfo.roleregion = this.canModerate; // В случае с модератором региона, permissions.canModerate возвращает cid региона
				}
			}

			if (Number(data.reason.cid)) {
				delInfo.reason.cid = Number(data.reason.cid);
			}
			if (data.reason.desc) {
				delInfo.reason.desc = Utils.inputIncomingParse(data.reason.desc).result;
			}

			promises.push(commentModel.updateAsync({ cid: cid }, { $set: { lastChanged: delInfo.stamp, del: delInfo } }));

			if (childsCids.length) {
				countCommentsRemoved += childsCids.length;
				delInfoChilds = _.assign(_.omit(delInfo, 'reason'), { origin: cid });

				promises.push(commentModel.updateAsync(
					{ cid: { $in: childsCids } },
					{ $set: { lastChanged: delInfo.stamp, del: delInfoChilds } },
					{ multi: true }
				));
			}

			this.childsCids = childsCids;

			return Bluebird.all(promises);
		})
		.then(function () {
			var frags = this.obj.frags && this.obj.frags.toObject();
			var promises = [];
			var userObj;
			var i;
			var u;

			if (frags) {
				for (i = frags.length; i--;) {
					if (this.commentsHash[frags[i].cid] !== undefined) {
						this.obj.frags.id(frags[i]._id).del = true;
					}
				}
			}

			this.obj.ccount -= countCommentsRemoved;
			promises.push(this.obj.saveAsync());

			for (u in this.hashUsers) {
				userObj = _session.getOnline(null, u);

				if (userObj !== undefined) {
					userObj.user.ccount = userObj.user.ccount - this.hashUsers[u];
					promises.push(_session.saveEmitUser(userObj, null));
				} else {
					promises.push(User.updateAsync({ _id: u }, { $inc: { ccount: -this.hashUsers[u] } }));
				}
			}

			return Bluebird.all(promises);
		})
		.then(function () {
			var myCountRemoved = this.hashUsers[iAm.user._id] || 0; // Кол-во моих комментариев
			var frags;
			var frag;
			var i;

			// Не отдаем фрагменты только не удаленных комментариев, для замены на клиенте
			if (this.obj.frags) {
				this.obj.frags = this.obj.frags.toObject();
				frags = [];
				for (i = 0; i < this.obj.frags.length; i++) {
					frag = this.obj.frags[i];
					if (!frag.del) {
						frags.push(frag);
					}
				}
			}

			actionLogController.logIt(
				iAm.user,
				this.comment._id,
				actionLogController.OBJTYPES.COMMENT,
				actionLogController.TYPES.REMOVE,
				delInfo.stamp,
				delInfo.reason,
				delInfo.roleregion,
				this.childsCids.length ? { childs: this.childsCids.length } : undefined
			);

			return {
				frags: frags,
				countComments: countCommentsRemoved,
				myCountComments: myCountRemoved,
				countUsers: Object.keys(this.hashUsers).length,
				stamp: delInfo.stamp.getTime(),
				delInfo: delInfo
			};
		});
});

/**
 * Восстанавливает комментарий и его потомков
 * @param socket Сокет пользователя
 * @param data
 * @param cb Коллбэк
 */
function restoreComment(socket, data, cb) {
	var iAm = socket.handshake.usObj,
		cid = data && Number(data.cid),
		canModerate,
		obj,
		commentsHash = {},
		hashUsers = {},
		countCommentsRestored = 1,
		commentModel,

		stamp,
		hist,
		histChilds,
		childsCids;

	if (!iAm.registered) {
		return cb({message: msg.deny, error: true});
	}
	if (!_.isObject(data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	commentModel.findOne({cid: cid, del: {$exists: true}}, {_id: 1, obj: 1, user: 1, hidden: 1, del: 1}, {lean: true}, function (err, comment) {
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

				//Нужны права модератора/администратора
				canModerate = permissions.canModerate(data.type, obj, iAm);
				if (!canModerate) {
					return cb({message: msg.deny, error: true});
				}

				//Находим все комментарии, дочерние восстанавливаемому, которые были удалены вместе с ним,
				//т.е. у которых origin указывает на текущий
				commentModel.find({obj: obj._id, 'del.origin': cid}, {_id: 0, obj: 0, stamp: 0, txt: 0, hist: 0}, {lean: true, sort: {stamp: 1}}, this);
			},
			function (err, childs) {
				if (err || !childs) {
					return cb({message: err && err.message || 'Cursor extract error', error: true});
				}
				var child,
					len = childs.length,
					i = 0;

				stamp = new Date();

				//Операции с корневым удаляемым комментарием
				commentsHash[cid] = comment;
				if (!comment.hidden) {
					hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
				}

				childsCids = [];
				countCommentsRestored += len;
				//Обходим потомков восстанавливаемого комментария
				for (; i < len; i++) {
					child = childs[i];
					if (!child.hidden) {
						hashUsers[child.user] = (hashUsers[child.user] || 0) + 1;
					}
					childsCids.push(child.cid);
					commentsHash[child.cid] = child;
				}

				hist = [
					_.assign(_.omit(comment.del, 'origin'), {del: {reason: comment.del.reason}}),
					{user: iAm.user._id, stamp: stamp, restore: true, role: iAm.user.role}
				];
				if (iAm.isModerator && _.isNumber(canModerate)) {
					hist[1].roleregion = canModerate;
				}
				commentModel.update({cid: cid}, {$set: {lastChanged: stamp}, $unset: {del: 1}, $push: {hist: {$each: hist}}}, this.parallel());

				if (childsCids.length) {
					histChilds = [
						_.assign(_.omit(comment.del, 'reason'), {del: {origin: cid}}),
						{user: iAm.user._id, stamp: stamp, restore: true, role: iAm.user.role}
					];
					if (iAm.isModerator && _.isNumber(canModerate)) {
						histChilds[1].roleregion = canModerate;
					}
					commentModel.update({obj: obj._id, 'del.origin': cid}, {$set: {lastChanged: stamp}, $unset: {del: 1}, $push: {hist: {$each: histChilds}}}, {multi: true}, this.parallel());
				}
			},
			function (err) {
				if (err) {
					return cb({message: err.message || 'Comment restore error', error: true});
				}
				var frags = obj.frags && obj.frags.toObject(),
					userObj,
					u, i;

				if (frags) {
					for (i = frags.length; i--;) {
						if (commentsHash[frags[i].cid] !== undefined) {
							obj.frags.id(frags[i]._id).del = undefined;
						}
					}
				}

				obj.ccount += countCommentsRestored;
				obj.save(this.parallel());

				for (u in hashUsers) {
					if (hashUsers[u] !== undefined) {
						userObj = _session.getOnline(null, u);
						if (userObj !== undefined) {
							userObj.user.ccount = userObj.user.ccount + hashUsers[u];
							_session.saveEmitUser(userObj, null, this.parallel());
						} else {
							User.update({_id: u}, {$inc: {ccount: hashUsers[u]}}, this.parallel());
						}
					}
				}
			},
			function (err) {
				if (err) {
					return cb({message: err.message || 'Object or user update error', error: true});
				}
				var frags,
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

				actionLogController.logIt(iAm.user, comment._id, actionLogController.OBJTYPES.COMMENT, actionLogController.TYPES.RESTORE, stamp, undefined, iAm.isModerator && _.isNumber(canModerate) ? canModerate : undefined, childsCids.length ? {childs: childsCids.length} : undefined);
				cb({message: 'Ok', frags: frags, countComments: countCommentsRestored, myCountComments: ~~hashUsers[iAm.user._id], countUsers: Object.keys(hashUsers).length, stamp: stamp.getTime()});
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
	var iAm = socket.handshake.usObj;
	if (!iAm.registered) {
		return cb({message: msg.deny, error: true});
	}
	if (!_.isObject(data) || !data.obj || !Number(data.cid) || !data.txt) {
		return cb({message: 'Bad params', error: true});
	}
	if (data.txt.length > commentMaxLength) {
		return cb({message: msg.maxLength, error: true});
	}
	var cid = Number(data.cid),
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
				hist = {user: iAm.user},
				parsedResult,
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
			parsedResult = Utils.inputIncomingParse(data.txt);
			content = parsedResult.result;

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
				l: Utils.math.toPrecision(Number(data.fragObj.l) || 0, 2),
				t: Utils.math.toPrecision(Number(data.fragObj.t) || 0, 2),
				w: Utils.math.toPrecision(Number(data.fragObj.w) || 20, 2),
				h: Utils.math.toPrecision(Number(data.fragObj.h) || 15, 2)
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
				//Записываем текущий текст(до смены) в объект истории
				hist.txt = comment.txt;
				//Получаем форматированную разницу текущего и нового текста (неформатированных) и записываем в объект истории
				hist.txtd = Utils.txtdiff(Utils.txtHtmlToPlain(comment.txt), parsedResult.plain);
				txtChanged = true;
			}

			if (txtChanged || fragChangedType) {
				hist.frag = fragChangedType || undefined;

				if (canModerate && iAm.user.role) {
					//Если для изменения потребовалась роль модератора/адиминитратора, записываем её на момент изменения
					hist.role = iAm.user.role;
					if (iAm.isModerator && _.isNumber(canModerate)) {
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

	commentModel.findOne({cid: Number(data.cid)}, {_id: 0, user: 1, txt: 1, txtd: 1, stamp: 1, hist: 1, del: 1}, {lean: true}).populate({path: 'user hist.user del.user', select: {_id: 0, login: 1, avatar: 1, disp: 1}}).exec(function (err, comment) {
		if (err || !comment) {
			return cb({message: err && err.message || msg.noCommentExists, error: true});
		}
		var i,
			hist,
			hists = comment.hist || [],
			histDel,
			lastTxtIndex = 0, // Позиция последнего изменение текста в стеке событий
			lastTxtObj = {user: comment.user, stamp: comment.stamp}, // Первое событие изменения текста будет равнятся созданию комментария
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
				del: _.pick(comment.del, 'reason', 'origin'),
				role: comment.del.role,
				roleregion: comment.del.roleregion
			});
		}

		for (i = 0; i < hists.length; i++) {
			hist = hists[i];
			histDel = hist.del;

			if (hist.role && hist.roleregion) {
				hist.roleregion = getregion(hist.roleregion);
			}

			if (histDel || hist.restore) {
				if (histDel && histDel.reason && histDel.reason.cid) {
					histDel.reason.title = reasonController.giveReasonTitle({ cid: histDel.reason.cid });
				}
				result.push(hist);
			} else {
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
			}
			//Если это последняя запись (в случае текущего состояние удаления - предпоследняя) в истории и ранее была смена текста,
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
 * @param iAm Объект пользователя
 * @param data
 * @param cb Коллбэк
 */
function setNoComments(iAm, data, cb) {
	var cid = data && Number(data.cid);

	if (!iAm.registered || !iAm.user.role) {
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
 * Скрывает/открывает комментарии объекта (делает их не публичными/публичными)
 * @param oid _id объекта
 * @param hide Скрыть или наоборот
 * @param iAm Объект пользователя, считаем сколько его комментариев затронуто
 */
function hideObjComments(oid, hide, iAm) {
	var command = {};

	if (hide) {
		command.$set = { hidden: true };
	} else {
		command.$unset = { hidden: 1 };
	}

	return Comment.updateAsync({ obj: oid }, command, { multi: true })
		.spread(function (count) {
			if (count === 0) {
				return { myCount: 0 };
			}

			return Comment.collection.findAsync({ obj: oid }, {}, { lean: true })
				.then(function (comments) {
					var i,
						len = comments.length,
						cdelta,
						userObj,
						comment,
						hashUsers = {};

					for (i = 0; i < len; i++) {
						comment = comments[i];
						if (comment.del === undefined) {
							hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
						}
					}
					for (i in hashUsers) {
						if (hashUsers[i] !== undefined) {
							cdelta = hide ? -hashUsers[i] : hashUsers[i];
							userObj = _session.getOnline(null, i);
							if (userObj !== undefined) {
								userObj.user.ccount = userObj.user.ccount + cdelta;
								_session.saveEmitUser(userObj);
							} else {
								User.update({ _id: i }, { $inc: { ccount: cdelta } }).exec();
							}
						}
					}
					return { myCount: hashUsers[iAm.user._id] || 0 };
				});
		});
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
	UserObjectRel = db.model('UserObjectRel');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('createComment', function (data) {
			createComment(socket, data)
				.catch(function (err) {
					return { message: err.message, error: true };
				})
				.then(function (resultData) {
					socket.emit('createCommentResult', resultData);
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
			removeComment(socket, data)
				.catch(function (err) {
					return { message: err.message, error: true };
				})
				.then(function (resultData) {
					socket.emit('removeCommentResult', resultData);
				});
		});
		socket.on('restoreComment', function (data) {
			restoreComment(socket, data, function (result) {
				socket.emit('restoreCommentResult', result);
			});
		});

		socket.on('setNoComments', function (data) {
			setNoComments(hs.usObj, data, function (result) {
				socket.emit('setNoCommentsResult', result);
			});
		});

		socket.on('giveCommentsObj', function (data) {
			getCommentsObj(hs.usObj, data)
				.catch(function (err) {
					return { message: err.message, error: true };
				})
				.then(function (resultData) {
					socket.emit('takeCommentsObj', resultData);
				});
		});
		socket.on('giveCommentsDel', function (data) {
			getDelTree(hs.usObj, data)
				.catch(function (err) {
					return { message: err.message, error: true };
				})
				.then(function (resultData) {
					socket.emit('takeCommentsDel', resultData);
				});
		});
		socket.on('giveCommentsUser', function (data) {
			getCommentsUser(data)
				.catch(function (err) {
					return { message: err.message, error: true };
				})
				.then(function (resultData) {
					socket.emit('takeCommentsUser', resultData);
				});
		});
		socket.on('giveCommentsFeed', function () {
			getCommentsFeed(hs.usObj)
				.catch(function (err) {
					return { message: err.message, error: true };
				})
				.then(function (resultData) {
					socket.emit('takeCommentsFeed', resultData);
				});
		});
	});

};
module.exports.core = core;
module.exports.hideObjComments = hideObjComments;