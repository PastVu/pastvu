import { promises as fsAsync } from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import pug from 'pug';
import log4js from 'log4js';
import moment from 'moment';
import config from '../config';
import Utils from '../commons/Utils';
import * as session from './_session';
import { send as sendMail } from './mail';
import { userSettingsDef } from './settings';
import { getRegionsArrPublicFromCache } from './region';
import constants from '../app/errors/constants';
import { AuthenticationError, AuthorizationError, BadParamsError, InputError } from '../app/errors';

import { User, UserConfirm } from '../models/User';
import { Counter } from '../models/Counter';

moment.locale(config.lang);

const ms2d = ms('2d');
const human2d = moment.duration(ms2d).humanize();
const logger = log4js.getLogger('auth.js');

let recallTpl;
let regTpl;

export const ready = (async () => {
    try {
        const [regData, recallData] = await Promise.all([
            fsAsync.readFile(path.normalize('./views/mail/registration.pug'), 'utf-8'),
            fsAsync.readFile(path.normalize('./views/mail/recall.pug'), 'utf-8'),
        ]);

        regTpl = pug.compile(regData, { filename: path.normalize('./views/mail/registration.pug'), pretty: false });
        recallTpl = pug.compile(recallData, { filename: path.normalize('./views/mail/recall.pug'), pretty: false });
    } catch (err) {
        err.message = 'Auth pug read error: ' + err.message;
        throw err;
    }
})();

// Users login
async function login({ login, pass }) {
    const { socket } = this;

    if (!login) {
        throw new InputError(constants.INPUT_LOGIN_REQUIRED);
    }

    if (!pass) {
        throw new InputError(constants.INPUT_PASS_REQUIRED);
    }

    try {
        const user = await User.getAuthenticated(login, pass);

        // Transfer user to session
        const { userPlain } = await this.call('session.loginUser', { socket, user });

        return { message: 'Success login', youAre: userPlain };
    } catch (error) {
        switch (error.code) {
            case constants.NOT_FOUND_USER:
            case constants.AUTHENTICATION_PASS_WRONG:
                // These cases are usually treated the same, don't tell the user why the login failed, only that it did
                throw new AuthenticationError(constants.AUTHENTICATION_DOESNT_MATCH);
            case constants.AUTHENTICATION_MAX_ATTEMPTS:
            case constants.AUTHENTICATION_NOT_ALLOWED:
                // send email or otherwise notify user that account is temporarily locked
                throw error;
            default:
                throw error;
        }
    }
}

// User logout
async function logout() {
    const { socket, handshake: { usObj, session } } = this;

    await this.call('session.logoutUser', { socket, usObj, session, currentSession: true });

    return {};
}

// Registration
async function register({ login, email, pass, pass2 }) {
    if (!login) {
        throw new InputError(constants.INPUT_LOGIN_REQUIRED);
    }

    if (login === 'anonymous' || !login.match(/^[.\w-]{3,15}$/i) || !login.match(/^[A-Za-z].+$/i) || !login.match(/[a-zA-Z1-9]$/)) {
        throw new AuthenticationError(constants.INPUT_LOGIN_CONSTRAINT);
    }

    if (!email) {
        throw new InputError(constants.INPUT_EMAIL_REQUIRED);
    }

    email = email.toLowerCase();

    if (!Utils.validateEmail(email)) {
        throw new InputError(constants.MAIL_WRONG);
    }

    if (!pass) {
        throw new InputError(constants.INPUT_PASS_REQUIRED);
    }

    if (pass !== pass2) {
        throw new AuthenticationError(constants.AUTHENTICATION_PASSWORDS_DONT_MATCH);
    }

    let user = await User.findOne({ $or: [{ login: new RegExp(`^${_.escapeRegExp(login)}$`, 'i') }, { email }] }).exec();

    if (user) {
        if (user.email === email) {
            throw new AuthenticationError(constants.AUTHENTICATION_EMAIL_EXISTS);
        }

        throw new AuthenticationError(constants.AUTHENTICATION_USER_EXISTS);
    }

    const count = await Counter.increment('user');

    let regionHome = getRegionsArrPublicFromCache([config.regionHome]);

    if (regionHome.length) {
        regionHome = regionHome[0]._id;
    } else {
        // config.regionHome is not in list of regions.
        // This may happen in test environment when regions collection was not
        // populated.
        regionHome = undefined;
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
            subscr_auto_reply: userSettingsDef.subscr_auto_reply || true,
        },
    });

    await user.save();

    try {
        const confirmKey = Utils.randomString(7);

        await new UserConfirm({ key: confirmKey, user: user._id }).save();

        await sendMail({
            sender: 'noreply',
            receiver: { alias: login, email },
            bcc: config.admin.email,
            subject: 'Registration Confirmation',
            head: true,
            body: regTpl({
                email,
                login,
                config,
                confirmKey,
                username: login,
                greeting: 'Thank you for the registering on PastVu!',
                linkvalid: `${human2d} (till ${moment.utc().add(ms2d).format('LLL')})`,
            }),
            text: `Click the following link: ${config.client.origin}/confirm/${confirmKey}`,
        });
    } catch (err) {
        await User.deleteOne({ login }).exec();

        logger.error('Auth register after save: ', err);
        throw new AuthenticationError(constants.AUTHENTICATION_REGISTRATION);
    }

    return {
        message: 'Account has been successfully created. To confirm registration, ' +
        'follow the instructions sent to Your e-mail',
    };
}

// Send to email request for password recovery
async function recall({ login }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login || !_.isString(login)) {
        throw new InputError(constants.INPUT_LOGIN_REQUIRED);
    }

    // If user logged in and trying to restore not own account, he must be admin
    if (iAm.registered && iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const user = await User.findOne({
        $or: [{ login: new RegExp(`^${_.escapeRegExp(login)}$`, 'i') }, { email: login.toLowerCase() }],
    }, null, { lean: true }).exec();

    if (!user) {
        throw new AuthenticationError(constants.AUTHENTICATION_REGISTRATION);
    }

    const confirmKey = Utils.randomString(8);

    await UserConfirm.deleteOne({ user: user._id }).exec();

    await new UserConfirm({ key: confirmKey, user: user._id }).save();

    sendMail({
        sender: 'noreply',
        receiver: { alias: user.login, email: user.email },
        subject: 'Password recovery request',
        head: true,
        body: recallTpl({
            config,
            confirmKey,
            username: user.disp,
            linkvalid: `${human2d} (till ${moment.utc().add(ms2d).format('LLL')})`,
        }),
        text: `Click the following link: ${config.client.origin}/confirm/${confirmKey}`,
    });

    return {
        message: 'The data has been successfully sent. To restore the password, follow the instructions sent to Your e-mail',
    };
}

// Password change by recall request from email
async function passChangeRecall({ key, pass, pass2 }) {
    const { handshake: { usObj: iAm } } = this;

    if (!_.isString(key) || key.length !== 8) {
        throw new BadParamsError();
    }

    if (!_.isString(pass) || !pass || !_.isString(pass2) || !pass2) {
        throw new InputError(constants.INPUT_PASS_REQUIRED);
    }

    if (pass !== pass2) {
        throw new AuthenticationError(constants.AUTHENTICATION_PASSWORDS_DONT_MATCH);
    }

    const confirm = await UserConfirm.findOne({ key }).populate('user').exec();

    if (!confirm || !confirm.user) {
        throw new AuthenticationError(constants.AUTHENTICATION_PASSCHANGE);
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

    await Promise.all([user.save(), confirm.deleteOne()]);

    return { message: 'New password has been saved successfully' };
}

// Password changing in user's settings page with entering current password
async function passChange({ login, pass, passNew, passNew2 }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered || iAm.user.login !== login) {
        throw new AuthorizationError();
    }

    if (!pass || !passNew || !passNew2) {
        throw new InputError(constants.INPUT_PASS_REQUIRED);
    }

    if (passNew !== passNew2) {
        throw new AuthenticationError(constants.AUTHENTICATION_PASSWORDS_DONT_MATCH);
    }

    const isMatch = await iAm.user.checkPass(pass);

    if (!isMatch) {
        throw new AuthenticationError(constants.AUTHENTICATION_CURRPASS_WRONG);
    }

    iAm.user.pass = passNew;
    await iAm.user.save();

    return { message: 'Password has been changed successfully' };
}

// Check confirm key
async function checkConfirm({ key }) {
    if (!_.isString(key) || key.length < 7 || key.length > 8) {
        throw new BadParamsError();
    }

    const confirm = await UserConfirm.findOne({ key }).populate('user').exec();

    if (!confirm || !confirm.user) {
        throw new BadParamsError(constants.AUTHENTICATION_KEY_DOESNT_EXISTS);
    }

    const user = confirm.user;

    if (key.length === 7) { // Confirm registration
        user.active = true;
        user.activatedate = new Date();
        await Promise.all([user.save(), confirm.deleteOne()]);

        return {
            message: 'Thank you! Your registration is confirmed. Now you can log in using your username and password',
            type: 'noty',
        };
    }

    if (key.length === 8) { // Confirm password change
        const avatar = user.avatar ? '/_a/h/' + user.avatar : '/img/caps/avatarth.png';

        return { message: 'Pass change', type: 'authPassChange', login: user.login, disp: user.disp, avatar };
    }
}

function whoAmI() {
    const { socket, handshake: { usObj: iAm } } = this;
    const result = {
        user: session.getPlainUser(iAm.user),
        registered: iAm.registered,
    };

    this.call('session.emitSocket', { socket, data: ['youAre', result] });
}

login.isPublic = true;
logout.isPublic = true;
register.isPublic = true;
recall.isPublic = true;
passChangeRecall.isPublic = true;
passChange.isPublic = true;
checkConfirm.isPublic = true;
whoAmI.isPublic = true;

export default {
    login,
    logout,
    register,
    recall,
    passChangeRecall,
    passChange,
    checkConfirm,
    whoAmI,
};
