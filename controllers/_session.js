import ms from 'ms';
import _ from 'lodash';
import log4js from 'log4js';
import config from '../config';
import Bluebird from 'bluebird';
import Utils from '../commons/Utils';
import { waitDb, dbEval } from './connection';
import * as regionController from './region';
import cookie from 'express/node_modules/cookie';
import { userSettingsDef, clientParams } from './settings';
import { Session, SessionArchive } from '../models/Sessions';
import { User } from '../models/User';

const logger = log4js.getLogger('session');
const errtypes = {
    NO_HEADERS: 'Bad request - no header or user agent',
    BAD_BROWSER: 'Bad browser, we do not support it',
    CANT_CREATE_SESSION: 'Can not create session',
    CANT_UPDATE_SESSION: 'Can not update session',
    CANT_GET_SESSION: 'Can not get session',
    CANT_POPUSER_SESSION: 'Can not populate user session',
    ANOTHER: 'Some error occured'
};

export const checkUserAgent = Utils.checkUserAgent({
    'IE': '>=9.0.0',
    'Firefox': '>=6.0.0', // 6-я версия - это G+
    'Opera': '>=12.10.0',
    'Chrome': '>=11.0.0', // 11 версия - это Android 4 default browser в desktop-режиме
    'Android': '>=4.0.0',
    'Safari': '>=5.1.4', // 5.1.4 это Function.prototype.bind
    'Mobile Safari': '>=5.1.4'
});

const getBrowserAgent = function (browser) {
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
};

export const getPlainUser = (function () {
    var userToPublicObject = function (doc, ret/* , options */) {
        // Этот метод вызовется и в дочерних популированных объектах.
        // Transforms are applied to the document and each of its sub-documents.
        // Проверяем, что именно пользователь
        if (doc.login !== undefined) {
            delete ret.cid;
            delete ret.pass;
            delete ret.activatedate;
            delete ret.loginAttempts;
            delete ret.active;
            delete ret.__v;
        }
        delete ret._id;
    };
    return function (user) {
        return user && user.toObject ? user.toObject({ transform: userToPublicObject }) : null;
    };
}());

const SESSION_SHELF_LIFE = ms('21d'); // Срок годности сессии с последней активности

const createSidCookieObj = (function () {
    // Создает объект с кукой ключа сессии
    var key = 'past.sid',
        domain = config.client.hostname,
        cookieMaxAge = SESSION_SHELF_LIFE / 1000;

    return function (session) {
        return {
            key,
            domain,
            path: '/',
            value: session.key,
            'max-age': cookieMaxAge
        };
    };
}());

export const usSid = Object.create(null); // usObjs by session key. Хэш всех пользовательских обектов по ключам сессий. Может быть один объект у нескольких сессий, если клиент залогинен ы нескольких браузерах
export const usLogin = Object.create(null); // usObjs loggedin by user login.  Хэш пользовательских обектов по login зарегистрированного пользователя
export const usId = Object.create(null); // usObjs loggedin by user _id. Хэш пользовательских обектов по _id зарегистрированного пользователя

export const sessConnected = Object.create(null); // Sessions. Хэш всех активных сессий, с установленными соединениями
export const sessWaitingConnect = Object.create(null); // Хэш сессий, которые ожидают первого соединения
export const sessWaitingSelect = Object.create(null); // Хэш сессий, ожидающих выборки по ключу из базы

const usObjIsOwner = function () {
    return this.registered && this.user.role > 10;
};
const usObjIsAdmin = function () {
    return this.registered && this.user.role > 9;
};
const usObjIsModerator = function () {
    return this.registered && this.user.role === 5;
};

// Создаем запись в хэше пользователей (если нет) и добавляем в неё сессию
function userObjectAddSession(session, cb) {
    var registered = !!session.user,
        user = registered ? session.user : session.anonym,
        usObj = registered ? usLogin[user.login] : usSid[session.key], //Для зарегистрированных надо брать именно через хэш пользователей, чтобы взялся существующий usObj, если пользователь логинится в другом браузере
        firstAdding = false;

    if (usObj === undefined) {
        firstAdding = true;
        usObj = usSid[session.key] = {
            user,
            sessions: Object.create(null),
            rquery: Object.create(null),
            rshortlvls: [],
            rshortsel: Object.create(null)
        };
        Object.defineProperties(usObj, {
            isOwner: {
                get: usObjIsOwner,
                enumerable: true
            },
            isAdmin: {
                get: usObjIsAdmin,
                enumerable: true
            },
            isModerator: {
                get: usObjIsModerator,
                enumerable: true
            }
        });
        if (registered) {
            usObj.registered = true;
            usLogin[user.login] = usId[user._id] = usObj;
            logger.info('Create us hash:', user.login);
        } //else {logger.info('Create anonym hash:', session.key);}
    } else {
        if (registered) {
            //Если пользователь уже был в хеше пользователей, т.е. залогинен в другом браузере,
            //вставляем в usSid по ключу текущей сессии существующий usObj и присваиваем текущей сессии существующего пользователя
            usSid[session.key] = usObj;
            user = session.user = usObj.user;
            logger.info('Add new session to us hash:', user.login);
        } else {
            logger.warn('Anonym trying to add new session?! Key: ' + session.key);
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
        },
        anonym: {
            regionHome: regionController.DEFAULT_REGION._id,
            regions: []
        }
    });

    session.save();
    return session;
}
//Обновляет сессию в базе, если при входе она была выбрана из базы
function sessionUpdate(session, ip, headers, browser, cb) {
    var stamp = new Date();
    var data = session.data;

    //Обновляем время сессии
    session.stamp = stamp;

    //Если пользователь зарегистрирован, обнуляем поле anonym, т.к. при выборке из базы mongoose его автоматически заполняет {}
    if (session.user) {
        session.anonym = undefined;
    }

    //Если ip пользователя изменился, записываем в историю старый с временем изменения
    if (ip !== data.ip) {
        if (!data.ip_hist) {
            data.ip_hist = [];
        }
        data.ip_hist.push({ ip: data.ip, off: stamp });
        data.ip = ip;
    }

    //Если user-agent заголовка изменился, заново парсим агента и записываем предыдущего в историю с временем изменения
    if (headers['user-agent'] !== data.headers['user-agent']) {
        if (data.agent) {
            if (!data.agent_hist) {
                data.agent_hist = [];
            }
            data.agent_hist.push({ agent: data.agent, off: stamp });
        }
        data.agent = getBrowserAgent(browser);
    }
    data.headers = headers;
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
        userKey = usObj.registered ? usObj.user.login : session.key,
        someCountPrev,
        someCountNew;

    delete sessWaitingConnect[sessionKey];
    delete sessConnected[sessionKey];

    someCountPrev = Object.keys(usSid).length;
    delete usSid[sessionKey];
    someCountNew = Object.keys(usSid).length;
    //logger.info('Delete session from usSid', someCountNew);
    if (someCountNew !== someCountPrev - 1) {
        logger.warn(logPrefix, 'Session from usSid not removed (' + sessionKey + ')', userKey);
    }

    someCountPrev = Object.keys(usObj.sessions).length;
    delete usObj.sessions[sessionKey];
    someCountNew = Object.keys(usObj.sessions).length;
    //logger.info('Delete session from usObj.sessions', someCountNew);
    if (someCountNew !== someCountPrev - 1) {
        logger.warn(logPrefix, 'WARN-Session from usObj not removed (' + sessionKey + ')', userKey);
    }

    if (!someCountNew && usObj.registered) {
        //logger.info('Delete user from hashes', usObj.user.login);
        //Если сессий у зарегистрированного пользователя не осталось, убираем usObj из хеша пользователей (из usSid уже должно было убраться)
        delete usLogin[usObj.user.login];
        delete usId[usObj.user._id];
    }
}

//Отправляет сессию в архив
function sessionToArchive(session) {
    var archivePlain = session.toObject({ depopulate: true }), //Берем чистый объект сессии с _id, вместо популированных зависимостей
        archiveObj = new SessionArchive(archivePlain);

    if (archivePlain.user) {
        archiveObj.anonym = undefined;
    }

    session.remove(); //Удаляем архивированную сессию из активных
    archiveObj.save(); //Сохраняем архивированную сессию в архив

    return archiveObj;
}

function userObjectTreatUser(usObj, cb) {
    var user = usObj.user;
    // Присваиваем ему настройки по умолчанию
    user.settings = _.defaults(user.settings || {}, userSettingsDef);

    return new Bluebird(function (resolve, reject) {
        // Популируем регионы
        popUserRegions(usObj, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    })
        .nodeify(cb);
}

// Пупулируем регионы пользователя и строим запросы для них
function popUserRegions(usObj, cb) {
    var user = usObj.user,
        registered = usObj.registered,
        pathPrefix = (registered ? '' : 'anonym.'),
        paths = [
            {
                path: pathPrefix + 'regionHome',
                select: { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 }
            },
            { path: pathPrefix + 'regions', select: { _id: 1, cid: 1, title_en: 1, title_local: 1 } }
        ],
        mod_regions_equals; //Регионы интересов и модерирования равны

    if (registered && user.role === 5) {
        mod_regions_equals = _.isEqual(user.regions, user.mod_regions) || undefined;
        paths.push({ path: pathPrefix + 'mod_regions', select: { _id: 1, cid: 1, title_en: 1, title_local: 1 } });
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

// Заново выбирает пользователя из базы и популирует все зависимости. Заменяет ссылки в хешах на эти новые объекты
export const regetUser = Bluebird.method(function (usObj, emitHim, emitExcludeSocket, cb) {
    if (!usObj.registered) {
        throw { message: 'Can reget only registered user' };
    }

    return User.findOneAsync({ login: usObj.user.login })
        .tap(function (user) {
            if (!user) {
                throw { message: 'No such user for reget' };
            }

            //usObj и всем его сессиям присваиваем новую модель пользователя
            usObj.user = user;
            _.forIn(usObj.sessions, function (session) {
                session.user = user;
            });

            return userObjectTreatUser(usObj);
        })
        .then(function (user) {
            if (emitHim) {
                emitUser(usObj, null, emitExcludeSocket);
            }

            return user;
        })
        .nodeify(cb);
});

// TODO: Обрабатывать и анонимных пользователей, популировать у них регионы
// Заново выбирает онлайн пользователей из базы и популирует у них все зависимости. Заменяет ссылки в хешах на эти новые объекты
// Принимает на вход 'all' или функцию фильтра пользователей
// Не ждет выполнения - сразу возвращает кол-во пользователей, для которых будет reget
export function regetUsers(filterFn, emitThem, cb) {
    var usersToReget = filterFn === 'all' ? usLogin : _.filter(usLogin, filterFn),
        usersCount = _.size(usersToReget);

    //_.forEach, потому что usersToReget может быть как объектом (usLogin), так и массивом (результат filter)
    _.forEach(usersToReget, function (usObj) {
        regetUser(usObj, emitThem);
    });

    if (cb) {
        cb(null, usersCount);
    }
    return usersCount;
}

//Работа с сессиями при авторизации пользователя, вызывается из auth-контроллера
export function loginUser(socket, user, data, cb) {
    var handshake = socket.handshake,
        sessionOld = handshake.session,
        usObjOld = handshake.usObj,
        sessHash = sessWaitingConnect[sessionOld.key] ? sessWaitingConnect : sessConnected,
        sessionNew = sessionCopy(sessionOld);

    //Присваивание объекта пользователя при логине еще пустому populated-полю сессии вставит туда только _id,
    //поэтому затем после сохранения сессии нужно будет сделать populate на этом поле. (mongoose 3.6)
    //https://github.com/LearnBoost/mongoose/issues/1530
    sessionNew.user = user;

    //Удаляем поле анонимного пользователя
    sessionNew.anonym = undefined;

    //Присваиваем поля data специфичные для залогиненного пользователя
    //_.assign(sessionNew.data, {});

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

            //Добавляем новую сессию в usObj(создастся если еще нет, а если есть, usObj и пользователь в сессию возьмется оттуда вместо спопулированного)
            userObjectAddSession(sessionNew, function (err, usObj) {
                if (err) {
                    cb(err, sessionNew);
                }
                //Всем сокетам текущей сессии присваиваем новую сессию и usObj
                if (_.isObject(sessionOld.sockets)) {
                    _.forIn(sessionOld.sockets, function (sock) {
                        sock.handshake.usObj = usObj;
                        sock.handshake.session = sessionNew;
                    });
                    //Переносим сокеты из старой в новую сессию
                    sessionNew.sockets = sessionOld.sockets;
                } else {
                    logger.warn('SessionOld have no sockets while login', user.login);
                }
                delete sessionOld.sockets;

                //Убираем сессию и usObj из хеша сессий
                sessionFromHashes(usObjOld, sessionOld, 'loginUser');

                //Кладем новую сессию в хэш сессий
                sessHash[sessionNew.key] = sessionNew;

                //Отправляем старую сессию в архив
                sessionToArchive(sessionOld);

                var userPlain = getPlainUser(usObj.user);

                emitSidCookie(socket); //Куки можно обновлять в любом соединении, они обновятся для всех в браузере

                //Отправляем пользователя во все сокеты сессии, кроме текущего сокета (ему отправит auth-контроллер)
                for (var i in sessionNew.sockets) {
                    if (sessionNew.sockets[i] !== undefined && sessionNew.sockets[i] !== socket && sessionNew.sockets[i].emit !== undefined) {
                        sessionNew.sockets[i].emit('youAre', { user: userPlain, registered: true });
                    }
                }

                cb(err, sessionNew, userPlain);
            });
        });
    });
}

//Работа с сессиями при выходе пользователя, вызывается из auth-контроллера
export function logoutUser(socket, cb) {
    var handshake = socket.handshake,
        usObjOld = handshake.usObj,
        sessionOld = handshake.session,
        sessionNew = sessionCopy(sessionOld),
        sessHash = sessWaitingConnect[sessionOld.key] ? sessWaitingConnect : sessConnected,
        user = usObjOld.user.toObject(),
        regionsIds = usObjOld.user.populated('regions') || [],
        regionHomeId = usObjOld.user.populated('regionHome') || regionController.DEFAULT_REGION._id;

    sessionNew.anonym.settings = user.settings;
    sessionNew.anonym.regionHome = regionHomeId;
    sessionNew.anonym.regions = regionsIds;

    //Указываем новой сессий ссылку на архивируемую
    sessionNew.previous = sessionOld.key;

    sessionNew.save(function (err, sessionNew) {
        if (err) {
            return cb(err);
        }
        //Добавляем новую сессию в usObj
        userObjectAddSession(sessionNew, function (err, usObj) {
            if (err) {
                cb(err);
            }
            //Всем сокетам текущей сессии присваиваем новую сессию и usObj
            if (_.isObject(sessionOld.sockets)) {
                _.forIn(sessionOld.sockets, function (sock) {
                    sock.handshake.usObj = usObj;
                    sock.handshake.session = sessionNew;
                });
                //Переносим сокеты из старой в новую сессию
                sessionNew.sockets = sessionOld.sockets;
            } else {
                logger.warn('SessionOld have no sockets while logout', user.login);
            }
            delete sessionOld.sockets;

            //Убираем сессию из хеша сессий, и если в usObj это была одна сессия, usObj тоже удалится
            sessionFromHashes(usObjOld, sessionOld, 'logoutUser');

            //Кладем новую сессию в хэш сессий
            sessHash[sessionNew.key] = sessionNew;

            //Отправляем старую сессию в архив
            sessionToArchive(sessionOld);

            socket.once('commandResult', function () {
                //Отправляем всем сокетам сессии кроме текущей команду на релоад
                for (var i in sessionNew.sockets) {
                    if (sessionNew.sockets[i] !== undefined && sessionNew.sockets[i] !== socket && sessionNew.sockets[i].emit !== undefined) {
                        sessionNew.sockets[i].emit('command', [
                            { name: 'location' }
                        ]);
                    }
                }
                cb();
            });

            //Отправляем клиенту новые куки анонимной сессии
            emitSidCookie(socket);
        });
    });
}

// Отправка текущего пользователя всем его подключеным клиентам
export function emitUser(usObj, loginOrIdOrSessKey, excludeSocket) {
    var userPlain,
        sessions,
        sockets,
        count = 0,
        i,
        j;

    if (!usObj) {
        usObj = usLogin[loginOrIdOrSessKey] || usId[loginOrIdOrSessKey] || usSid[loginOrIdOrSessKey];
    }

    if (usObj) {
        userPlain = getPlainUser(usObj.user);
        sessions = usObj.sessions;

        for (i in sessions) {
            if (sessions[i] !== undefined) {
                sockets = sessions[i].sockets;
                for (j in sockets) {
                    if (sockets[j] !== undefined && sockets[j] !== excludeSocket && sockets[j].emit !== undefined) {
                        count++;
                        sockets[j].emit('youAre', { user: userPlain, registered: usObj.registered });
                    }
                }
            }
        }
    }

    return Bluebird.resolve(count);
}

// Сохранение и последующая отправка
export function saveEmitUser(usObj, excludeSocket) {
    if (usObj && usObj.user !== undefined) {
        return usObj.user.saveAsync()
            .spread(function () {
                return emitUser(usObj, null, excludeSocket);
            });
    }
    return Bluebird.resolve();
}

function emitSidCookie(socket) {
    socket.emit('command', [
        { name: 'updateCookie', data: createSidCookieObj(socket.handshake.session) }
    ]);
}

//Проверяем если пользователь онлайн
export function isOnline(login, _id) {
    if (login) {
        return usLogin[login] !== undefined;
    } else if (_id) {
        return usId[_id] !== undefined;
    }
}

//Берем онлайн-пользователя
export function getOnline(login, _id) {
    var usObj;
    if (login) {
        usObj = usLogin[login];
    } else if (_id) {
        usObj = usId[_id];
    }
    if (usObj) {
        return usObj;
    }
}

//Обработчик при первом заходе или установки соединения сокетом для создания сессии и проверки браузера клиента
function authConnection(ip, headers, finishCb) {
    if (!headers || !headers['user-agent']) {
        return finishCb({ type: errtypes.NO_HEADERS }); //Если нет хедера или юзер-агента - отказываем
    }

    var browser = checkUserAgent(headers['user-agent']);
    if (!browser.accept) {
        return finishCb({ type: errtypes.BAD_BROWSER, agent: browser.agent });
    }

    var cookieObj = cookie.parse(headers.cookie || ''),
        existsSid = cookieObj['past.sid'],
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
                sessWaitingSelect[existsSid].push({ cb: authConnectionFinish });
            } else {
                //Если запроса к базе еще нет, создаем его
                sessWaitingSelect[existsSid] = [
                    { cb: authConnectionFinish }
                ];

                Session.findOne({ key: existsSid }, function (err, session) {
                    if (err) {
                        return finishCb({ type: errtypes.CANT_GET_SESSION });
                    }
                    //Если сессия есть, обновляем в базе хедеры и stamp
                    if (session) {
                        sessionUpdate(session, ip, headers, browser, function (err, session) {
                            if (err) {
                                return finishCb({ type: errtypes.CANT_UPDATE_SESSION });
                            }
                            session.populate('user', function (err, session) {
                                if (err) {
                                    return finishCb({ type: errtypes.CANT_POPUSER_SESSION });
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

// Обработка входящего http-соединения
module.exports.handleHTTPRequest = function (req, res, next) {
    authConnection(req.ip, req.headers, function (err, usObj, session, browser) {
        if (err) {
            if (err.type === errtypes.BAD_BROWSER) {
                res.statusCode = 200;
                res.render('status/badbrowser', {
                    agent: err.agent,
                    title: 'Вы используете устаревшую версию браузера'
                });
            } else if (err.type === errtypes.NO_HEADERS) {
                res.statusCode = 400;
                res.end(err.type);
            } else {
                res.statusCode = 500;
                res.end(err.type);
            }
            return;
        }

        req.handshake = { session, usObj };

        //Добавляем в заголовок Set-cookie с идентификатором сессии (создает куку или продлевает её действие на клиенте)
        var cookieObj = createSidCookieObj(session),
            cookieResOptions = { path: cookieObj.path, domain: cookieObj.domain };

        if (cookieObj['max-age'] !== undefined) {
            cookieResOptions.maxAge = cookieObj['max-age'] * 1000;
        }
        res.cookie(cookieObj.key, cookieObj.value, cookieResOptions);

        //Передаем browser дальше, на случай дальнейшего использования, например, в установке заголовка 'X-UA-Compatible'
        req.browser = browser;
        next();
    });
};
//Обработка входящего socket-соединения
module.exports.handleSocket = (function () {
    //При разрыве сокет-соединения проверяет на необходимость оставлять в хэшах сессию и объект пользователя
    var onSocketDisconnection = function (/*reason*/) {
        var socket = this,
            session = socket.handshake.session,
            usObj = socket.handshake.usObj,
            someCountPrev = Object.keys(session.sockets).length,
            someCountNew,
            user = usObj.user;

        //logger.info('DISconnection');
        delete session.sockets[socket.id]; //Удаляем сокет из сесии

        someCountNew = Object.keys(session.sockets).length;
        if (someCountNew !== someCountPrev - 1) {
            logger.warn('Socket not removed (' + socket.id + ')', user && user.login);
        }

        if (!someCountNew) {
            //logger.info('Delete Sess');
            //Если для этой сессии не осталось соединений, убираем сессию из хеша сессий
            sessionFromHashes(usObj, session, 'onSocketDisconnection');
        }
    };

    return function (socket, next) {
        var handshake = socket.handshake;
        var headers = handshake.headers;
        var ip = headers['x-real-ip'] || (handshake.address && handshake.address.address);

        authConnection(ip, headers, function (err, usObj, session) {
            if (err) {
                return next(new Error(err.type));
            }
            handshake.usObj = usObj;
            handshake.session = session;

            // Если это первый коннект для сессии, перекладываем её в хеш активных сессий
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

// Периодически убирает из памяти ожидающие подключения сессии, если они не подключились по сокету в течении 30 секунд
var checkSessWaitingConnect = (function () {
    var checkInterval = ms('10s'),
        sessWaitingPeriod = ms('30s');

    function procedure() {
        var expiredFrontier = Date.now() - sessWaitingPeriod,
            keys = Object.keys(sessWaitingConnect),
            session,
            i = keys.length;

        while (i--) {
            session = sessWaitingConnect[keys[i]];

            if (session && session.stamp <= expiredFrontier) {
                sessionFromHashes(usSid[session.key], session, 'checkSessWaitingConnect');
            }
        }

        checkSessWaitingConnect();
    }

    return function () {
        setTimeout(procedure, checkInterval);
    };
}());

// Periodically sends expired session to archive
const checkExpiredSessions = (function () {
    const checkInterval = ms('1h'); // Check interval

    async function procedure() {
        try {
            const result = await dbEval('archiveExpiredSessions', [new Date() - SESSION_SHELF_LIFE], { nolock: true });

            if (!result) {
                throw { message: 'undefined result from dbEval' };
            }

            logger.info(`${result.count} sessions moved to archive`);

            if (Array.isArray(result.keys)) {
                // Check if some of archived sessions is still in memory (in hashes), remove it frome memory
                for (const key of result.keys) {
                    const session = sessConnected[key];
                    const usObj = usSid[key];

                    if (session) {
                        if (usObj !== undefined) {
                            sessionFromHashes(usObj, session, 'checkExpiredSessions');
                        }

                        // If session contains sockets, break connection
                        _.forEach(session.sockets, function (socket) {
                            if (socket.disconnet) {
                                socket.disconnet();
                            }
                        });

                        delete session.sockets;
                    }
                }
            }
        } catch (err) {
            logger.error('archiveExpiredSessions error: ', err);
        }

        // Schedule next launch
        checkExpiredSessions();
    }

    return function () {
        setTimeout(procedure, checkInterval);
    };
}());

waitDb.then(() => {
    checkSessWaitingConnect();
    checkExpiredSessions();
});

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.setMaxListeners(0); // TODO: Make only one listener with custom router

        socket.on('giveInitData', function () {
            const usObj = hs.usObj;
            const session = hs.session;

            socket.emit('takeInitData', {
                p: clientParams,
                cook: createSidCookieObj(session),
                u: getPlainUser(usObj.user),
                registered: usObj.registered
            });
        });
    });
};