import fs from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import step from 'step';
import jade from 'jade';
import log4js from 'log4js';
import moment from 'moment';
import config from '../config';
import Utils from '../commons/Utils';
import * as session from './_session';
import { send as sendMail } from './mail';
import { userSettingsDef } from './settings';
import { getRegionsArrFromCache } from './region';

import { User, UserConfirm } from '../models/User';
import { Counter } from '../models/Counter';

const logger = log4js.getLogger('auth.js');
const loggerApp = log4js.getLogger('app');
const preaddrs = config.client.subdomains.map(function (sub) {
    return `${sub}.${config.client.host}`;
});
const msg = {
    deny: 'You do not have permission for this action'
};

let recallTpl;
let regTpl;

moment.lang('ru');

// Вход в систему
function login(socket, data, cb) {
    var error = '';

    if (!data.login) {
        error += 'Fill in the login field. ';
    }
    if (!data.pass) {
        error += 'Fill in the password field.';
    }
    if (error) {
        return cb({ message: error, error: true });
    }

    User.getAuthenticated(data.login, data.pass, function (err, user, reason) {
        if (err) {
            logger.error('Auth login User.getAuthenticated: ', err);
            return cb({ message: 'Ошибка авторизации', error: true });
        }

        // Если есть пользователь, значит проверка успешна
        if (user) {
            // Передаем пользователя в сессию
            session.loginUser(socket, user, data, function (err, session, userPlain) {
                if (err) {
                    logger.error('Auth login session.loginUser: ', err);
                    cb({ message: err.message, error: true });
                } else {
                    cb({ message: 'Success login', youAre: userPlain });
                }
            });
        } else {
            switch (reason) {
                case User.failedLogin.NOT_FOUND:
                case User.failedLogin.PASSWORD_INCORRECT:
                    // note: these cases are usually treated the same - don't tell the user *why* the login failed, only that it did
                    cb({ message: 'Неправильная пара логин-пароль', error: true });
                    break;
                case User.failedLogin.MAX_ATTEMPTS:
                    // send email or otherwise notify user that account is temporarily locked
                    cb({
                        message: 'Your account has been temporarily locked due to exceeding the number of wrong login attempts',
                        error: true
                    });
                    break;
            }
        }
    });
}

// Registration
const registerPublicError = { message: 'Ошибка регистрации', error: true };
function register(data, cb) {
    var error = '',
        success = 'Учетная запись создана успешно. Для завершения регистрации следуйте инструкциям, отправленным на указанный вами e-mail', //'Account has been successfully created. To confirm registration, follow the instructions sent to Your e-mail',
        confirmKey = '';

    if (!data.login) {
        error += 'Заполните имя пользователя. '; // 'Fill in the login field. '
    } else {
        if (data.login !== 'anonymous' && !data.login.match(/^[\.\w-]{3,15}$/i) ||
            !data.login.match(/^[A-za-z].*$/i) || !data.login.match(/^.*\w$/i)) {
            error += 'Имя пользователя должно содержать от 3 до 15 латинских символов и начинаться с буквы. ' +
                'В состав слова могут входить цифры, точка, подчеркивание и тире. ';
        }
    }
    if (!data.email) {
        error += 'Fill in the e-mail field. ';
    }
    data.email = data.email.toLowerCase();

    if (!data.pass) {
        error += 'Fill in the password field. ';
    }
    if (data.pass !== data.pass2) {
        error += 'Пароли не совпадают.';
    }
    if (error) {
        return cb({ message: error, error: true });
    }

    User.findOne({
        $or: [
            { login: new RegExp('^' + data.login + '$', 'i') },
            { email: data.email }
        ]
    }, function (err, user) {
        if (err) {
            logger.error('Auth register User.findOne: ', err);
            return cb({ message: 'Ошибка регистрации', error: true });
        }
        if (user) {
            if (user.login.toLowerCase() === data.login.toLowerCase()) {
                error += 'Пользователь с таким именем уже зарегистрирован. '; //'User with such login already exists. '
            }
            if (user.email === data.email) {
                error += 'Пользователь с таким email уже зарегистрирован.'; //'User with such email already exists.'
            }
            return cb({ message: error, error: true });
        }

        step(
            function () {
                Counter.increment('user', this);
            },
            function createUser(err, count) {
                if (err || !count) {
                    logger.error('Auth register increment user: ', err || 'Increment user counter error');
                    return cb(registerPublicError);
                }
                var regionHome = getRegionsArrFromCache([3]);
                if (regionHome.length) {
                    regionHome = regionHome[0]._id;
                }

                new User({
                    login: data.login,
                    cid: count.next,
                    email: data.email,
                    pass: data.pass,
                    disp: data.login,
                    regionHome: regionHome || undefined, // Домашним регионом пока делаем всем Москву
                    settings: {
                        // Пустой объект settings не сохранится, заполняем его одной из настроек
                        subscr_auto_reply: userSettingsDef.subscr_auto_reply || true
                    }
                }).save(this);
            },
            function (err, user) {
                if (err || !user) {
                    logger.error('Auth register user save: ', err);
                    return cb(registerPublicError);
                }
                confirmKey = Utils.randomString(7);
                new UserConfirm({ key: confirmKey, user: user._id }).save(this);
            },

            function finish(err) {
                if (err) {
                    User.remove({ login: data.login });
                    logger.error('Auth register UserConfirm save: ', err);
                    return cb(registerPublicError);
                }
                cb({ message: success });

                sendMail({
                    sender: 'noreply',
                    receiver: { alias: data.login, email: data.email },
                    subject: 'Подтверждение регистрации',
                    head: true,
                    body: regTpl({
                        data,
                        confirmKey,
                        username: data.login,
                        greeting: 'Спасибо за регистрацию на проекте PastVu!',
                        linkvalid: moment.duration(ms('2d')).humanize() + ' (до ' + moment().utc().lang('ru').add(ms('2d')).format("LLL") + ')'
                    }),
                    text: 'Перейдите по следующей ссылке: ' + config.client.origin + '/confirm/' + confirmKey
                });
            }
        );
    });
}

// Отправка на почту запроса на восстановление пароля
var successPublic = { message: 'Запрос успешно отправлен. Для продолжения процедуры следуйте инструкциям, высланным на Ваш e-mail' }, //success = 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail',
    recallPublicError = { message: 'Ошибка восстановления пароля', error: true };
function recall(iAm, data, cb) {
    var confirmKey = '';

    if (!_.isObject(data) || !data.login) {
        return cb({ message: 'Bad params', error: true });
    }

    step(
        function checkUserExists() {
            User.findOne({
                $or: [
                    { login: new RegExp('^' + data.login + '$', 'i') },
                    { email: data.login.toLowerCase() }
                ]
            }).exec(this);
        },
        function (err, user) {
            if (err) {
                logger.error('Auth recall User.findOne: ', err);
                return cb(recallPublicError);
            }
            if (!user) {
                return cb({ message: 'Пользователя с таким логином или e-mail не существует', error: true }); //'User with such login or e-mail does not exist'
            }
            // Если залогинен и пытается восстановить не свой аккаунт, то проверяем что это админ
            if (iAm.registered && iAm.user.login !== data.login && !iAm.isAdmin) {
                return cb({ message: msg.deny, error: true });
            }

            data._id = user._id;
            data.login = user.login;
            data.email = user.email;
            data.disp = user.disp;
            confirmKey = Utils.randomString(8);
            UserConfirm.remove({ user: user._id }, this);
        },
        function (err) {
            if (err) {
                logger.error('Auth recall UserConfirm.remove: ', err);
                return cb(recallPublicError);
            }
            new UserConfirm({ key: confirmKey, user: data._id }).save(this);
        },
        function finish(err) {
            if (err) {
                logger.error('Auth recall UserConfirm.save: ', err);
                return cb(recallPublicError);
            }
            cb(successPublic);

            sendMail({
                sender: 'noreply',
                receiver: { alias: data.login, email: data.email },
                subject: 'Запрос на восстановление пароля',
                head: true,
                body: recallTpl({
                    data,
                    confirmKey,
                    username: data.disp,
                    linkvalid: moment.duration(ms('2d')).humanize() + ' (до ' + moment().utc().lang('ru').add(ms('2d')).format("LLL") + ')'
                }),
                text: 'Перейдите по следующей ссылке: ' + config.client.origin + '/confirm/' + confirmKey
            });
        }
    );
}

// Смена пароля по запросу восстановлния из почты
var passChangeRecallPublicError = { message: 'Ошибка смены пароля', error: true };
function passChangeRecall(iAm, data, cb) {
    var error = '',
        key = data.key;

    if (!data || !Utils.isType('string', key) || key.length !== 8) {
        error = 'Bad params. ';
    }
    if (!data.pass) {
        error += 'Fill in the password field. ';
    }
    if (data.pass !== data.pass2) {
        error += 'Passwords do not match.';
    }
    if (error) {
        return cb({ message: error, error: true });
    }

    UserConfirm.findOne({ key }).populate('user').exec(function (err, confirm) {
        if (err) {
            logger.error('Auth passChangeRecall UserConfirm.findOne: ', err);
            return cb(passChangeRecallPublicError);
        }
        if (!confirm || !confirm.user) {
            return cb(passChangeRecallPublicError);
        }
        step(
            function () {
                // Если залогиненный пользователь запрашивает восстановление, то пароль надо поменять в модели пользователя сессии
                // Если аноним - то в модели пользователи конфирма
                // (Это один и тот же пользователь, просто разные объекты)
                var user = iAm.registered && iAm.user.login === confirm.user.login ? iAm.user : confirm.user;
                user.pass = data.pass;

                // Если неактивный пользователь восстанавливает пароль - активируем его
                if (!user.active) {
                    user.active = true;
                    user.activatedate = new Date();
                }

                user.save(this.parallel());
                confirm.remove(this.parallel());
            },
            function (err) {
                if (err) {
                    logger.error('Auth passChangeRecall user.save or confirm.remove: ', err);
                    return cb(passChangeRecallPublicError);
                }

                cb({ message: 'Новый пароль сохранен успешно' });
            }
        );
    });
}

// Смена пароля в настройках пользователя с указанием текущего пароля
var passChangePublicError = { message: 'Ошибка смены пароля', error: true };
function passChange(iAm, data, cb) {
    var error = '';

    if (!iAm.registered || !data || iAm.user.login !== data.login) {
        return cb({ message: 'Вы не авторизованны для этой операции', error: true }); // 'You are not authorized for this action'
    }
    if (!data.pass || !data.passNew || !data.passNew2) {
        error += 'Заполните все поля. '; // 'Fill in all password fields. ';
    }
    if (data.passNew !== data.passNew2) {
        error += 'Новые пароли не совпадают. '; // 'New passwords do not match each other.';
    }
    if (error) {
        return cb({ message: error, error: true });
    }

    iAm.user.checkPass(data.pass, function (err, isMatch) {
        if (err) {
            logger.error('Auth passChange iAm.user.checkPass: ', err);
            return cb(passChangePublicError);
        }

        if (isMatch) {
            iAm.user.pass = data.passNew;
            iAm.user.save(function (err) {
                if (err) {
                    logger.error('Auth passChange iAm.user.save: ', err);
                    return cb(passChangePublicError);
                }
                cb({ message: 'Новый пароль установлен успешно' }); //'Password was changed successfully!'
            });
        } else {
            cb({ message: 'Текущий пароль не верен', error: true }); //'Current password incorrect'
        }
    });
}

//Проверка ключа confirm
var checkConfirmPublicError = { message: 'Ошибка подтверждения ключа', error: true };
function checkConfirm(data, cb) {
    if (!data || !Utils.isType('string', data.key) || data.key.length < 7 || data.key.length > 8) {
        cb({ message: 'Bad params', error: true });
        return;
    }

    var key = data.key;
    UserConfirm.findOne({ key: key }).populate('user').exec(function (err, confirm) {
        if (err) {
            logger.error('Auth checkConfirm UserConfirm.findOne: ', err);
            return cb(checkConfirmPublicError);
        }
        if (!confirm || !confirm.user) {
            return cb({ message: 'Переданного вами ключа не существует', error: true });
        }
        var user = confirm.user,
            avatar;

        if (key.length === 7) { //Confirm registration
            step(
                function () {
                    user.active = true;
                    user.activatedate = new Date();
                    user.save(this.parallel());
                    confirm.remove(this.parallel());
                },
                function (err) {
                    if (err) {
                        logger.error('Auth checkConfirm confirm.remove: ', err);
                        return cb(checkConfirmPublicError);
                    }

                    cb({
                        message: 'Спасибо, регистрация подтверждена! Теперь вы можете войти в систему, используя ваш логин и пароль',
                        type: 'noty'
                    });
                    //cb({message: 'Thank you! Your registration is confirmed. Now you can enter using your username and password', type: 'noty'});
                }
            );
        } else if (key.length === 8) { //Confirm pass change
            if (user.avatar) {
                if (preaddrs.length) {
                    avatar = preaddrs[0] + '/_a/h/' + user.avatar;
                } else {
                    avatar = '/_a/h/' + user.avatar;
                }
            } else {
                avatar = '/img/caps/avatarth.png';
            }
            cb({ message: 'Pass change', type: 'authPassChange', login: user.login, disp: user.disp, avatar: avatar });
        }

    });
}

fs.readFile(path.normalize('./views/mail/registration.jade'), 'utf-8', function (err, data) {
    if (err) {
        return loggerApp.error('Notice jade read error: ' + err.message);
    }
    regTpl = jade.compile(data, { filename: path.normalize('./views/mail/registration.jade'), pretty: false });
});
fs.readFile(path.normalize('./views/mail/recall.jade'), 'utf-8', function (err, data) {
    if (err) {
        return loggerApp.error('Notice jade read error: ' + err.message);
    }
    recallTpl = jade.compile(data, { filename: path.normalize('./views/mail/recall.jade'), pretty: false });
});
export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('loginRequest', function (json) {
            login(socket, json, function (data) {
                socket.emit('loginResult', data);
            });
        });

        socket.on('logoutRequest', function () {
            session.logoutUser(socket, function (err) {
                socket.emit('logoutCommand', { message: (err && err.message) || '', error: !!err });
            });
        });

        socket.on('registerRequest', function (data) {
            register(data, function (data) {
                socket.emit('registerResult', data);
            });
        });

        socket.on('recallRequest', function (data) {
            recall(hs.usObj, data, function (data) {
                socket.emit('recallResult', data);
            });
        });

        socket.on('passChangeRecall', function (data) {
            passChangeRecall(hs.usObj, data, function (data) {
                socket.emit('passChangeRecallResult', data);
            });
        });
        socket.on('passChangeRequest', function (data) {
            passChange(hs.usObj, data, function (data) {
                socket.emit('passChangeResult', data);
            });
        });

        socket.on('whoAmI', function () {
            socket.emit('youAre', {
                user: hs.usObj.user && hs.usObj.user.toObject ? hs.usObj.user.toObject() : null,
                registered: hs.usObj.registered
            });
        });

        socket.on('checkConfirm', function (data) {
            checkConfirm(data, function (data) {
                socket.emit('checkConfirmResult', data);
            });
        });
    });
};