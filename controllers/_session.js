'use strict';

var app,
	dbNative,
	Session,
	SessionArchive,
	User,
	Utils = require('../commons/Utils.js'),
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	cookie = require('express/node_modules/cookie'),

	errtypes = {
		NO_HEADERS: 'Bad request - no header or user agent',
		BAD_BROWSER: 'Bad browser, we do not support it',
		CANT_CREATE_SESSION: 'Can not create session',
		CANT_GET_SESSION: 'Can not get session',
		ANOTHER: 'Some error occured'
	},

	checkUserAgent = Utils.checkUserAgent({
		'IE': '>=9.0.0',
		'Firefox': '>=6.0.0', //6-я версия - это G+
		'Opera': '>=12.10.0',
		'Chrome': '>=11.0.0', //11 версия - это Android 4 default browser в desktop-режиме
		'Android': '>=4.0.0',
		'Safari': '>=5.1.0',
		'Mobile Safari': '>=5.1.0'
	}),

	getPlainUser = (function () {
		var userToPublicObject = function (doc, ret, options) {
			delete ret._id;
			delete ret.cid;
			delete ret.pass;
			delete ret.activatedate;
			delete ret.loginAttempts;
			delete ret.active;
		};
		return function (user) {
			return user && user.toObject ? user.toObject({transform: userToPublicObject}) : null;
		};
	}()),

	settings = require('./settings.js'),
	regionController = require('./region.js'),

	SESSION_SHELF_LIFE = ms('30d'), //Срок годности сессии с последней активности

	usLogin = {}, //usObjs loggedin by user login.  Хэш пользовательских обектов по login зарегистрированного пользователя
	usId = {}, //usObjs loggedin by user _id. Хэш пользовательских обектов по _id зарегистрированного пользователя
	usSid = {}, //usObjs by session key. Хэш всех пользовательских обектов по ключам сессий. Может быть один объект у нескольких сессий, если клиент залогинен ы нескольких браузерах

	sessConnected = {}, //Sessions. Хэш всех активных сессий, с установленными соединениями
	sessWaitingConnect = {},//Хэш сессий, которые ожидают первого соединения
	sessWaitingSelect = {}; //Хэш сессий, ожидающих выборки по ключу из базы


//Создает объект с кукой ключа сессии
var createSidCookieObj = (function () {
	var key = 'pastvu.sid',
		domain = global.appVar.serverAddr.domain,
		cookieMaxAgeRegisteredRemember = SESSION_SHELF_LIFE / 1000,
		cookieMaxAgeAnonimouse = SESSION_SHELF_LIFE / 1000;

	return function (session) {
		var newCoockie = {key: key, value: session.key, path: '/', domain: domain};

		if (session.user) {
			if (session.data && session.data.remember) {
				newCoockie['max-age'] = cookieMaxAgeRegisteredRemember;
			}
		} else {
			newCoockie['max-age'] = cookieMaxAgeAnonimouse;
		}

		return newCoockie;
	};
}());


//Создаем запись в хэше пользователей (если нет) и добавляем в неё сессию
function userObjectAddSession(session, cb) {
	var registered = !!session.user,
		user = registered ? session.user :  session.anonym,
		usObj = registered ? usLogin[user.login] : usSid[session.key],
		firstAdding = false;

	if (usObj === undefined) {
		firstAdding = true;
		usObj = usSid[session.key] = {user: user, sessions: Object.create(null), rquery: Object.create(null), rshortlvls: [], rshortsel: Object.create(null)};
		if (registered) {
			usLogin[user.login] = usId[user._id] = usObj;
			console.log('Create us hash:', user.login);
		} else {
			usObj.anonym = true;
			console.log('Create anonym hash:', session.key);
		}
	} else {
		if (registered) {
			//Если пользователь уже был в хеше пользователей, т.е. залогинен в другом браузере, присваиваем текущей сессии существующего пользователя
			user = session.user = usObj.user;
			console.log('Add new session to us hash:', user.login);
		} else {
			console.warn('Anonym trying to add new session?! Key: ' + session.key);
		}
	}

	session.usObj = usObj; //Добавляем в сессию ссылку на объект пользователя TODO: Убрать
	usObj.sessions[session.key] = session; //Добавляем сессию в хеш сессий пользователя

	if (firstAdding) {
		userObjectTreatUser(usObj, function (err) {
			cb(null, usObj, firstAdding);
		});
	} else {
		cb(null, usObj, firstAdding);
	}
}

//Создаёт сессию и сохраняет её в базу. Не ждёт результата сохранения
function sessionCreate(ip, headers, browser) {
	var session = new Session({
			key: Utils.randomString(12),
			stamp: new Date(),
			data: {
				ip: ip,
				headers: headers,
				agent: {
					n: browser.agent.family, //Agent name e.g. 'Chrome'
					v: browser.agent.toVersion() //Agent version string e.g. '15.0.874'
				}
			}
		}),
		device = browser.agent.device.toString(), //Device e.g 'Asus A100'
		os = browser.agent.os.toString(); //Operation system e.g. 'Mac OSX 10.8.1'

	if (os) {
		session.data.agent.os = os;
	}
	if (device && device !== 'Other') {
		session.data.agent.d = device;
	}

	session.save();
	return session;
}
//Добавляет созданную или вновь выбранную из базы сессию в память (список ожидания коннектов, хэш пользователей)
function sessionAdd(session, cb) {
	sessWaitingConnect[session.key] = session;
	userObjectAddSession(session, function (err, usObj) {
		cb(err, usObj, session);
	});
}
//Отправляет сессию в архив
function sessionToArchive(session) {
	var sessionArchive = new Session(session.toObject());
	sessionArchive.save();
	return sessionArchive;
}


//Обработчик при первом заходе или  установки соединения сокетом для создания сессии и проверки браузера клиента
function authConnection(ip, headers, finishCb) {
	if (!headers || !headers['user-agent']) {
		return finishCb({type: errtypes.NO_HEADERS}); //Если нет хедера или юзер-агента - отказываем
	}

	var browser = checkUserAgent(headers['user-agent']);
	if (!browser.accept) {
		return finishCb({type: errtypes.BAD_BROWSER, agent: browser.agent});
	}

	var cookieObj = cookie.parse(headers.cookie || ''),
		existsSid = cookieObj['pastvu.sid'],
		session,
		authConnectionFinish = function (err, usObj, session) {
			finishCb(err, usObj, session, browser);
		};

	if (existsSid === undefined) {
		//Если ключа нет, переходим к созданию сессии
		sessionAdd(sessionCreate(ip, headers, browser), authConnectionFinish);
	} else {
		session = sessConnected[existsSid] || sessWaitingConnect[existsSid];
		if (session !== undefined) {
			//Если ключ есть и он уже есть в хеше, то берем эту уже выбранную сессию
			authConnectionFinish(null, usSid[session.key], session); //TODO: Сделать хэш usObjs из ключей сессий
		} else {
			//Если ключ есть, но его еще нет в хеше сессий, то выбираем сессию из базы по этому ключу
			if (sessWaitingSelect[existsSid] !== undefined) {
				//Если запрос сессии с таким ключем в базу уже происходит, просто добавляем обработчик на результат
				sessWaitingSelect[existsSid].push({cb: authConnectionFinish});
			} else {
				//Если запроса к базе еще нет, создаем его
				sessWaitingSelect[existsSid] = [
					{cb: authConnectionFinish}
				];

				Session.findOne({key: existsSid}).populate('user').exec(function (err, session) {
					if (err) {
						return finishCb({type: errtypes.CANT_GET_SESSION});
					}
					sessionAdd(session || sessionCreate(ip, headers, browser), function (err, session) {
						if (Array.isArray(sessWaitingSelect[existsSid])) {
							sessWaitingSelect[existsSid].forEach(function (item) {
								item.cb.call(null, err, session);
							});
							delete sessWaitingSelect[existsSid];
						}
					});
				});
			}
		}
	}
}

//Записываем сокет в сессию, отправляем клиенту первоначальные данные и вешаем обработчик на disconnect
function firstSocketConnection(socket, next) {
	var session = socket.handshake.session;
	//console.log('firstSocketConnection');

	//Если это первый коннект для сессии, перекладываем её в хеш активных сессий
	if (sessConnected[session.key] === undefined && sessWaitingConnect[session.key] !== undefined) {
		sessConnected[session.key] = session;
		delete sessWaitingConnect[session.key];
	}

	if (!sessConnected[session.key]) {
		return next(new Error('Session lost'));
	}

	if (!session.sockets) {
		session.sockets = {};
	}
	session.sockets[socket.id] = socket; //Кладем сокет в сессию

	socket.on('disconnect', function () {
		var session = socket.handshake.session,
			someCount = Object.keys(session.sockets).length,
			user = session.user,
			usObj;

		//console.log('DISconnection');
		delete session.sockets[socket.id]; //Удаляем сокет из сесии

		if (Object.keys(session.sockets).length !== (someCount - 1)) {
			console.log('WARN-Socket not removed (' + socket.id + ')', user && user.login);
		}

		if (!Object.keys(session.sockets).length) {
			//console.log(9, '1.Delete Sess');
			//Если для этой сессии не осталось соединений, убираем сессию из хеша сессий
			someCount = Object.keys(sessConnected).length;
			delete sessConnected[session.key];
			if (Object.keys(sessConnected).length !== (someCount - 1)) {
				console.log('WARN-Session not removed (' + session.key + ')', user && user.login);
			}

			if (user) {
				//console.log(9, '2.Delete session from User', user.login);
				//Если в сессии есть пользователь, нужно убрать сессию из пользователя
				usObj = usLogin[user.login];

				someCount = Object.keys(usObj.sessions).length;
				delete usObj.sessions[session.key];
				if (Object.keys(usObj.sessions).length !== (someCount - 1)) {
					console.log('WARN-Session from user not removed (' + session.key + ')', user && user.login);
				}

				if (!Object.keys(usObj.sessions).length) {
					//console.log(9, '3.Delete User', user.login);
					//Если сессий у пользователя не осталось, убираем его из хеша пользователей
					delete usLogin[user.login];
					delete usId[user._id];
				}
			}
		}
	});
	next();
}

//Периодически уничтожает ожидающие подключения сессии, если они не подключились по сокету в течении 30 секунд
var checkWaitingSess = (function () {
	var checkInterval = ms('10s'),
		sessWaitingPeriod = ms('30s');

	function procedure() {
		var expiredFrontier = new Date(Date.now() - sessWaitingPeriod),
			keys = Object.keys(sessWaitingConnect),
			session,
			usObj,
			i;

		for (i = keys.length; i--;) {
			session = sessWaitingConnect[keys[i]];

			if (session && session.stamp <= expiredFrontier) {
				delete sessWaitingConnect[session.key];

				if (session.user) {
					usObj = usLogin[session.user.login];

					if (usObj) {
						delete usObj.sessions[session.key];

						if (!Object.keys(usObj.sessions).length) {
							//Если сессий у пользователя не осталось, убираем его из хеша пользователей
							delete usLogin[session.user.login];
							delete usId[session.user._id];
						}
					}
				}

			}
		}

		checkWaitingSess();
	}

	return function () {
		setTimeout(procedure, checkInterval);
	};
}());

//Периодически отправляет просроченные сессии в архив
var checkExpiredSessions = (function () {
	var checkInterval = ms('1h'); //Интервал проверки

	function procedure() {
		dbNative.eval('function (frontierDate) {archiveExpiredSessions(frontierDate);}', [new Date() - SESSION_SHELF_LIFE], {nolock: true}, function (err, ret) {
			if (err || !ret) {
				console.log('archiveExpiredSessions error');
			} else {
				console.log(ret.count, ' sessions moved to archive');
			}
			checkExpiredSessions();
		});
	}

	return function () {
		setTimeout(procedure, checkInterval);
	};
}());

function userObjectTreatUser(usObj, cb) {
	var user = usObj.user;
	//Присваиваем ему настройки по умолчанию
	user.settings = _.defaults(user.settings || {}, settings.getUserSettingsDef());
	//Популируем регионы
	popUserRegions(usObj, function (err) {
		cb(err);
	});
}

//Пупулируем регионы пользователя и строим запросы для них
function popUserRegions(usObj, cb) {
	var user = usObj.user,
		paths = [
			{path: 'regionHome', select: {_id: 0, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1}},
			{path: 'regions', select: {_id: 0, cid: 1, title_en: 1, title_local: 1}}
		],
		mod_regions_equals; //Регионы интересов и модерирования равны

	if (user.role === 5) {
		mod_regions_equals = _.isEqual(user.regions, user.mod_regions) || undefined;
		paths.push({path: 'mod_regions', select: {_id: 0, cid: 1, title_en: 1, title_local: 1}});
	}
	user.populate(paths, function (err, user) {
		if (err) {
			return cb(err);
		}
		var regionsData,
			shortRegions;

		if (usObj) {
			regionsData = regionController.buildQuery(user.regions);
			shortRegions = regionController.getShortRegionsParams(regionsData.rhash);
			usObj.rhash = regionsData.rhash;
			usObj.rquery = regionsData.rquery;
			usObj.rshortlvls = shortRegions.lvls;
			usObj.rshortsel = shortRegions.sel;

			if (user.role === 5) {
				regionsData = regionController.buildQuery(user.mod_regions);
				shortRegions = regionController.getShortRegionsParams(regionsData.rhash);
				usObj.mod_rhash = regionsData.rhash;
				usObj.mod_rquery = regionsData.rquery;
				usObj.mod_rshortlvls = shortRegions.lvls;
				usObj.mod_rshortsel = shortRegions.sel;
			}
			if (!mod_regions_equals) {
				delete usObj.mod_regions_equals;
			} else {
				usObj.mod_regions_equals = mod_regions_equals;
			}
		}

		cb(null);
	});
}

//Заново выбирает пользователя из базы и популирует все зависимости. Заменяет ссылки в хешах на эти новые объекты
function regetUser(u, emitHim, emitExcludeSocket, cb) {
	User.findOne({login: u.login}, function (err, user) {
		var usObj = usLogin[user.login]; //TODO: Подавать на вход уже usObj
		userObjectTreatUser(usObj, function (err) {
			if (err || !user) {
				console.log('Error wile regeting user (' + u.login + ')', err && err.message || 'No such user for reget');
				if (cb) {
					cb(err || {message: 'No such user for reget'});
				}
			}

			//Присваиваем новый объект пользователя usObj
			usObj.user = user;
			//Присваиваем новый объект пользователя всем его открытым сессиям
			for (var s in usObj.sessions) {
				usObj.sessions[s].user = user;
			}

			if (emitHim) {
				emitUser(user.login, emitExcludeSocket);
			}
			if (cb) {
				cb(null, user);
			}
		});
	});
}
//TODO: Обрабатывать и анонимных пользователей, популировать регионы
//Заново выбирает онлайн пользователей из базы и популирует у них все зависимости. Заменяет ссылки в хешах на эти новые объекты
//Принимает на вход 'all' или функцию фильтра пользователей
//Не ждет выполнения - сразу возвращает кол-во пользователей, для которых будет reget
function regetUsers(filterFn, emitThem, cb) {
	var usersToReget = filterFn === 'all' ? usLogin : _.filter(usLogin, filterFn),
		usersCount = _.size(usersToReget);

	//_.forEach, потому что usersToReget может быть как объектом (usLogin), так и массивом (результат filter)
	_.forEach(usersToReget, function (usObj) {
		regetUser(usObj.user, emitThem);
	});

	if (cb) {
		cb(null, usersCount);
	}
	return usersCount;
}

function destroy(socket, cb) {
	var session = socket.handshake.session;

	if (session) {
		socket.once('commandResult', function () {
			//Отправляем всем сокетам сессии кроме текущей команду на релоад
			for (var i in session.sockets) {
				if (session.sockets[i] !== undefined && session.sockets[i] !== socket && session.sockets[i].emit !== undefined) {
					session.sockets[i].emit('command', [
						{name: 'location'}
					]);
				}
			}

			//Удаляем сессию из базы
			session.remove(cb);
		});

		//Отправляем автору запроса на логаут комманду на очистку кук, очистится у всех вкладок сессии
		socket.emit('command', [
			{name: 'clearCookie'}
		]);
	} else {
		cb({message: 'No such session'});
	}
}


//Присваивание пользователя сессии при логине, вызывается из auth-контроллера
function authUser(socket, user, data, cb) {
	var session = socket.handshake.session,
		sessionKeyOld = session.key,
		usObjOld = usSid[session.key],
		sessHash = sessWaitingConnect[session.key] ? sessWaitingConnect : sessConnected;

	//Меняем ключ сессии
	session.key = Utils.randomString(12);

	//Присваивание объекта пользователя при логине еще пустому populated-полю сессии вставит туда только _id,
	//поэтому затем после сохранения сессии нужно будет сделать populate на этом поле. (mongoose 3.6)
	//https://github.com/LearnBoost/mongoose/issues/1530
	session.user = user;
	//Удаляем поле анонима из сессии
	session.anonym = undefined;
	//Обновляем время сессии
	session.stamp = new Date();
	//Присваиваем поля data специфичные для залогиненного пользователя
	_.assign(session.data, {remember: data.remember});
	session.markModified('data');

	session.save(function (err, session) {
		if (err) {
			return cb(err);
		}
		session.populate('user', function (err, session) {
			if (err) {
				return cb(err);
			}

			delete usSid[sessionKeyOld]; //Удаляем старый usObj из хэша по сессиям, т.к. для зарегистрированного пользователя он создался заново
			delete usObjOld.sessions[sessionKeyOld]; //Удаляем текущую сессию из удаленного usObj, чтобы gc его забрал
			delete sessHash[session.key]; //Удаляем сессию по старому ключу из хэша сессий
			sessHash[session.key] = session; //Присваиваем сессию по новому ключу в хэш сессий

			//Добавляем сессию в usObj(создастся если нет, а если есть, пользователь в сессию возьмется оттуда вместо спопулированного)
			userObjectAddSession(session, function (err, usObj) {
				if (err) {
					cb(err, session);
				}
				var userPlain = getPlainUser(usObj.user);

				//При логине отправляем пользователя во все сокеты сессии, кроме текущего сокета (ему отправит auth-контроллер)
				for (var i in session.sockets) {
					if (session.sockets[i] !== undefined && session.sockets[i] !== socket && session.sockets[i].emit !== undefined) {
						session.sockets[i].emit('youAre', userPlain);
					}
				}

				emitSidCookie(socket); //Куки можно обновлять в любом соединении, они обновятся для всех в браузере
				cb(err, session, userPlain);
			});
		});
	});
}

//Отправка текущего пользователя всем его подключеным клиентам
function emitUser(login, excludeSocket) {
	var usObj = usLogin[login],
		user,
		sessions,
		sockets,
		i,
		j;

	if (usObj !== undefined) {
		user = getPlainUser(usObj.user);
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
		usObj = usLogin[login];
	} else if (_id) {
		usObj = usId[_id];
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

function emitInitData(socket) {
	var session = socket.handshake.session;

	socket.emit('takeInitData', {
		p: settings.getClientParams(),
		cook: createSidCookieObj(session),
		u: getPlainUser(session.user)
	});
}

function emitSidCookie(socket) {
	socket.emit('updateCookie', createSidCookieObj(socket.handshake.session));
}

//Проверяем если пользователь онлайн
function isOnline(login, _id) {
	if (login) {
		return usLogin[login] !== undefined;
	} else if (_id) {
		return usId[_id] !== undefined;
	}
}

//Берем онлайн-пользователя
function getOnline(login, _id) {
	var usObj;
	if (login) {
		usObj = usLogin[login];
	} else if (_id) {
		usObj = usId[_id];
	}
	if (usObj !== undefined) {
		return usObj.user;
	}
}


module.exports.firstSocketConnection = firstSocketConnection;
module.exports.destroy = destroy;
module.exports.authUser = authUser;
module.exports.emitUser = emitUser;
module.exports.saveEmitUser = saveEmitUser;
module.exports.isOnline = isOnline;
module.exports.getOnline = getOnline;

//Для быстрой проверки на online в некоторых модулях, экспортируем сами хеши
module.exports.usLogin = usLogin;
module.exports.usId = usId;
module.exports.sessConnected = sessConnected;
module.exports.sessWaitingConnect = sessWaitingConnect;
module.exports.regetUser = regetUser;
module.exports.regetUsers = regetUsers;
module.exports.getPlainUser = getPlainUser;


module.exports.handleRequest = function (req, res, next) {
	authConnection(req.ip, req.headers, function (err, usObj, session, browser) {
		if (err) {
			if (err.type === errtypes.BAD_BROWSER) {
				res.statusCode = 200;
				res.render('status/badbrowser', {agent: err.agent, title: 'Вы используете устаревшую версию браузера'});
			} else if (err.type === errtypes.NO_HEADERS) {
				res.send(400, err.type);
			} else {
				res.send(500, err.type);
			}
			return;
		}

		req.handshake = {session: session, usObj: session.usObj};

		//Добавляем в заголовок Set-cookie с идентификатором сессии (создает куку или продлевает её действие на клиенте)
		var cookieObj = createSidCookieObj(session);
		res.cookie(cookieObj.key, cookieObj.value, {maxAge: cookieObj['max-age'] * 1000, path: cookieObj.path, domain: cookieObj.domain});

		//Передаем browser дальше, на случай дальнейшего использования, например, прямого доступа к /badbrowser или /nojs
		req.browser = browser;
		next();
	});
};
module.exports.handleSocket = function (socket, next) {
	var handshake = socket.handshake,
		headers = handshake.headers,
		ip = headers['x-real-ip'] || (handshake.address && handshake.address.address);

	authConnection(ip, headers, function (err, usObj, session) {
		if (err) {
			return next(new Error(err.type));
		}
		handshake.usObj = usObj;
		handshake.session = session;
		next();
	});
};

module.exports.loadController = function (a, db, io) {
	app = a;
	dbNative = db.db;
	Session = db.model('Session');
	SessionArchive = db.model('SessionArchive');
	User = db.model('User');

	checkWaitingSess();
	checkExpiredSessions();

	io.sockets.on('connection', function (socket) {

		socket.on('giveInitData', function (data) {
			emitInitData(socket);
		});

	});
};