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
    regError: 'Registration error',
    recError: 'Password recovery error',
    passChangeError: 'Password change error'
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
async function login(socket, { login, pass } = {}) {
    if (!login) {
        throw { message: 'Fill in the login field' };
    }
    if (!pass) {
        throw { message: 'Fill in the password field' };
    }

    try {
        const user = await User.getAuthenticated(login, pass);

        // Transfer user to session
        const { userPlain } = await session.loginUser(socket, user);

        return { message: 'Success login', youAre: userPlain };
    } catch (err) {
        switch (err.code) {
            case User.failedLogin.NOT_FOUND:
            case User.failedLogin.PASSWORD_INCORRECT:
                // note: these cases are usually treated the same -
                // don't tell the user *why* the login failed, only that it did
                throw { message: 'Incorrect combination of login and password' };
            case User.failedLogin.MAX_ATTEMPTS:
                // send email or otherwise notify user that account is temporarily locked
                throw {
                    message: 'Your account has been temporarily locked due to exceeding the number of wrong login attempts'
                };
            default:
                logger.error('Auth login session.loginUser: ', err);
                throw { message: 'Authorisation error' };
        }
    }
}

// Users logout
async function logout(socket) {
    await session.logoutUser(socket);

    return {};
}

// Registration
async function register(iAm, { login, email, pass, pass2 } = {}) {
    if (!login) {
        throw { message: 'Fill in the login field' };
    }

    if (login !== 'anonymous' &&
        !login.match(/^[\.\w-]{3,15}$/i) || !login.match(/^[A-za-z].*$/i) || !login.match(/^.*\w$/i)) {
        throw {
            message: 'User name must contain between 3 and 15 Latin characters and begin with a letter. ' +
            'The words can contain digits, dot, dash, and underscore.'
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
        throw { message: 'Password mismatch' };
    }

    let user = await User.findOne({ $or: [{ login: new RegExp('^' + login + '$', 'i') }, { email }] }).exec();

    if (user) {
        if (user.login.toLowerCase() === login.toLowerCase()) {
            throw { message: 'User with such login is already registered' };
        }
        if (user.email === email) {
            throw { message: 'User with such email is already registered' };
        }

        throw { message: 'User is already registered' };
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
            subject: 'Confirmation of registration',
            head: true,
            body: regTpl({
                email,
                login,
                config,
                confirmKey,
                username: login,
                greeting: 'Thank you for registering on the PastVu project!',
                linkvalid: `${human2d} (till ${moment.utc().add(ms2d).format('LLL')})`
            }),
            text: `Click the following link: ${config.client.origin}/confirm/${confirmKey}`
        });

    } catch (err) {
        await User.remove({ login }).exec();

        logger.error('Auth register after save: ', err);
        throw { message: msg.regError };
    }

    return {
        message: 'Account has been successfully created. To confirm registration, ' +
        'follow the instructions sent to Your e-mail'
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
        throw { message: 'User with such login or e-mail does not exist' };
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
        subject: 'Password recovery request',
        head: true,
        body: recallTpl({
            config,
            confirmKey,
            username: user.disp,
            linkvalid: `${human2d} (till ${moment.utc().add(ms2d).format('LLL')})`
        }),
        text: `Click the following link: ${config.client.origin}/confirm/${confirmKey}`
    });

    return {
        message: 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail'
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
        throw { message: 'Passwords do not match' };
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

    return { message: 'New password has been saved successfully' };
}

// Password changing in user's settings page with entering current password
async function passChange(iAm, { login, pass, passNew, passNew2 } = {}) {
    if (!iAm.registered || iAm.user.login !== login) {
        throw { message: msg.deny };
    }
    if (!pass || !passNew || !passNew2) {
        throw { message: 'Fill in all password fields' };
    }
    if (passNew !== passNew2) {
        throw { message: 'Passwords do not match' };
    }

    const isMatch = await iAm.user.checkPass(pass);

    if (!isMatch) {
        throw { message: 'Current password is incorrect' };
    }

    iAm.user.pass = passNew;
    await iAm.user.save();

    return { message: 'Password has been changed successfully' };
}

// Check confirm key
async function checkConfirm({ key } = {}) {
    if (!_.isString(key) || key.length < 7 || key.length > 8) {
        throw { message: 'Bad params' };
    }

    const confirm = await UserConfirm.findOne({ key }).populate('user').exec();

    if (!confirm || !confirm.user) {
        throw { message: 'The key you have passed does not exist' };
    }

    const user = confirm.user;

    if (key.length === 7) { // Confirm registration
        user.active = true;
        user.activatedate = new Date();
        await* [user.save(), confirm.remove()];

        return {
            message: 'Thank you! Your registration is confirmed. Now you can login using your username and password',
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

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('loginRequest', function (data) {
            login(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('loginResult', resultData);
                });
        });

        socket.on('logoutRequest', function () {
            logout(socket)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('logouResult', resultData);
                });
        });

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
}