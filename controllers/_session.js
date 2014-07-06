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

	settings = require('./settings.js'),
	regionController = require('./region.js'),

	errtypes = {
		NO_HEADERS: 'Bad request - no header or user agent',
		BAD_BROWSER: 'Bad browser, we do not support it',
		CANT_CREATE_SESSION: 'Can not create session',
		CANT_UPDATE_SESSION: 'Can not update session',
		CANT_GET_SESSION: 'Can not get session',
		CANT_POPUSER_SESSION: 'Can not populate user session',
		ANOTHER: 'Some error occured'
	},

	checkUserAgent = Utils.checkUserAgent({
		'IE': '>=9.0.0',
		'Firefox': '>=6.0.0', //6-я версия - это G+
		'Opera': '>=12.10.0',
		'Chrome': '>=11.0.0', //11 версия - это Android 4 default browser в desktop-режиме
		'Android': '>=4.0.0',
		'Safari': '>=5.1.4',
		'Mobile Safari': '>=5.1.0'
	}),

	getBrowserAgent = function (browser) {
		var agent = {
				n: browser.agent.family, //Agent name e.g. 'Chrome'
				v: browser.agent.toVersion() //Agent version string e.g. '15.0.874'
			},
			device = browser.agent.device.toString(), //Device e.g 'Asus A100'
			os = browser.agent.os.toString(); //Operation system e.g. 'Mac OSX 10.8.1'

		if (os) {
			agent.os = os;
		}
		if (device && device !== 'Other') {
			agent.d = device;
		}
		return agent;
	},

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

	SESSION_SHELF_LIFE = ms('21d'), //Срок годности сессии с последней активности
//Создает объект с кукой ключа сессии
	createSidCookieObj = (function () {
		var key = 'pastvu.sid',
			domain = global.appVar.serverAddr.domain,
			cookieMaxAge = SESSION_SHELF_LIFE / 1000;

		return function (session) {
			var newCoockie = {key: key, value: session.key, path: '/', domain: domain};

			if (session.user) {
				if (session.data && session.data.remember) {
					newCoockie['max-age'] = cookieMaxAge;
				}
			} else {
				newCoockie['max-age'] = cookieMaxAge;
			}

			return newCoockie;
		};
	}()),

	usLogin = {}, //usObjs loggedin by user login.  Хэш пользовательских обектов по login зарегистрированного пользователя
	usId = {}, //usObjs loggedin by user _id. Хэш пользовательских обектов по _id зарегистрированного пользователя
	usSid = {}, //usObjs by session key. Хэш всех пользовательских обектов по ключам сессий. Может быть один объект у нескольких сессий, если клиент залогинен ы нескольких браузерах

	sessConnected = {}, //Sessions. Хэш всех активных сессий, с установленными соединениями
	sessWaitingConnect = {},//Хэш сессий, которые ожидают первого соединения
	sessWaitingSelect = {}; //Хэш сессий, ожидающих выборки по ключу из базы


//Создаем запись в хэше пользователей (если нет) и добавляем в неё сессию
function userObjectAddSession(session, cb) {
	var registered = !!session.user,
		usObj = usSid[session.key],
		firstAdding = false,
		user;

	if (usObj === undefined) {
		firstAdding = true;
		user = registered ? session.user : session.anonym;
		usObj = usSid[session.key] = {user: user, sessions: Object.create(null), rquery: Object.create(null), rshortlvls: [], rshortsel: Object.create(null)};
		if (registered) {
			usObj.registered = true;
			usLogin[user.login] = usId[user._id] = usObj;
			console.log('Create us hash:', user.login);
		} else {
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

	usObj.sessions[session.key] = session; //Добавляем сессию в хеш сессий объекта пользователя

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
			agent: getBrowserAgent(browser)
		}
	});

	session.save();
	return session;
}
//Обновляет сессию в базе, если при входе она была выбрана из базы
function sessionUpdate(session, ip, headers, browser, cb) {
	//Обновляем время сессии
	session.stamp = new Date();
	//Если ip пользователя изменился, записываем в историю старый с временем изменения
	if (ip !== session.data.ip) {
		if (!session.data.ip_hist) {
			session.data.ip_hist = [];
		}
		session.data.ip_hist.push({ip: session.data.ip, off: session.stamp});
		session.data.ip = ip;
	}
	//Если user-agent заголовка изменился, заново парсим агента
	if (headers['user-agent'] !== session.data.headers['user-agent']) {
		session.data.agent = getBrowserAgent(browser);
	}
	session.data.headers = headers;
	session.markModified('data');

	session.save(cb);
}

//Создаёт сессию путем копирования изначальных данных из переданной сессии (ip, header, agent)
function sessionCopy(sessionSource) {
	var session = new Session({
		key: Utils.randomString(12),
		stamp: new Date(),
		data: {}
	});

	session.data.ip = sessionSource.data.ip;
	session.data.headers = sessionSource.data.headers;
	session.data.agent = sessionSource.data.agent;
	return session;
}

//Добавляет созданную или вновь выбранную из базы сессию в память (список ожидания коннектов, хэш пользователей)
function sessionToHashes(session, cb) {
	sessWaitingConnect[session.key] = session;
	userObjectAddSession(session, function (err, usObj) {
		cb(err, usObj, session);
	});
}

//Убирает сессию из памяти (хешей) с проверкой объекта пользователя и убирает его тоже, если сессий у него не осталось
function sessionFromHashes(usObj, session, logPrefix) {
	var sessionKey = session.key,
		userKey = usObj.login || session.key,
		someCountPrev = Object.keys(sessConnected).length,
		someCountNew;

	delete sessConnected[sessionKey];
	someCountNew = Object.keys(sessConnected).length;
	if (someCountNew !== someCountPrev - 1) {
		console.log(logPrefix, 'WARN-Session not removed (' + sessionKey + ')', userKey);
	}

	someCountPrev = Object.keys(usSid).length;
	delete usSid[sessionKey];
	someCountNew = Object.keys(usSid).length;
	if (someCountNew !== someCountPrev - 1) {
		console.log(logPrefix, 'WARN-Session from usSid not removed (' + sessionKey + ')', userKey);
	}

	someCountPrev = Object.keys(usObj.sessions).length;
	delete usObj.sessions[sessionKey];
	someCountNew = Object.keys(usObj.sessions).length;
	if (someCountNew !== someCountPrev - 1) {
		console.log(logPrefix, 'WARN-Session from usObj not removed (' + sessionKey + ')', userKey);
	}

	if (!someCountNew && usObj.registered) {
		//console.log(9, '2.Delete User', user.login);
		//Если сессий у зарегистрированного пользователя не осталось, убираем usObj из хеша пользователей (из usSid уже должно было убраться)
		delete usLogin[usObj.user.login];
		delete usId[usObj.user._id];
	}
}

//Отправляет сессию в архив
function sessionToArchive(session) {
	var archivePlain = session.toObject(),
		archiveObj = new SessionArchive(archivePlain);

	session.remove(); //Удаляем архивированную сессию из активных
	archiveObj.save(); //Сохраняем архивированную сессию в архив

	return archiveObj;
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
function regetUser(usObj, emitHim, emitExcludeSocket, cb) {
	if (!usObj.registered) {
		return cb({message: 'Can reget only registered user'});
	}
	var u = usObj.user;
	User.findOne({login: u.login}, function (err, user) {
		userObjectTreatUser(usObj, function (err) {
			if (err || !user) {
				console.log('Error while regeting user (' + u.login + ')', err && err.message || 'No such user for reget');
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


//Работа с сессиями при авторизации пользователя, вызывается из auth-контроллера
function authUser(socket, user, data, cb) {
	var handshake = socket.handshake,
		sessionOld = handshake.session,
		usObjOld = usSid[sessionOld.key],
		sessHash = sessWaitingConnect[sessionOld.key] ? sessWaitingConnect : sessConnected,
		sessionNew = sessionCopy(sessionOld);

	//Присваивание объекта пользователя при логине еще пустому populated-полю сессии вставит туда только _id,
	//поэтому затем после сохранения сессии нужно будет сделать populate на этом поле. (mongoose 3.6)
	//https://github.com/LearnBoost/mongoose/issues/1530
	sessionNew.user = user;

	//Удаляем поле анонимного пользователя
	sessionNew.anonym = undefined;

	//Присваиваем поля data специфичные для залогиненного пользователя
	_.assign(sessionOld.data, {remember: data.remember});

	//Указываем новой сессий ссылку на архивируемую
	sessionNew.previous = sessionOld.key;

	sessionNew.save(function (err, sessionNew) {
		if (err) {
			return cb(err);
		}
		sessionNew.populate('user', function (err, sessionNew) {
			if (err) {
				return cb(err);
			}

			delete usSid[sessionOld.key]; //Удаляем старый usObj из хэша по сессиям, т.к. для зарегистрированного пользователя он создастся заново
			delete usObjOld.sessions[sessionOld.key]; //Удаляем старую сессию из удаленного usObj, чтобы gc их забрал
			delete sessHash[sessionOld.key]; //Удаляем архивируемую сессию из хэша сессий
			sessHash[sessionOld.key] = sessionNew; //Кладем новую сессию в хэш сессий

			//Переносим сокеты из старой в новую сессию
			sessionNew.sockets = sessionOld.sockets;
			delete sessionOld.sockets;

			//Отправляем старую сессию в архив
			sessionToArchive(sessionOld);

			//Кладем новую сессию в handshake
			handshake.session = sessionNew;

			//Добавляем новую сессию в usObj(создастся если еще нет, а если есть, пользователь в сессию возьмется оттуда вместо спопулированного)
			userObjectAddSession(sessionNew, function (err, usObj) {
				if (err) {
					cb(err, sessionNew);
				}
				//Кладем новый usObj в handshake
				handshake.usObj = usObj;

				var userPlain = getPlainUser(usObj.user);

				//При логине отправляем пользователя во все сокеты сессии, кроме текущего сокета (ему отправит auth-контроллер)
				for (var i in sessionNew.sockets) {
					if (sessionNew.sockets[i] !== undefined && sessionNew.sockets[i] !== socket && sessionNew.sockets[i].emit !== undefined) {
						sessionNew.sockets[i].emit('youAre', userPlain);
					}
				}

				emitSidCookie(socket); //Куки можно обновлять в любом соединении, они обновятся для всех в браузере
				cb(err, sessionNew, userPlain);
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


//Обработчик при первом заходе или установки соединения сокетом для создания сессии и проверки браузера клиента
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
		sessionToHashes(sessionCreate(ip, headers, browser), authConnectionFinish);
	} else {
		session = sessConnected[existsSid] || sessWaitingConnect[existsSid];
		if (session !== undefined) {
			//Если ключ есть и он уже есть в хеше, то берем эту уже выбранную сессию
			authConnectionFinish(null, usSid[session.key], session);
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

				Session.findOne({key: existsSid}, function (err, session) {
					if (err) {
						return finishCb({type: errtypes.CANT_GET_SESSION});
					}
					//Если сессия есть, обновляем в базе хедеры и stamp
					if (session) {
						sessionUpdate(session, ip, headers, browser, function (err, session) {
							if (err) {
								return finishCb({type: errtypes.CANT_UPDATE_SESSION});
							}
							session.populate('user', function (err, session) {
								if (err) {
									return finishCb({type: errtypes.CANT_POPUSER_SESSION});
								}
								further(session);
							});
						});
					} else {
						further(sessionCreate(ip, headers, browser));
					}
					function further(session) {
						sessionToHashes(session, function (err, usObj, session) {
							if (Array.isArray(sessWaitingSelect[existsSid])) {
								sessWaitingSelect[existsSid].forEach(function (item) {
									item.cb.call(null, err, usObj, session);
								});
								delete sessWaitingSelect[existsSid];
							}
						});
					}
				});
			}
		}
	}
}

//Обработка входящего http-соединения
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

		req.handshake = {session: session, usObj: usObj};

		//Добавляем в заголовок Set-cookie с идентификатором сессии (создает куку или продлевает её действие на клиенте)
		var cookieObj = createSidCookieObj(session),
			cookieResOptions = {path: cookieObj.path, domain: cookieObj.domain};

		if (cookieObj['max-age'] !== undefined) {
			cookieResOptions.maxAge = cookieObj['max-age'] * 1000;
		}
		res.cookie(cookieObj.key, cookieObj.value, cookieResOptions);

		//Передаем browser дальше, на случай дальнейшего использования, например, прямого доступа к /badbrowser или /nojs
		req.browser = browser;
		next();
	});
};
//Обработка входящего socket-соединения
module.exports.handleSocket = (function () {
	//При разрыве сокет-соединения проверяет на необходимость оставлять в хэшах сессию и объект пользователя
	var onSocketDisconnection = function (reason) {
		var socket = this,
			session = socket.handshake.session,
			usObj = socket.handshake.usObj,
			someCountPrev = Object.keys(session.sockets).length,
			someCountNew,
			user = usObj.user;

		//console.log('DISconnection');
		delete session.sockets[socket.id]; //Удаляем сокет из сесии

		someCountNew = Object.keys(session.sockets).length;
		if (someCountNew !== someCountPrev - 1) {
			console.log('WARN-Socket not removed (' + socket.id + ')', user && user.login);
		}

		if (!someCountNew) {
			//console.log('Delete Sess');
			//Если для этой сессии не осталось соединений, убираем сессию из хеша сессий
			sessionFromHashes(usObj, session, 'onSocketDisconnection');
		}
	};

	return function (socket, next) {
		var handshake = socket.handshake,
			headers = handshake.headers,
			ip = headers['x-real-ip'] || (handshake.address && handshake.address.address);

		authConnection(ip, headers, function (err, usObj, session) {
			if (err) {
				return next(new Error(err.type));
			}
			handshake.usObj = usObj;
			handshake.session = session;

			//Если это первый коннект для сессии, перекладываем её в хеш активных сессий
			if (sessConnected[session.key] === undefined && sessWaitingConnect[session.key] !== undefined) {
				sessConnected[session.key] = session;
				delete sessWaitingConnect[session.key];
			}

			if (!session.sockets) {
				session.sockets = {};
			}
			session.sockets[socket.id] = socket; //Кладем сокет в сессию

			socket.on('disconnect', onSocketDisconnection);//Вешаем обработчик на disconnect

			next();
		});
	};
}());


//Периодически убирает из памяти ожидающие подключения сессии, если они не подключились по сокету в течении 30 секунд
var checkSessWaitingConnect = (function () {
	var checkInterval = ms('10s'),
		sessWaitingPeriod = ms('30s');

	function procedure() {
		var expiredFrontier = Date.now() - sessWaitingPeriod,
			keys = Object.keys(sessWaitingConnect),
			session,
			i;

		for (i = keys.length; i--;) {
			session = sessWaitingConnect[keys[i]];

			if (session && session.stamp <= expiredFrontier) {
				delete sessWaitingConnect[session.key];
				sessionFromHashes(usSid[session.key], session, 'checkSessWaitingConnect');
			}
		}

		checkSessWaitingConnect();
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
			//Проверяем, если какая-либо из отправленных в архив сессий находится в памяти (хешах), убираем из памяти
			ret.keys.forEach(function (key) {
				var session = sessConnected[key],
					usObj = usSid[key];
				if (session) {
					if (usObj !== undefined) {
						sessionFromHashes(usObj, session, 'checkExpiredSessions');
					}
					//Если в сессии есть сокеты, разрываем соединение
					_.forEach(session.sockets, function (socket) {
						if (socket.disconnet) {
							socket.disconnet();
						}
					});
					delete session.sockets;
				}
			});
			//Планируем следующий запуск
			checkExpiredSessions();
		});
	}

	return function () {
		setTimeout(procedure, checkInterval);
	};
}());


module.exports.destroy = destroy;
module.exports.authUser = authUser;
module.exports.emitUser = emitUser;
module.exports.saveEmitUser = saveEmitUser;
module.exports.isOnline = isOnline;
module.exports.getOnline = getOnline;

//Для быстрой проверки на online в некоторых модулях, экспортируем сами хеши
module.exports.usLogin = usLogin;
module.exports.usId = usId;
module.exports.usSid = usSid;
module.exports.sessConnected = sessConnected;
module.exports.sessWaitingConnect = sessWaitingConnect;
module.exports.regetUser = regetUser;
module.exports.regetUsers = regetUsers;
module.exports.getPlainUser = getPlainUser;


module.exports.loadController = function (a, db, io) {
	app = a;
	dbNative = db.db;
	Session = db.model('Session');
	SessionArchive = db.model('SessionArchive');
	User = db.model('User');

	checkSessWaitingConnect();
	checkExpiredSessions();

	io.sockets.on('connection', function (socket) {
		socket.on('giveInitData', function (data) {
			emitInitData(socket);
		});
	});
};