'use strict';

var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	News,
	Comment,
	CommentN,
	Counter,
	_ = require('lodash'),
	_s = require('underscore.string'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	appEnv = {},
	host,
	logger;


function cursorExtract(err, cursor) {
	if (err || !cursor) {
		this(err || {message: 'Create cursor error', error: true});
		return;
	}
	cursor.toArray(this);
}

var commentIncomingParse = (function () {
	var reversedEscapeChars = {"<": "lt", ">": "gt", "\"": "quot", "&": "amp", "'": "#39"};
	function escape (txt) {
		//Паттерн из _s.escapeHTML(result); исключая амперсант
		return txt.replace(/[<>"']/g, function (m) {
			return '&' + reversedEscapeChars[m] + ';';
		});
	}

	return function (txt) {
		var result = txt;

		result = _s.trim(result); //Обрезаем концы
		result = escape(result); //Эскейпим

		//Заменяем ссылку на фото на диез-ссылку #xxx
		//Например, http://domain.com/p/123456 -> #123456
		result = result.replace(new RegExp('(^|\\s|\\()(?:https?://)?(?:www.)?' + host + '/p/(\\d{1,8})/?(?=[\\s\\)\\.,]|$)', 'gi'), '$1#$2');

		//Восстанавливаем внтуреннюю ссылку чтобы на следующей операции обернуть её в линк
		//Например, /u/klimashkin/photo -> http://domain.com/u/klimashkin/photo
		result = result.replace(new RegExp('(^|\\s|\\()(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1' + host + '$2');

		//Все ссылки на адреса внутри портала оставляем без доменного имени, от корня, и оборачиваем в линк
		//Например, http://domain.com/u/klimashkin/photo -> /u/klimashkin/photo
		result = result.replace(new RegExp('(^|\\s|\\()(?:https?://)?(?:www.)?' + host + '(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1<a target="_blank" class="innerLink" href="$2">$2</a>');

		//Заменяем диез-ссылку фото #xxx на линк
		//Например, #123456 -> <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>
		result = result.replace(/(^|\s|\()#(\d{1,8})(?=[\s\)\.\,]|$)/g, '$1<a target="_blank" class="sharpPhoto" href="/p/$2">#$2</a>');

		result = Utils.linkifyUrlString(result, '_blank'); //Оборачиваем остальные url в ahref
		result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
		result = _s.clean(result); //Очищаем лишние пробелы
		return result;
	};
}());

/**
 * Выбирает комментарии для объекта
 * @param data Объект
 * @param cb Коллбэк
 */
function getCommentsObj(data, cb) {
	var //start = Date.now(),
		commentsArr,
		objModel,
		commentModel,
		usersHash = {};

	if (!data || !Utils.isType('object', data)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	if (data.type === 'news') {
		objModel = News;
		commentModel = CommentN;
	} else {
		objModel = Photo;
		commentModel = Comment;
	}

	step(
		function findPhoto() {
			objModel.findOne({cid: data.cid}, {_id: 1}, this);
		},
		function createCursor(err, oid) {
			if (err || !oid) {
				cb({message: 'No such object', error: true});
				return;
			}
			commentModel.collection.find({obj: oid._id}, {_id: 0, obj: 0, hist: 0}, {sort: [
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
			Comment.collection.find({user: uid._id}, {_id: 0, lastChanged: 1, cid: 1, photo: 1, stamp: 1, txt: 1}, { skip: skip, limit: commentsUserPerPage, sort: [
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
 * Выбирает последние комментарии по фотографиям
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
 * Создает комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function createComment(socket, data, cb) {
	if (!Utils.isType('object', data) || !data.obj || !data.txt || data.level > 9) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var user = socket.handshake.session.user,
		obj,
		objModel,
		commentModel,
		content = data.txt,
		comment,
		fragAdded = data.type === 'photo' && !data.frag && Utils.isType('object', data.fragObj),
		fragObj,
		countComment;

	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	if (data.type === 'news') {
		objModel = News;
		commentModel = CommentN;
	} else {
		objModel = Photo;
		commentModel = Comment;
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

			objModel.findOne({cid: Number(data.obj)}, {_id: 1, ccount: 1, frags: 1}, this.parallel());
			if (data.parent) {
				commentModel.findOne({cid: data.parent}, {_id: 0, level: 1}, this.parallel());
			}
		},
		function (err, o, parent) {
			if (err || !o) {
				cb({message: err.message || 'No such object', error: true});
				return;
			}
			if (data.parent && (!parent || parent.level >= 9 || data.level !== (parent.level || 0) + 1)) {
				cb({message: 'Something wrong with parent comment', error: true});
				return;
			}
			obj = o;

			comment = {
				cid: countComment,
				obj: o,
				user: user,
				txt: commentIncomingParse(content)
			};
			if (data.parent) {
				comment.parent = data.parent;
				comment.level = data.level;
			}
			if (fragAdded) {
				comment.frag = true;
			}
			new commentModel(comment).save(this);
		},
		function (err) {
			if (err) {
				cb({message: err.message || 'Comment save error', error: true});
				return;
			}

			obj.ccount = (obj.ccount || 0) + 1;
			if (fragAdded) {
				obj.frags.push(fragObj);
			}
			obj.save(this.parallel());

			user.ccount += 1;
			user.save(this.parallel());
		},
		function (err) {
			if (err) {
				cb({message: err.message, error: true});
				return;
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
 * Редактирует комментарий
 * @param socket Сокет пользователя
 * @param data Объект
 * @param cb Коллбэк
 */
function updateComment(socket, data, cb) {
	if (!Utils.isType('object', data) || !data.obj || !Utils.isType('number', data.cid) || !data.txt) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var user = socket.handshake.session.user,
		fragRecieved,
		commentModel;

	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	step(
		function counters() {
			commentModel.findOne({cid: data.cid}, {user: 0}).populate('obj', {cid: 1, frags: 1}).exec(this);
		},
		function (err, comment) {
			if (err || !comment || data.obj !== comment.obj.cid) {
				cb({message: (err && err.message) || 'No such comment', error: true});
				return;
			}
			var i,
				hist = {user: user},
				content = commentIncomingParse(data.txt),
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
				cb({message: err.message, error: true});
				return;
			}
			cb({message: 'ok', comment: comment.toObject({ transform: commentDeleteHist }), frag: fragRecieved});
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
	if (!Utils.isType('object', data) || !Utils.isType('number', data.cid)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var commentModel;

	if (data.type === 'news') {
		commentModel = CommentN;
	} else {
		commentModel = Comment;
	}

	step(
		function counters() {
			commentModel.findOne({cid: data.cid}, {_id: 0, user: 1, txt: 1, stamp: 1, hist: 1}).populate({path: 'user hist.user', select: {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1}}).exec(this);
		},
		function (err, comment) {
			if (err || !comment) {
				cb({message: (err && err.message) || 'No such comment', error: true});
				return;
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
 * Удаляет комментарий
 * @param socket Сокет пользователя
 * @param data
 * @param cb Коллбэк
 */
function removeComment(socket, data, cb) {
	if (!Utils.isType('object', data) || !Utils.isType('number', data.cid)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	var user = socket.handshake.session.user,
		obj,
		hashComments = {},
		hashUsers = {},
		arrComments = [],
		countCommentsRemoved,
		objModel,
		commentModel;

	if (!user || !user.login) {
		cb({message: 'You are not authorized for this action.', error: true});
		return;
	}

	if (data.type === 'news') {
		objModel = News;
		commentModel = CommentN;
	} else {
		objModel = Photo;
		commentModel = Comment;
	}

	step(
		function () {
			commentModel.findOne({cid: data.cid}, {_id: 0, obj: 1}, this);
		},
		function findPhoto(err, comment) {
			objModel.findOne({_id: comment.obj}, {_id: 1, ccount: 1, frags: 1}, this.parallel());
		},
		function createCursor(err, o) {
			if (err || !o) {
				cb({message: (err && err.message) || 'No such object', error: true});
				return;
			}
			obj = o;
			commentModel.collection.find({obj: obj._id}, {_id: 0, obj: 0, stamp: 0, txt: 0}, {sort: [
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
				if (comment.cid === data.cid || (comment.level > 0 && hashComments[comment.parent] !== undefined)) {
					hashComments[comment.cid] = comment;
					hashUsers[comment.user] = (hashUsers[comment.user] || 0) + 1;
					arrComments.push(comment.cid);
				}
			}
			commentModel.remove({cid: {$in: arrComments}}, this);
		},
		function (err, countRemoved) {
			if (err) {
				cb({message: err.message || 'Comment remove error', error: true});
				return;
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
				cb({message: err.message || 'Object or user update error', error: true});
				return;
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
			getCommentsObj(data, function (result) {
				socket.emit('takeCommentsObj', result);
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