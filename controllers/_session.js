'use strict';

var Session,
	User,
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	cookie = require('express/node_modules/cookie'),
	app,

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
	us = {}, //usObjects of registered users by login. Хэш всех активных соединений подключенных зарегистрированных пользователей по логинам
	usid = {}, //usObjects of registered users by _id. Хэш всех активных соединений подключенных зарегистрированных пользователей по _id
	anonyms = {}, //usObjects of anonym users by session key. Хэш всех активных соединений подключенных анонимных пользователей по ключам сессии
	sess = {}, //Sessions. Хэш всех активных сессий, с установленными соединениями
	sessWaitingConnect = {},//Хэш сессий, которые ожидают первого соединения
	sessWaitingSelect = {}; //Хэш сессий, ожидающих выборки по ключу из базы


//Создает объект с кукой ключа сессии
var createSidCookieObj = (function () {
	var key = 'pastvu.sid',
		domain = global.appVar.serverAddr.domain,
		cookieMaxAgeRegisteredRemember = ms('30d') / 1000,
		cookieMaxAgeAnonimouse = ms('14d') / 1000;

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
	var usObj,
		user,
		firstAdding = false;

	if (session.user) {
		user = session.user;
		usObj = us[user.login];
		if (usObj === undefined) {
			firstAdding = true;
			usObj = us[user.login] = usid[user._id] = {user: user, sessions: Object.create(null), rquery: Object.create(null), rshortlvls: [], rshortsel: Object.create(null)};
			console.log('Create us hash:', user.login);
		} else {
			//Если пользователь уже был в хеше пользователей, т.е. залогинен в другом браузере, присваиваем текущей сессии существующего пользователя
			user = session.user = usObj.user;
			console.log('Add new session to us hash:', user.login);
		}
	} else if (session.anonym) {
		user = session.anonym;
		usObj = anonyms[session.key];
		if (usObj === undefined) {
			firstAdding = true;
			usObj = anonyms[session.key] = {user: user, anonym: true, sessions: Object.create(null), rquery: Object.create(null), rshortlvls: [], rshortsel: Object.create(null)};
			console.log('Create anonym hash:', session.key);
		}
	} else {
		console.error('Session without user or anonym! Key: ' + session.key);
		return cb({message: 'Session without user or anonym'});
	}

	session.usObj = usObj; //Добавляем в сессию ссылку на объект пользователя
	usObj.sessions[session.key] = session; //Добавляем сессию в хеш сессий пользователя

	if (firstAdding) {
		userObjectTreatUser(usObj, function (err) {
			cb(null, usObj, firstAdding);
		});
	} else {
		cb(null, usObj, firstAdding);
	}
}

function userObjectTreatUser(usObj, cb) {
	var user = usObj.user;
	//Присваиваем ему настройки по умолчанию
	user.settings = _.defaults(user.settings || {}, settings.getUserSettingsDef());
	//Популируем регионы
	popUserRegions(usObj, function (err) {
		cb(err);
	});
}

function handleRequest(req, res, next) {
	authConnection(req.ip, req.headers, function (err, session, browser) {
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
		//Добавляем в заголовок Set-cookie с идентификатором сессии (создает куку или продлевает её действие на клиенте)
		var cookieObj = createSidCookieObj(session);
		res.cookie(cookieObj.key, cookieObj.value, {maxAge: cookieObj['max-age'] * 1000, path: cookieObj.path, domain: cookieObj.domain});

		//Передаем browser дальше, на случай дальнейшего использования, например, прямого доступа к /badbrowser или /nojs
		req.browser = browser;
		req.usObj = session.usObj;
		next();
	});
}
function handleSocket(socket, next) {
	var handshake = socket.handshake,
		headers = handshake.headers,
		ip = headers['x-real-ip'] || (handshake.address && handshake.address.address);

	authConnection(ip, headers, function (err, session) {
		if (err) {
			return next(new Error(err.type));
		}
		handshake.session = session;
		next();
	});
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
		authConnectionFinish = function (err, session) {
			finishCb(err, session, browser);
		};

	if (existsSid === undefined) {
		//Если ключа нет, переходим к созданию сессии
		sessionProcess(sessionCreate(ip, headers, browser), authConnectionFinish);
	} else {
		session = sess[existsSid] || sessWaitingConnect[existsSid];
		if (session !== undefined) {
			//Если ключ есть и он уже есть в хеше, то берем эту уже выбранную сессию
			authConnectionFinish(sess[existsSid] || sessWaitingConnect[existsSid]);
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
					sessionProcess(session || sessionCreate(ip, headers, browser), function (err, session) {
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
function sessionProcess(session, cb) {
	sessWaitingConnect[session.key] = session;
	userObjectAddSession(session, function (err) {
		cb(err, session);
	});
}

//Записываем сокет в сессию, отправляем клиенту первоначальные данные и вешаем обработчик на disconnect
function firstSocketConnection(socket, next) {
	var session = socket.handshake.session;
	//console.log('firstSocketConnection');

	//Если это первый коннект для сессии, перекладываем её в хеш активных сессий
	if (sess[session.key] === undefined && sessWaitingConnect[session.key] !== undefined) {
		sess[session.key] = session;
		delete sessWaitingConnect[session.key];
	}

	if (!sess[session.key]) {
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
			someCount = Object.keys(sess).length;
			delete sess[session.key];
			if (Object.keys(sess).length !== (someCount - 1)) {
				console.log('WARN-Session not removed (' + session.key + ')', user && user.login);
			}

			if (user) {
				//console.log(9, '2.Delete session from User', user.login);
				//Если в сессии есть пользователь, нужно убрать сессию из пользователя
				usObj = us[user.login];

				someCount = Object.keys(usObj.sessions).length;
				delete usObj.sessions[session.key];
				if (Object.keys(usObj.sessions).length !== (someCount - 1)) {
					console.log('WARN-Session from user not removed (' + session.key + ')', user && user.login);
				}

				if (!Object.keys(usObj.sessions).length) {
					//console.log(9, '3.Delete User', user.login);
					//Если сессий у пользователя не осталось, убираем его из хеша пользователей
					delete us[user.login];
					delete usid[user._id];
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

	function clearWaitingSess() {
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
					usObj = us[session.user.login];

					if (usObj) {
						delete usObj.sessions[session.key];

						if (!Object.keys(usObj.sessions).length) {
							//Если сессий у пользователя не осталось, убираем его из хеша пользователей
							delete us[session.user.login];
							delete usid[session.user._id];
						}
					}
				}

			}
		}

		checkWaitingSess();
	}

	return function () {
		setTimeout(clearWaitingSess, checkInterval);
	};
}());

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
		var usObj = us[user.login]; //TODO: Подавать на вход уже usObj
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
	var usersToReget = filterFn === 'all' ? us : _.filter(us, filterFn),
		usersCount = _.size(usersToReget);

	//_.forEach, потому что usersToReget может быть как объектом (us), так и массивом (результат filter)
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
		usObjRegistered = us[user.login],
		usObj = anonyms[session.key],
		sessHash = sessWaitingConnect[session.key] ? sessWaitingConnect : sess;

	//Меняем ключ сессии и сразу переставляем его в хеше сессий, чтобы не возникло ситуации задержки смены в хеше, пока сессия сохраняется
	delete sessHash[session.key];
	session.key = Utils.randomString(12);
	sessHash[session.key] = session;

	//Удаляем usObj из хеша анонимных
	delete anonyms[session.key];
	if (usObjRegistered) {
		//Если объект пользователя уже есть онлайн в другом браузере, кладем в него текушюу сессию
		usObjRegistered.sessions[session.key] = session;
	} else {
		//Если перввый вход, кладем в хэш зарегистрированных текущий объект
		us[user.login] = usid[user.id] = usObj;
	}

	//Присваивание объекта пользователя при логине еще пустому populated-полю сессии вставит туда только _id,
	//поэтому затем после сохранения сессии нужно будет сделать populate на этом поле. (mongoose 3.6)
	//https://github.com/LearnBoost/mongoose/issues/1530
	session.user = user;

	_.assign(session.data, {remember: data.remember});
	session.markModified('data');
	session.stamp = new Date();

	session.save(function (err, session) {
		if (err) {
			return cb(err);
		}
		session.populate('user', function (err, session) {
			if (err) {
				return cb(err);
			}
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
	var usObj = us[login],
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
		return us[login] !== undefined;
	} else if (_id) {
		return usid[_id] !== undefined;
	}
}

//Берем онлайн-пользователя
function getOnline(login, _id) {
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


module.exports.handleRequest = handleRequest;
module.exports.handleSocket = handleSocket;
module.exports.firstSocketConnection = firstSocketConnection;
module.exports.destroy = destroy;
module.exports.authUser = authUser;
module.exports.emitUser = emitUser;
module.exports.saveEmitUser = saveEmitUser;
module.exports.isOnline = isOnline;
module.exports.getOnline = getOnline;

//Для быстрой проверки на online в некоторых модулях, экспортируем сами хеши
module.exports.us = us;
module.exports.usid = usid;
module.exports.sess = sess;
module.exports.sessWaitingConnect = sessWaitingConnect;
module.exports.regetUser = regetUser;
module.exports.regetUsers = regetUsers;
module.exports.getPlainUser = getPlainUser;

module.exports.loadController = function (a, db, io) {
	app = a;
	Session = db.model('Session');
	User = db.model('User');

	checkWaitingSess();

	io.sockets.on('connection', function (socket) {

		socket.on('giveInitData', function (data) {
			emitInitData(socket);
		});

	});
};