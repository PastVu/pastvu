'use strict';

var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	News,
	Comment,
	CommentN,
	Counter,
	subdl = global.appVar.serverAddr.subdomains.length,
	preaddrs = global.appVar.serverAddr.subdomains.map(function (sub) {
		return 'http://' + sub + '.' + global.appVar.serverAddr.host;
	}),
	_ = require('lodash'),
	_s = require('underscore.string'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	appEnv = {},
	host,
	logger,

	photoController = require('./photo.js');

/**
 * Выбирает комментарии для объекта
 * @param user
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsObj(user, data, cb) {
	var //start = Date.now(),
		cid,
		commentsArr,
		commentModel,
		usersHash = {};

	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}
	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	cid = Number(data.cid);
	step(
		function findObj() {
			if (data.type === 'news') {
				News.findOne({cid: cid}, {_id: 1}, this);
			} else {
				photoController.findPhoto({cid: cid}, {_id: 1}, user, true, this);
			}
		},
		function createCursor(err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || 'No such object', error: true});
			}
			commentModel.collection.find({obj: obj._id}, {_id: 0, obj: 0, hist: 0}, {sort: [
				['stamp', 'asc']
			]}, this);
		},
		Utils.cursorExtract,
		function (err, comments) {
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

			commentsArr = comments;
			User.collection.find({_id: { $in: usersArr }}, {_id: 1, login: 1, avatar: 1, firstName: 1, lastName: 1}, this);
		},
		Utils.cursorExtract,
		function (err, users) {
			if (err || !users) {
				return cb({message: err && err.message || 'Cursor users extract error', error: true});
			}
			var i,
				comment,
				user,
				userFormatted,
				userFormattedHash = {},
				avatar;

			i = users.length;
			while (i) {
				user = users[--i];
				if (user.avatar) {
					if (subdl) {
						avatar = preaddrs[i % subdl] + '/_avatar/h/' + user.avatar;
					} else {
						avatar = '/_avatar/h/' + user.avatar;
					}
				} else {
					avatar = '/img/caps/avatarth.png';
				}
				userFormatted = {
					login: user.login,
					avatar: avatar,
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
			cb({message: 'ok', cid: cid, comments: commentsArr, users: userFormattedHash});
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
function getCommentsFeed(data, cb) {
	var /*start = Date.now(),*/
		commentsArr,
		photosHash = {};

	if (!data || !Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function createCursor() {
			Comment.collection.find({hidden: {$exists: false}}, {_id: 0, cid: 1, obj: 1, txt: 1}, {limit: Math.min(data.limit || 20, 100), sort: [
				['stamp', 'desc']
			]}, this);
		},
		Utils.cursorExtract,
		function (err, comments) {
			if (err || !comments) {
				return cb({message: err && err.message || 'Cursor extract error', error: true});
			}
			var i = comments.length,
				photoId,
				photosArr = [];

			while (i) {
				photoId = comments[--i].obj;
				if (photosHash[photoId] === undefined) {
					photosHash[photoId] = true;
					photosArr.push(photoId);
				}
			}

			commentsArr = comments;
			Photo.collection.find({_id: {$in: photosArr}}, {_id: 1, cid: 1, file: 1, title: 1}, this);
		},
		Utils.cursorExtract,
		function (err, photos) {
			if (err || !photos) {
				return cb({message: err && err.message || 'Cursor photos extract error', error: true});
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
				comment.obj = photosHash[comment.obj].cid;
			}

			//console.dir('comments in ' + ((Date.now() - start) / 1000) + 's');
			cb({message: 'ok', comments: commentsArr, photos: photoFormattedHash});
		}
	);
}

/**
 * Создает комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function createComment(socket, data, cb) {
	if (!socket.handshake.session.user) {
		return cb({message: 'You do not have permission for this action', error: true});
	}
	if (!Utils.isType('object', data) || !data.obj || !data.txt || data.level > 9) {
		return cb({message: 'Bad params', error: true});
	}

	var user = socket.handshake.session.user,
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
				News.findOne({cid: Number(data.obj)}, {_id: 1, ccount: 1, frags: 1}, this.parallel());
			} else {
				photoController.findPhoto({cid: Number(data.obj)}, {_id: 1, ccount: 1, frags: 1}, user, true, this.parallel());
			}

			if (data.parent) {
				commentModel.findOne({cid: data.parent}, {_id: 0, level: 1}, this.parallel());
			}
		},
		function counterUp(err, o, parent) {
			if (err || !o) {
				return cb({message: err && err.message || 'No such object', error: true});
			}
			if (data.type === 'photo' && o.fresh) {
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
				user: user,
				txt: Utils.inputIncomingParse(content)
			};
			if (data.parent) {
				comment.parent = data.parent;
				comment.level = data.level;
			}
			if (obj.disabled || obj.del) {
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
				user.ccount += 1;
				user.save(this.parallel());
			}
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			comment.user = user.login;
			comment.obj = data.obj;
			if (comment.level === undefined) {
				comment.level = 0;
			}
			auth.sendMe(socket);
			cb({message: 'ok', comment: comment, frag: fragObj});
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
		return cb({message: 'You do not have permission for this action', error: true});
	}
	if (!Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}
	var cid = Number(data.cid),
		user = socket.handshake.session.user,
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
			commentModel.findOne({cid: cid}, {_id: 0, obj: 1}, this);
		},
		function findObj(err, comment) {
			if (err || !comment) {
				return cb({message: err && err.message || 'No such comment', error: true});
			}
			if (data.type === 'news') {
				News.findOne({_id: comment.obj}, {_id: 1, ccount: 1, frags: 1}, this.parallel());
			} else {
				photoController.findPhoto({_id: comment.obj}, {_id: 1, ccount: 1, frags: 1}, user, true, this.parallel());
			}
		},
		function createCursor(err, o) {
			if (err || !o) {
				return cb({message: err && err.message || 'No such object', error: true});
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
				if (comment.cid === cid || (comment.level > 0 && hashComments[comment.parent] !== undefined)) {
					hashComments[comment.cid] = comment;
					//Если комментарий скрыт, то его уже не надо вычитать из статистики пользователя
					if (!comment.hidden) {
						hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
					}
					arrComments.push(comment.cid);
				}
			}
			commentModel.remove({cid: {$in: arrComments}}, this);
		},
		function (err, countRemoved) {
			if (err) {
				return cb({message: err.message || 'Comment remove error', error: true});
			}
			var frags = obj.frags.toObject(),
				i = frags.length,
				u;
			while (i--) {
				if (hashComments[frags[i].cid] !== undefined) {
					obj.frags.id(frags[i]._id).remove();
				}
			}
			obj.ccount -= countRemoved;
			obj.save(this.parallel());

			for (u in hashUsers) {
				if (hashUsers[u] !== undefined) {
					User.update({_id: u}, {$inc: {ccount: -hashUsers[u]}}, this.parallel());
				}
			}
			countCommentsRemoved = countRemoved;
		},
		function (err) {
			if (err) {
				return cb({message: err.message || 'Object or user update error', error: true});
			}
			// Если среди удаляемых комментариев есть мой, вычитаем их из сессии и отправляем "обновленного себя"
			if (hashUsers[user._id] !== undefined) {
				user.ccount -= hashUsers[user._id];
				auth.sendMe(socket);
			}
			cb({message: 'Removed ' + countCommentsRemoved + ' comments from ' + Object.keys(hashUsers).length + ' users', frags: obj.frags && obj.frags.toObject(), countComments: countCommentsRemoved});
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
		return cb({message: 'You do not have permission for this action', error: true});
	}
	if (!Utils.isType('object', data) || !data.obj || !Number(data.cid) || !data.txt) {
		return cb({message: 'Bad params', error: true});
	}
	var user = socket.handshake.session.user,
		fragRecieved,
		commentModel;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	step(
		function () {
			commentModel.findOne({cid: data.cid}, {user: 0}).populate('obj', {cid: 1, frags: 1}).exec(this);
		},
		function (err, comment) {
			if (err || !comment || data.obj !== comment.obj.cid) {
				return cb({message: err && err.message || 'No such comment', error: true});
			}
			var i,
				hist = {user: user},
				content = Utils.inputIncomingParse(data.txt),
				fragExists,
				fragChangedType,
				txtChanged;

			if (comment.obj.frags) {
				for (i = comment.obj.frags.length; i--;) {
					if (comment.obj.frags[i].cid === comment.cid) {
						fragExists = comment.obj.frags[i];
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
					comment.obj.frags.push(fragRecieved);
				} else if (fragRecieved.l !== fragExists.l || fragRecieved.t !== fragExists.t || fragRecieved.w !== fragExists.w || fragRecieved.h !== fragExists.h) {
					//Если фрагмент получен, он был раньше, но что-то в нем изменилось, то удаляем старый и вставляем полученный
					fragChangedType = 2;
					comment.obj.frags.pull(fragExists._id);
					comment.obj.frags.push(fragRecieved);
				}
			} else if (fragExists) {
				//Если фрагмент не получен, но раньше он был, то просто удаляем старый
				fragChangedType = 3;
				comment.frag = undefined;
				comment.obj.frags.pull(fragExists._id);
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
					comment.obj.save(this.parallel());
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
			commentModel.findOne({cid: Number(data.cid)}, {_id: 0, user: 1, txt: 1, stamp: 1, hist: 1}).populate({path: 'user hist.user', select: {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1}}).exec(this);
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
 * Скрывает комментарии объекта (делает их не публичными)
 * @param oid _id объекта
 * @param hide Скрыть или наоборот
 * @param user Пользователь сессии, считаем сколько его комментариев затронуто
 * @param cb Коллбэк
 */
function hideObjComments(oid, hide, user, cb) {
	step (
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
				comment,
				hashUsers = {};

			for (i = 0; i < len; i++) {
				comment = comments[i];
				hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
			}
			for (i in hashUsers) {
				if (hashUsers[i] !== undefined) {
					User.update({_id: i}, {$inc: {ccount: hide ? -hashUsers[i] : hashUsers[i]}}).exec();
				}
			}
			cb(null, {myCount: hashUsers[user._id] || 0});
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
		socket.on('giveCommentsFeed', function (data) {
			getCommentsFeed(data, function (result) {
				socket.emit('takeCommentsFeed', result);
			});
		});

	});
};
module.exports.hideObjComments = hideObjComments;