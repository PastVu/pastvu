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
	us = {}, //Users. Хэш всех активных соединений подключенных пользователей по логинам
	sess = {}; //Sockets. Хэш всех активных сессий по ключам

function authSocket(handshake, callback) {
	var cookieString = handshake.headers.cookie || '',
		cookieObj = cookie.parse(cookieString),
		existsSid = cookieObj['pastvu.sid'];

	//logger.info(handshake);

	if (existsSid === undefined) {
		console.log(1);
		//Если ключа нет, переходим к созданию сессии
		sessionProcess();
	} else {
		if (sess[existsSid] !== undefined) {
			console.log(2, existsSid);
			//Если ключ есть и он уже есть в хеше, то берем эту уже выбранную сессию
			sessionProcess(null, sess[existsSid]);
		} else {
			console.log(3, existsSid);
			//Если ключ есть, но его еще нет в хеше сессий, то выбираем сессию из базы по этому ключу
			Session.findOne({key: existsSid}).populate('user').exec(function (err, session) {
				if (err) {
					return sessionProcess(err);
				}
				var user = session && session.user,
					usObj;

				if (session) {
					//Если сессия найдена, добавляем её в хеш сессий
					sess[existsSid] = session;

					if (user) {
						console.log(4, user.login);
						usObj = us[user.login];

						if (usObj === undefined) {
							//Если пользователя еще нет в хеше пользователей, создаем объект и добавляем в хеш
							us[user.login] = usObj = {user: user, sessions: {}};
							console.log(5, usObj);
						} else {
							//Если пользователь уже есть в хеше, значит он уже выбран другой сессией и используем уже выбранный объект пользователя
							session.user = usObj.user;
						}

						usObj.sessions[existsSid] = session; //Добавляем сессию в хеш сессий пользователя
					}
				}

				sessionProcess(null, session);
			});
		}
	}

	function sessionProcess(err, session) {
		if (err) {
			return callback('Error: ' + err, false);
		}
		var ip = handshake.address && handshake.address.address;

		//console.log(session && session.key);
		if (!session) {
			//Если сессии нет, создаем и добавляем её в хеш
			session = generate({ip: ip});
			sess[session.key] = session;
			console.log('Create session', session.key);
		} else {
			regen(session, {ip: ip}); //console.log('Regen session', session.key);
			if (session.user) {
				console.info("%s entered", session.user.login);
			}
		}

		handshake.session = session;
		return callback(null, true);
	}
}

function firstConnection(socket) {
	console.log('CONnection');
	var session = socket.handshake.session;

	if (!session.sockets) {
		session.sockets = {};
	}
	session.sockets[socket.id] = socket; //Кладем сокет в сессию

	//Сразу поcле установки соединения отправляем клиенту параметры, куки и себя
	socket.emit('initData', {
		p: settings.getClientParams(),
		cook: emitCookie(socket, true),
		youAre: session.user
	});

	socket.on('disconnect', function () {
		console.log('DISconnection');
		var session = socket.handshake.session,
			user = session.user,
			usObj;

		delete session.sockets[socket.id]; //Удаляем сокет из сесии

		if (Utils.isObjectEmpty(session.sockets)) {
			//Если для этой сессии не осталось соеднений, убираем сессию из хеша сессий
			delete sess[session.key];
			console.log(9, '1.Delete Sess');

			if (user) {
				console.log(9, '2.Delete session from User', user.login);
				//Если в сессии есть пользователь, нужно убрать сессию из пользователя
				usObj = us[user.login];
				delete usObj.sessions[session.key];

				if (Utils.isObjectEmpty(usObj.sessions)) {
					console.log(9, '3.Delete User', user.login);
					//Если сессий у пользователя не осталось, убираем его из хеша пользователей
					delete us[user.login];
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

function regen(session, data, keyRegen, cb) {
	if (keyRegen) {
		session.key = Utils.randomString(12); // При каждом заходе регенерируем ключ (пока только при логине)
	}
	session.stamp = new Date(); // При каждом заходе продлеваем действие ключа
	if (data) {
		_.assign(session.data, data);
		session.markModified('data');
	}
	session.save(function (err, session) {
		//FIXME: Fix when fix https://github.com/LearnBoost/mongoose/issues/1530
		if (session.user) {
			session.populate('user', function () {
				if (cb) {
					cb(err, session);
				}
			});
		} else {
			if (cb) {
				cb(err, session);
			}
		}
	});

	return session;
}

function destroy(session, cb) {
	if (session) {
		session.remove(cb);
	} else {
		cb();
	}
}

function authUser(session, data, cb) {
	var uaParsed,
		uaData,
		someSocket;

	for (var i in session.sockets) {
		if (session.sockets[i] !== undefined) {
			someSocket = session.sockets[i];
		}
	}

	uaParsed = uaParser.parse(someSocket.handshake.headers['user-agent']);
	uaData = {b: uaParsed.ua.family, bv: uaParsed.ua.toVersionString(), os: uaParsed.os.toString(), d: uaParsed.device.family};

	regen(session, {remember: data.remember, ua: uaData}, true, function (err, session) {
		emitCookie(someSocket); //Куки можно обновлять в любом соединении, они обновятся для всех в браузере
	});
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

module.exports.authSocket = authSocket;
module.exports.firstConnection = firstConnection;
module.exports.regen = regen;
module.exports.destroy = destroy;
module.exports.authUser = authUser;
module.exports.emitCookie = emitCookie;

module.exports.loadController = function (a, db, io) {
	app = a;
	Session = db.model('Session');
	User = db.model('User');

	//io.sockets.on('connection', function (socket) {});
};