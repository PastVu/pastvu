import fs from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
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

moment.locale(config.lang);

const ms2d = ms('2d');
const human2d = moment.duration(ms2d).humanize();
const logger = log4js.getLogger('auth.js');
const msg = {
    deny: 'You do not have permission for this action',
    regError: 'Ошибка регистрации',
    recError: 'Ошибка восстановления пароля',
    passChangeError: 'Ошибка смены пароля'
};

let recallTpl;
let regTpl;

export const ready = new Promise(async function(resolve, reject) {
    try {
        const [regData, recallData] = await* [
            fs.readFileAsync(path.normalize('./views/mail/registration.jade'), 'utf-8'),
            fs.readFileAsync(path.normalize('./views/mail/recall.jade'), 'utf-8')
        ];

        regTpl = jade.compile(regData, { filename: path.normalize('./views/mail/registration.jade'), pretty: false });
        recallTpl = jade.compile(recallData, { filename: path.normalize('./views/mail/recall.jade'), pretty: false });
        resolve();
    } catch (err) {
        err.message = 'Auth jade read error: ' + err.message;
        reject(err);
    }
});

// Users login
async function login({ login, pass }) {
    const { socket } = this;

    if (!login) {
        throw { message: 'Fill in the login field' };
    }
    if (!pass) {
        throw { message: 'Fill in the password field' };
    }

    try {
        const user = await User.getAuthenticated(login, pass);

        // Transfer user to session
        const { userPlain } = await this.call('session.loginUser', { socket, user });

        return { message: 'Success login', youAre: userPlain };
    } catch (err) {
        switch (err.code) {
            case User.failedLogin.NOT_FOUND:
            case User.failedLogin.PASSWORD_INCORRECT:
                // note: these cases are usually treated the same - don't tell the user *why* the login failed, only that it did
                throw { message: 'Неправильная пара логин-пароль' };
            case User.failedLogin.MAX_ATTEMPTS:
                // send email or otherwise notify user that account is temporarily locked
                throw {
                    message: 'Your account has been temporarily locked due to exceeding the number of wrong login attempts'
                };
            default:
                logger.error('Auth login session.loginUser: ', err);
                throw { message: 'Ошибка авторизации' };
        }
    }
}

// Users logout
async function logout() {
    await this.call('session.logoutUser');

    return {};
}

// Registration
async function register(iAm, { login, email, pass, pass2 } = {}) {
    if (!login) {
        throw { message: 'Заполните имя пользователя' };
    }

    if (login !== 'anonymous' &&
        !login.match(/^[\.\w-]{3,15}$/i) || !login.match(/^[A-za-z].*$/i) || !login.match(/^.*\w$/i)) {
        throw {
            message: 'Имя пользователя должно содержать от 3 до 15 латинских символов и начинаться с буквы. ' +
            'В состав слова могут входить цифры, точка, подчеркивание и тире'
        };
    }

    if (!email) {
        throw { message: 'Fill in the e-mail field' };
    }

    email = email.toLowerCase();

    if (!pass) {
        throw { message: 'Fill in the password field' };
    }
    if (pass !== pass2) {
        throw { message: 'Пароли не совпадают' };
    }

    let user = await User.findOne({ $or: [{ login: new RegExp('^' + login + '$', 'i') }, { email }] }).exec();

    if (user) {
        if (user.login.toLowerCase() === login.toLowerCase()) {
            throw { message: 'Пользователь с таким именем уже зарегистрирован' };
        }
        if (user.email === email) {
            throw { message: 'Пользователь с таким email уже зарегистрирован' };
        }

        throw { message: 'Пользователь уже зарегистрирован' };
    }

    const count = await Counter.increment('user');

    let regionHome = getRegionsArrFromCache([config.regionHome]);

    if (regionHome.length) {
        regionHome = regionHome[0]._id;
    }

    user = new User({
        pass,
        email,
        login,
        cid: count.next,
        disp: login,
        regionHome: regionHome || undefined, // Take home default home region from config
        settings: {
            // Empty settings objects will not be saved, so fill it with one of settings
            subscr_auto_reply: userSettingsDef.subscr_auto_reply || true
        }
    });

    await user.save();

    try {
        const confirmKey = Utils.randomString(7);

        await new UserConfirm({ key: confirmKey, user: user._id }).save();

        sendMail({
            sender: 'noreply',
            receiver: { alias: login, email },
            subject: 'Подтверждение регистрации',
            head: true,
            body: regTpl({
                email,
                login,
                config,
                confirmKey,
                username: login,
                greeting: 'Спасибо за регистрацию на проекте PastVu!',
                linkvalid: `${human2d} (до ${moment.utc().add(ms2d).format('LLL')})`
            }),
            text: `Перейдите по следующей ссылке: ${config.client.origin}/confirm/${confirmKey}`
        });

    } catch (err) {
        await User.remove({ login }).exec();

        logger.error('Auth register after save: ', err);
        throw { message: msg.regError };
    }

    return {
        message: 'Учетная запись создана успешно. Для завершения регистрации следуйте инструкциям, ' +
        'отправленным на указанный вами e-mail'
    };
}

// Send to email request for password recovery
async function recall(iAm, { login } = {}) {
    if (!login || !_.isString(login)) {
        throw { message: 'Bad params' };
    }

    const user = await User.findOne({
        $or: [{ login: new RegExp(`^${login}$`, 'i') }, { email: login.toLowerCase() }]
    }, null, { lean: true }).exec();

    if (!user) {
        throw { message: 'Пользователя с таким логином или e-mail не существует' };
    }

    // If user logged in and trying t restore not own accaunt, it mast be admin
    if (iAm.registered && iAm.user.login !== login && !iAm.isAdmin) {
        throw { message: msg.deny };
    }

    const confirmKey = Utils.randomString(8);
    await UserConfirm.remove({ user: user._id }).exec();

    await new UserConfirm({ key: confirmKey, user: user._id }).save();

    sendMail({
        sender: 'noreply',
        receiver: { alias: login, email: user.email },
        subject: 'Запрос на восстановление пароля',
        head: true,
        body: recallTpl({
            config,
            confirmKey,
            username: user.disp,
            linkvalid: `${human2d} (до ${moment.utc().add(ms2d).format('LLL')})`
        }),
        text: `Перейдите по следующей ссылке: ${config.client.origin}/confirm/${confirmKey}`
    });

    return {
        message: 'Запрос успешно отправлен. Для продолжения процедуры следуйте инструкциям, высланным на Ваш e-mail'
    };
}

// Password hange by recall request from email
async function passChangeRecall(iAm, { key, pass, pass2 } = {}) {
    if (!_.isString(key) || key.length !== 8) {
        throw { message: 'Bad params' };
    }
    if (!_.isString(pass) || !pass) {
        throw { message: 'Fill in the password field' };
    }
    if (pass !== pass2) {
        throw { message: 'Пароли не совпадают' };
    }

    const confirm = await UserConfirm.findOne({ key }).populate('user').exec();

    if (!confirm || !confirm.user) {
        throw { message: msg.passChangeError };
    }

    // If registered user has requested password restoration, pass must be changed in user's model in session
    // If anonym - in user's model in confirm
    // (it the same user, but different objects)
    const user = iAm.registered && iAm.user.login === confirm.user.login ? iAm.user : confirm.user;
    user.pass = pass;

    // If inactive user is restoring password - activate him
    if (!user.active) {
        user.active = true;
        user.activatedate = new Date();
    }

    await* [user.save(), confirm.remove()];

    return { message: 'Новый пароль сохранен успешно' };
}

// Password changing in user's settings page with entering current password
async function passChange(iAm, { login, pass, passNew, passNew2 } = {}) {
    if (!iAm.registered || iAm.user.login !== login) {
        throw { message: msg.deny };
    }
    if (!pass || !passNew || !passNew2) {
        throw { message: 'Заполните все поля' };
    }
    if (passNew !== passNew2) {
        throw { message: 'Пароли не совпадают' };
    }

    const isMatch = await iAm.user.checkPass(pass);

    if (!isMatch) {
        throw { message: 'Текущий пароль не верен' };
    }

    iAm.user.pass = passNew;
    await iAm.user.save();

    return { message: 'Новый пароль установлен успешно' };
}

// Check confirm key
async function checkConfirm({ key } = {}) {
    if (!_.isString(key) || key.length < 7 || key.length > 8) {
        throw { message: 'Bad params' };
    }

    const confirm = await UserConfirm.findOne({ key }).populate('user').exec();

    if (!confirm || !confirm.user) {
        throw { message: 'Переданного вами ключа не существует' };
    }

    const user = confirm.user;

    if (key.length === 7) { // Confirm registration
        user.active = true;
        user.activatedate = new Date();
        await* [user.save(), confirm.remove()];

        return {
            message: 'Спасибо, регистрация подтверждена! Теперь вы можете войти в систему, используя ваш логин и пароль',
            type: 'noty'
        };
    } else if (key.length === 8) { // Confirm password change
        const avatar = user.avatar ? '/_a/h/' + user.avatar : '/img/caps/avatarth.png';

        return { message: 'Pass change', type: 'authPassChange', login: user.login, disp: user.disp, avatar };
    }
}

const whoAmI = iAm => Promise.resolve({
    user: iAm.user && iAm.user.toObject ? iAm.user.toObject() : null,
    registered: iAm.registered
});

login.isPublic = true;
login.logout = true;
export default {
    login,
    logout
};

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('registerRequest', function (data) {
            register(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('registerResult', resultData);
                });
        });

        socket.on('recallRequest', function (data) {
            recall(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('recallResult', resultData);
                });
        });

        socket.on('passChangeRecall', function (data) {
            passChangeRecall(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('passChangeRecallResult', resultData);
                });
        });
        socket.on('passChangeRequest', function (data) {
            passChange(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('passChangeResult', resultData);
                });
        });

        socket.on('checkConfirm', function (data) {
            checkConfirm(data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('checkConfirmResult', resultData);
                });
        });

        socket.on('whoAmI', function () {
            whoAmI(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('youAre', resultData);
                });
        });
    });
};