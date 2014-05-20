'use strict';

var Session,
	User,
	Utils = require('../commons/Utils.js'),
	UAParser = require('ua-parser-js'),
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	cookie = require('express/node_modules/cookie'),
	app,
	cookieMaxAgeRegisteredRemember = ms('14d') / 1000,
	cookieMaxAgeAnonimouse = ms('14d') / 1000,

	msg = {
		browserNoHeaders: 'Client came without header or user-agent',
		browserNotSupport: 'Browser version not supported'
	},

	browserSuportFrom = {
		'IE': 9,
		'Firefox': 10,
		'Opera': 12,
		'Chrome': 14,
		'Android': 3,
		'Safari': 5,
		'Mobile Safari': 4 //Пока определяет так и ios и android
	},

	settings = require('./settings.js'),
	regionController = require('./region.js'),
	maxRegionLevel = global.appVar.maxRegionLevel,
	us = {}, //Users by login. Хэш всех активных соединений подключенных пользователей по логинам
	usid = {}, //Users by _id. Хэш всех активных соединений подключенных пользователей по ключам _id
	sess = {},//Sessions. Хэш всех активных сессий, с установленными соединениями
	sessWaitingConnect = {},//Хэш сессий, которые ожидают первого соединения
	sessWaitingSelect = {}; //Хэш сессий, ожидающих выборки по ключу из базы


//Добавляем сессию в хеш пользователей
function addUserSession(session) {
	var user = session.user,
		usObj = us[user.login],
		firstAdding = false;

	if (usObj === undefined) {
		firstAdding = true;
		//Если пользователя еще нет в хеше пользователей, создаем объект и добавляем в хеш
		us[user.login] = usid[user._id] = usObj = {user: user, sessions: Object.create(null), rquery: Object.create(null), rshowlvls: [], rshowsel: Object.create(null)};
		//При первом заходе пользователя присваиваем ему настройки по умолчанию
		if (!user.settings) {
			user.settings = {};
		}
		_.defaults(user.settings, settings.getUserSettingsDef());
		console.log('Create us hash:', user.login);
	} else {
		//Если пользователь уже есть в хеше, значит он уже выбран другой сессией и используем уже выбранный объект пользователя
		session.user = usObj.user;
		console.log('Add new session to us hash:', user.login, session.user === usObj.user);
	}

	usObj.sessions[session.key] = session; //Добавляем сессию в хеш сессий пользователя

	return firstAdding; //Возвращаем флаг. true - впервые добавлен, false - пользователь взялся из существующего хеша
}


var uaParser = new UAParser();
//Обработчик установки соединения сокетом 'authorization'
function authSocket(handshake, callback) {
	if (!handshake.headers || !handshake.headers['user-agent']) {
		return callback(msg.browserNoHeaders, false); //Если нет хедера или юзер-агента - отказываем
	}
	//console.log(handshake);

	var uaParsed = uaParser.setUA(handshake.headers['user-agent']).getResult(),
		browserVersion = Number(uaParsed.browser.major),
		cookieObj,
		existsSid;

	if (!uaParsed.browser.name || browserSuportFrom[uaParsed.browser.name] !== undefined && (!browserVersion || browserVersion < browserSuportFrom[uaParsed.browser.name])) {
		return callback(msg.browserNotSupport, false); //Если браузер старой версии - отказываем
	}

	cookieObj = cookie.parse(handshake.headers.cookie || '');
	existsSid = cookieObj['pastvu.sid'];

	if (existsSid === undefined) {
		//Если ключа нет, переходим к созданию сессии
		sessionProcess(null, null, function (session) {
			sessWaitingConnect[session.key] = session;
			finishAuthConnection(session);
		});
	} else {
		if (sess[existsSid] !== undefined || sessWaitingConnect[existsSid] !== undefined) {
			//Если ключ есть и он уже есть в хеше, то берем эту уже выбранную сессию
			sessionProcess(null, sess[existsSid] || sessWaitingConnect[existsSid], finishAuthConnection);
		} else {
			//Если ключ есть, но его еще нет в хеше сессий, то выбираем сессию из базы по этому ключу
			if (sessWaitingSelect[existsSid] !== undefined) {
				//Если запрос сессии с таким ключем в базу уже происходит, просто добавляем обработчик на результат
				sessWaitingSelect[existsSid].push({cb: finishAuthConnection});
			} else {
				//Если запроса к базе еще нет, создаем его
				sessWaitingSelect[existsSid] = [
					{cb: finishAuthConnection}
				];

				Session.findOne({key: existsSid}).populate('user').exec(function (err, session) {
					sessionProcess(err, session, function (session) {
						sessWaitingConnect[session.key] = session; //Добавляем сессию в хеш сессий

						if (session.user) {
							//Если есть юзер, добавляем его в хеш пользователей и если он добавлен впервые в хеш,
							//значит будет использоваться именно новый объект и надо спопулировать у него регионы
							if (addUserSession(session)) {
								popUserRegions(session.user, function (err) {
									if (err) {
										return callback('Error: ' + err, false);
									}
									callWaitings();
								});
							} else {
								callWaitings();
							}
						} else {
							callWaitings();
						}

						function callWaitings() {
							if (Array.isArray(sessWaitingSelect[existsSid])) {
								sessWaitingSelect[existsSid].forEach(function (item) {
									item.cb.call(global, session);
								});
								delete sessWaitingSelect[existsSid];
							}
						}
					});
				});
			}
		}
	}

	function sessionProcess(err, session, cb) {
		if (err) {
			return callback('Error: ' + err, false);
		}
		var ip = handshake.headers['x-real-ip'] || handshake.headers['X-Real-IP'] || (handshake.address && handshake.address.address),
			device = ((uaParsed.device.type || '') + ' ' + (uaParsed.device.vendor || '') + ' ' + (uaParsed.device.model || '')).trim(),
			data = {
				ip: ip,
				headers: handshake.headers,
				ua: {
					b: uaParsed.browser.name,
					bv: uaParsed.browser.version,
					os: ((uaParsed.os.name || '') + ' ' + (uaParsed.os.version || '')).trim()
				}
			};

		if (device) {
			data.ua.d = device;
		}

		if (!session) {
			session = generate(data); //Если сессии нет, создаем и добавляем её в хеш
		} else {
			regen(session, data);
		}
		cb(session);
	}

	function finishAuthConnection(session) {
		handshake.session = session;
		return callback(null, true);
	}
}

//Первый обработчик on.connection
//Записываем сокет в сессию, отправляем клиенту первоначальные данные и вешаем обработчик на disconnect
function firstConnection(socket) {
	var session = socket.handshake.session,
		userPlain;
	//console.log('firstConnection');

	//Если это первый коннект для сессии, перекладываем её в хеш активных сессий
	if (sess[session.key] === undefined && sessWaitingConnect[session.key] !== undefined) {
		sess[session.key] = session;
		delete sessWaitingConnect[session.key];
	}

	if (!sess[session.key]) {
		return; //Если сессии уже нет, выходим
	}
	userPlain = session.user && session.user.toObject ? session.user.toObject({transform: userToPublicObject}) : null;

	if (!session.sockets) {
		session.sockets = {};
	}
	session.sockets[socket.id] = socket; //Кладем сокет в сессию

	//Сразу поcле установки соединения отправляем клиенту параметры, куки и себя
	socket.emit('connectData', {
		p: settings.getClientParams(),
		cook: emitCookie(socket, true),
		u: userPlain
	});

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
}

//Каждую минуту уничтожает ожидающие сессии, если они не перешли в статус активных в течении 5 минут
var checkWaitingSess = (function () {
	function clearWaitingSess() {
		var fiveMinutesAgo = new Date(Date.now() - ms('5m')),
			keys = Object.keys(sessWaitingConnect),
			session,
			usObj,
			i;

		for (i = keys.length; i--;) {
			session = sessWaitingConnect[keys[i]];

			if (session && session.stamp <= fiveMinutesAgo) {
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
		setTimeout(clearWaitingSess, ms('1m'));
	};
}());

//Пупулируем регионы пользователя и строим запросы для них
function popUserRegions(user, cb) {
	var paths = [
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
			usObj = us[user.login],

			rs = new Array(maxRegionLevel + 1),
			rsLevel,
			r,
			j,
			i;

		if (usObj) {
			regionsData = regionController.buildQuery(user.regions);
			usObj.rquery = regionsData.rquery;
			usObj.rhash = regionsData.rhash;
			usObj.rshowlvls = [];
			usObj.rshowsel = Object.create(null);

			//Выделяем максимальные уровни регионов, которые надо отображать в краткой региональной принадлежности фотографий/комментариев
			//Максимальный уровень - тот, под которым у пользователя фильтруется по умолчанию более одного региона
			//Например, при глобальной фильтрации максимальный уровень - страна, т.к. их множество
			//При фильтрации по стране - максимальный уровень - субъект, т.к. их множество в стране, сл-но, надо отображать принадлежность к субъектам.
			//Если в фильтрации несколько регионов разный стран, значит стран несколько и максимальный уровень - страна
			for (i in regionsData.rhash) {
				if (regionsData.rhash.hasOwnProperty(i)) {
					r = regionsData.rhash[i];

					rsLevel = rs[r.parents.length];
					if (rsLevel === undefined) {
						rsLevel = rs[r.parents.length] = {};
					}
					rsLevel[i] = true;

					for (j = 0; j < r.parents.length; j++) {
						rsLevel = rs[j];
						if (rsLevel === undefined) {
							rsLevel = rs[j] = {};
						}
						rsLevel[r.parents[j]] = true;
					}
				}
			}
			//Максимальный уровень для отображения, это тот на котором несколько регионов либо undefined (т.е. любое кол-во регионов)
			for (i = 0; i < rs.length; i++) {
				if (!rs[i] || Object.keys(rs[i]).length > 1) {
					usObj.rshowlvls.push('r' + i);

					//Если это нулевой уровень (т.е. отображаем страны), то отображаем и их субъекты
					if (!i) {
						usObj.rshowlvls.push('r1');
					}

					//Начиная с этого уровня заполняем хэш выбираемых уровней регионов у объекта ({rn: 1, rn+1: 1, ..., rmax: 1}),
					//просто чтобы не выбирать лишние вышестоящие в каждом запросе к объекту
					for (j = i; j <= maxRegionLevel; j++) {
						usObj.rshowsel['r' + j] = 1;
					}
					break;
				}
			}
			console.log('Levels', usObj.rshowlvls);
			console.log('Sels', usObj.rshowsel);

			if (user.role === 5) {
				regionsData = regionController.buildQuery(user.mod_regions);
				usObj.mod_rquery = regionsData.rquery;
				usObj.mod_rhash = regionsData.rhash;
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

//Заново выбирает сессию из базы и популирует все зависимости. Заменяет ссылки в хешах на эти новые объекты
function regetSession(sessionCurrent, cb) {
	Session.findOne({key: sessionCurrent.key}).populate('user').exec(function (err, session) {
		if (err) {
			console.log('Error wile regeting session (' + sessionCurrent.key + ')', err.message);
			cb(err);
		}

		if (session.user) {
			popUserRegions(session.user, function (err) {
				finish(err);
			});
		} else {
			finish();
		}

		//TODO: Не заменять, а обновлять usObj, и oбновлять user во всех остальных sessions. Переложить новую сессию в socket.handshake
		function finish(err) {
			if (err) {
				cb(err);
			}
			//Заменяем текущий объект сессии в хеше на вновь выбранный
			sess[session.key] = session;
			//Если есть пользователь, удаляем ссылку на его старый объект из хеша и вызываем функцию добавления нового
			if (session.user) {
				delete us[session.user.login];
				delete usid[session.user._id];
				addUserSession(session);
			}
			cb(null, session);
		}
	});
}

//Заново выбирает пользователя из базы и популирует все зависимости. Заменяет ссылки в хешах на эти новые объекты
function regetUser(u, emitHim, emitExcludeSocket, cb) {
	User.findOne({login: u.login}, function (err, user) {
		popUserRegions(user, function (err) {
			if (err || !user) {
				console.log('Error wile regeting user (' + u.login + ')', err && err.message || 'No such user for reget');
				if (cb) {
					cb(err || {message: 'No such user for reget'});
				}
			}

			var usObj = us[user.login],
				s;

			if (usObj) {
				//Присваиваем новый объект пользователя usObj
				usObj.user = user;
				//Заново присваиваем настройки
				if (!user.settings) {
					user.settings = {};
				}
				_.defaults(user.settings, settings.getUserSettingsDef());
				//Присваиваем новый объект пользователя всем его открытым сессиям
				for (s in usObj.sessions) {
					usObj.sessions[s].user = user;
				}

				if (emitHim) {
					emitUser(user.login, emitExcludeSocket);
				}
			}
			if (cb) {
				cb(null, user);
			}
		});
	});
}
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

/**
 * Добавляет в сессию новые данные, продлевает действие и сохраняет в базу
 * @param session Сессия
 * @param data Свойства для вставки в data сессии
 * @param keyRegen Менять ли ключ сессии
 * @param userRePop Популировать ли пользователя сессии из базы
 * @param cb Коллбек
 */
function regen(session, data, keyRegen, userRePop, cb) {
	if (keyRegen) {
		session.key = typeof keyRegen === 'string' ? keyRegen : Utils.randomString(12); // При каждом заходе регенерируем ключ (пока только при логине)
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
			session.populate('user', function (err, session) {
				popUserRegions(session.user, function (err) {
					if (cb) {
						cb(err, session);
					}
				});
			});
		} else if (cb) {
			cb(err, session);
		}
	});

	return session;
}

//Присваивание пользователя сессии при логине, вызывается из auth-контроллера
function authUser(socket, user, data, cb) {
	var session = socket.handshake.session;

	session.user = user; //Здесь присвоится только _id и далее он спопулируется в regen

	//Вручную меняем ключ сессии и сразу переставляем его в хеше сессий,
	//чтобы не возникло ситуации задержки смены в хеше, пока сессия сохраняется
	delete sess[session.key];
	session.key = Utils.randomString(12);
	sess[session.key] = session; //После регена надо опять положить сессию в хеш с новым ключем

	regen(session, {remember: data.remember}, false, false, function (err, session) {

		//Здесь объект пользователя в сессии будет уже другим, заново спопулированный
		session.populate('user', function (err, session) {
			if (err && cb) {
				cb(err, session);
			}

			//Кладем сессию в хеш сессий пользователя. Здесь пользователь сессии может опять переприсвоиться,
			//если пользователь уже был в хеше пользователей, т.е. залогинен в другом браузере.
			//Если не переприсвоился, и взялся именно новый, популируем у него регионы
			if (addUserSession(session)) {
				popUserRegions(session.user, function (err) {
					if (err && cb) {
						cb(err, session);
					}
					finish();
				});
			} else {
				finish();
			}

			function finish() {
				var user = session.user.toObject({transform: userToPublicObject});

				//При логине отправляем пользователя во все сокеты сессии, кроме текущего сокета (ему отправит auth-контроллер)
				for (var i in session.sockets) {
					if (session.sockets[i] !== undefined && session.sockets[i] !== socket && session.sockets[i].emit !== undefined) {
						session.sockets[i].emit('youAre', user);
					}
				}

				emitCookie(socket); //Куки можно обновлять в любом соединении, они обновятся для всех в браузере
				cb(err, session);
			}
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
function userToPublicObject(doc, ret, options) {
	delete ret._id;
	delete ret.pass;
	delete ret.activatedate;
	delete ret.loginAttempts;
	delete ret.active;
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
module.exports.sessWaitingConnect = sessWaitingConnect;
module.exports.regetSession = regetSession;
module.exports.regetUser = regetUser;
module.exports.regetUsers = regetUsers;
module.exports.userToPublicObject = userToPublicObject;

module.exports.loadController = function (a, db, io) {
	app = a;
	Session = db.model('Session');
	User = db.model('User');

	checkWaitingSess();

	//io.sockets.on('connection', function (socket) {});
};