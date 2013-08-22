'use strict';

var Session,
	User,
	Utils = require('../commons/Utils.js'),
	uaParser = require('ua-parser'),
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	cookie = require('express/node_modules/cookie'),
	app,
	cookieMaxAgeRegisteredRemember = ms('14d') / 1000,
	cookieMaxAgeAnonimouse = ms('14d') / 1000,

	settings = require('./settings.js'),
	us = {}, //Users by login. Хэш всех активных соединений подключенных пользователей по логинам
	usid = {}, //Users by _id. Хэш всех активных соединений подключенных пользователей по ключам _id
	sess = {}, //Sessions. Хэш всех активных сессий по ключам
	sessWaitings = {}; //Хэш ожидания выборки сессии по ключу из базы


//Добавляем сессию в хеш пользователей
function addUserSession(session) {
	var user = session.user,
		usObj = us[user.login];

	if (usObj === undefined) {
		//Если пользователя еще нет в хеше пользователей, создаем объект и добавляем в хеш
		us[user.login] = usid[user._id] = usObj = {user: user, sessions: {}};
		console.log('Create us hash:', user.login);
	} else {
		//Если пользователь уже есть в хеше, значит он уже выбран другой сессией и используем уже выбранный объект пользователя
		session.user = usObj.user;
		console.log('Add new session to us hash:', user.login, session.user === usObj.user);
	}

	usObj.sessions[session.key] = session; //Добавляем сессию в хеш сессий пользователя
}

//Обработчик установки соединения сокетом 'authorization'
function authSocket(handshake, callback) {
	var cookieString = handshake.headers.cookie || '',
		cookieObj = cookie.parse(cookieString),
		existsSid = cookieObj['pastvu.sid'];

	//logger.info(handshake);

	if (existsSid === undefined) {
		//Если ключа нет, переходим к созданию сессии
		finishAuthConnection(sessionProcess());
	} else {
		if (sess[existsSid] !== undefined) {
			//Если ключ есть и он уже есть в хеше, то берем эту уже выбранную сессию
			finishAuthConnection(sessionProcess(null, sess[existsSid]));
		} else {
			//Если ключ есть, но его еще нет в хеше сессий, то выбираем сессию из базы по этому ключу

			if (sessWaitings[existsSid] !== undefined) {
				//Если запрос сессии с таким ключем в базу уже происходит, просто добавляем обработчик на результат
				sessWaitings[existsSid].push({cb: finishAuthConnection});
			} else {
				//Если запроса к базе еще нет, создаем его
				sessWaitings[existsSid] = [
					{cb: finishAuthConnection}
				];

				Session.findOne({key: existsSid}).populate('user').exec(function (err, session) {
					session = sessionProcess(err, session); //Переприсваиваем, так как если не выбралась из базы, она создаться

					sess[existsSid] = session; //Добавляем сессию в хеш сессий

					if (session.user) {
						addUserSession(session); //Если есть юзер, добавляем его в хеш пользователей
					}

					if (sessWaitings[existsSid] !== undefined) {
						sessWaitings[existsSid].forEach(function (item) {
							item.cb.call(global, session);
						});
						delete sessWaitings[existsSid];
					}
				});
			}
		}
	}

	function sessionProcess(err, session) {
		if (err) {
			return callback('Error: ' + err, false);
		}
		var ip = handshake.address && handshake.address.address;

		if (!session) {
			//Если сессии нет, создаем и добавляем её в хеш
			session = generate({ip: ip});
			sess[session.key] = session;
		} else {
			regen(session, {ip: ip});
		}
		return session;
	}

	function finishAuthConnection(session) {
		handshake.session = session;
		return callback(null, true);
	}
}

//Первый обработчик on.connection
//Записываем сокет в сессию, отправляем клиенту первоначальные данные и вешаем обработчик на disconnect
function firstConnection(socket) {
	var session = socket.handshake.session;

	if (!session.sockets) {
		session.sockets = {};
	}
	session.sockets[socket.id] = socket; //Кладем сокет в сессию

	//Сразу поcле установки соединения отправляем клиенту параметры, куки и себя
	socket.emit('connectData', {
		p: settings.getClientParams(),
		cook: emitCookie(socket, true),
		u: session.user && session.user.toObject ? session.user.toObject() : null
	});

	socket.on('disconnect', function () {
		var session = socket.handshake.session,
			user = session.user,
			usObj;

		//console.log('DISconnection');
		delete session.sockets[socket.id]; //Удаляем сокет из сесии

		if (Utils.isObjectEmpty(session.sockets)) {
			//console.log(9, '1.Delete Sess');
			//Если для этой сессии не осталось соединений, убираем сессию из хеша сессий
			delete sess[session.key];

			if (user !== undefined) {
				//console.log(9, '2.Delete session from User', user.login);
				//Если в сессии есть пользователь, нужно убрать сессию из пользователя
				usObj = us[user.login];
				delete usObj.sessions[session.key];

				if (Utils.isObjectEmpty(usObj.sessions)) {
					//console.log(9, '3.Delete User', user.login);
					//Если сессий у пользователя не осталось, убираем его из хеша пользователей
					delete us[user.login];
					delete usid[user._id];
				}
			}
		}
	});
}

function generate(data, cb) {
	var session = new Session({
		key: Utils.randomString(12),
		stamp: new Date(),
		data: data || {}
	});

	session.save(function (err, session) {
		if (cb) {
			cb(err, session);
		}
	});

	return session;
}

function destroy(socket, cb) {
	var session = socket.handshake.session;

	if (session) {
		socket.once('commandResult', function () {
			//Отправляем всем сокетам сессии кроме текущей команду на релоад
			for (var i in session.sockets) {
				if (session.sockets[i] !== undefined && session.sockets[i] !== socket && session.sockets[i].emit !== undefined) {
					session.sockets[i].emit('command', [{name: 'location'}]);
				}
			}

			//Удаляем сессию из базы
			session.remove(cb);
		});

		//Отправляем автору запроса на логаут комманду на очистку кук, очистится у всех вкладок сессии
		socket.emit('command', [{name: 'clearCookie'}]);
	} else {
		cb({message: 'No such session'});
	}
}

/**
 * Добавляеи в сессию новые данные, продлевает действие и сохраняет в базу
 * @param session Сессия
 * @param data Свойства для вставки в data сессии
 * @param keyRegen Менять ли ключ сессии
 * @param userRePop Популировать ли пользователя сессии из базы
 * @param cb Коллбек
 */
function regen(session, data, keyRegen, userRePop, cb) {
	if (keyRegen) {
		session.key = Utils.randomString(12); // При каждом заходе регенерируем ключ (пока только при логине)
	}
	session.stamp = new Date(); // При каждом заходе продлеваем действие ключа
	if (data) {
		_.assign(session.data, data);
		session.markModified('data');
	}
	session.save(function (err, session) {
		if (err) {
			if (cb) {
				cb(err);
			}
			return;
		}

		//Присваивание объекта пользователя при логине еще пустому populated-полю сессии вставит туда только _id,
		//поэтому затем после сохранения сессии нужно будет сделать populate на этом поле. (mongoose 3.6)
		//https://github.com/LearnBoost/mongoose/issues/1530
		if (userRePop && session.user) {
			session.populate('user', function (err) {
				if (cb) {
					cb(err, session);
				}
			});
		} else if (cb) {
			cb(err, session);
		}
	});

	return session;
}

//Присваивание пользователя сессии при логине, вызывается из auth-контроллера
function authUser(socket, user, data, cb) {
	var session = socket.handshake.session,
		uaParsed,
		uaData;

	session.user = user; //Здесь присвоится только _id и далее он спопулируется в regen
	delete sess[session.key]; //Удаляем сессию из хеша, так как у неё изменится ключ

	uaParsed = uaParser.parse(socket.handshake.headers['user-agent']);
	uaData = {b: uaParsed.ua.family, bv: uaParsed.ua.toVersionString(), os: uaParsed.os.toString(), d: uaParsed.device.family};

	regen(session, {remember: data.remember, ua: uaData}, true, true, function (err, session) {
		//Здесь объект пользователя в сессии будет уже другим, заново спопулированный

		sess[session.key] = session; //После регена надо опять положить сессию в хеш с новым ключем
		addUserSession(session); //Кладем сессию в хеш сессий пользователя. Здесь пользователь сессии может опять переприсвоиться, если пользователь уже был в хеше пользователей, т.е. залогинен в другом браузере.

		//При логине отправляем пользователя во все сокеты сессии, кроме текущего сокета (ему отправит auth-контроллер)
		for (var i in session.sockets) {
			if (session.sockets[i] !== undefined && session.sockets[i] !== socket && session.sockets[i].emit !== undefined) {
				session.sockets[i].emit('youAre', user.toObject());
			}
		}

		emitCookie(socket); //Куки можно обновлять в любом соединении, они обновятся для всех в браузере
		cb(err, session);
	});
}

//Отправка текущего пользователя всем его подключеным клиентам
function emitUser(login, excludeSocket) {
	var usObj = us[login],
		user,
		sessions,
		sockets,
		i,
		j;

	if (usObj !== undefined) {
		user = usObj.user.toObject();
		sessions = usObj.sessions;

		for (i in sessions) {
			if (sessions[i] !== undefined) {
				sockets = sessions[i].sockets;
				for (j in sockets) {
					if (sockets[j] !== undefined && sockets[j] !== excludeSocket && sockets[j].emit !== undefined) {
						sockets[j].emit('youAre', user);
					}
				}
			}
		}
	}
}

//Сохранение и последующая отправка
function saveEmitUser(login, _id, excludeSocket, cb) {
	var usObj;
	if (login) {
		usObj = us[login];
	} else if (_id) {
		usObj = usid[_id];
	}

	if (usObj !== undefined && usObj.user !== undefined) {
		usObj.user.save(function (err) {
			emitUser(usObj.user.login, excludeSocket);
			if (cb) {
				cb();
			}
		});
	}
}

function emitCookie(socket, dontEmit) {
	var newCoockie = {name: 'pastvu.sid', key: socket.handshake.session.key, path: '/'};

	if (socket.handshake.session.user) {
		if (socket.handshake.session.data && socket.handshake.session.data.remember) {
			newCoockie['max-age'] = cookieMaxAgeRegisteredRemember;
		}
	} else {
		newCoockie['max-age'] = cookieMaxAgeAnonimouse;
	}

	if (!dontEmit) {
		socket.emit('updateCookie', newCoockie);
	}

	return newCoockie;
}

//Проверяем если пользователь онлайн
function isOnline (login, _id) {
	if (login) {
		return us[login] !== undefined;
	} else if (_id) {
		return usid[_id] !== undefined;
	}
}

//Берем онлайн-пользователя
function getOnline (login, _id) {
	var usObj;
	if (login) {
		usObj = us[login];
	} else if (_id) {
		usObj = usid[_id];
	}
	if (usObj !== undefined) {
		return usObj.user;
	}
}

module.exports.authSocket = authSocket;
module.exports.firstConnection = firstConnection;
module.exports.regen = regen;
module.exports.destroy = destroy;
module.exports.authUser = authUser;
module.exports.emitUser = emitUser;
module.exports.saveEmitUser = saveEmitUser;
module.exports.emitCookie = emitCookie;
module.exports.isOnline = isOnline;
module.exports.getOnline = getOnline;

//Для быстрой проверки на online в некоторых модулях, экспортируем сами хеши
module.exports.us = us;
module.exports.usid = usid;
module.exports.sess = sess;

module.exports.loadController = function (a, db, io) {
	app = a;
	Session = db.model('Session');
	User = db.model('User');

	//io.sockets.on('connection', function (socket) {});
};