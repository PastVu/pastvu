/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { promises as fsAsync } from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import pug from 'pug';
import log4js from 'log4js';
import moment from 'moment';
import config from '../config';
import Utils from '../commons/Utils';
import { getT, langFromHandshake, pickLang } from '../commons/i18n';
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

function formatLinkValid(lang, t) {
    return `${moment.duration(ms2d).locale(lang).humanize()} ` +
        `(${t('until')} ${moment.utc().add(ms2d).locale(lang).format('LLL')})`;
}

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
    const lang = langFromHandshake(this.handshake);
    const t = getT(lang);

    if (!login) {
        throw new InputError(constants.INPUT_LOGIN_REQUIRED);
    }

    if (login === 'anonymous' || !login.match(/^[.\w-]{3,15}$/i) || !login.match(/^[A-Za-z].+$/i) || !login.match(/[a-zA-Z0-9]$/)) {
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
            subject: t('Email confirmation'),
            head: true,
            body: regTpl({
                email,
                login,
                config,
                confirmKey,
                username: login,
                greeting: t('Thanks for signing up to PastVu!'),
                linkvalid: formatLinkValid(lang, t),
                t,
            }),
            text: t('Follow this link: {{link}}', { link: `${config.client.origin}/confirm/${confirmKey}` }),
        });
    } catch (err) {
        await User.deleteOne({ login }).exec();

        logger.error('Auth register after save: ', err);
        throw new AuthenticationError(constants.AUTHENTICATION_REGISTRATION);
    }

    return {
        message: t('Account created. To finish signing up, follow the instructions sent to your e-mail.'),
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
        $or: [{ login: new RegExp(`^${_.escapeRegExp(login)}$`) }, { email: login.toLowerCase() }],
    }, null, { lean: true }).exec();

    if (!user) {
        throw new AuthenticationError(constants.AUTHENTICATION_REGISTRATION);
    }

    // Prefer the recall target's saved language so the email matches their UI,
    // even when the recall form was opened in a different language. pickLang
    // normalises against config.locales, so an unsupported stored value falls
    // through to the request cookie / default rather than leaking into
    // moment.locale(lang) below.
    const lang = pickLang(user, this.handshake);
    const t = getT(lang);

    const confirmKey = Utils.randomString(8);

    await UserConfirm.deleteOne({ user: user._id }).exec();

    await new UserConfirm({ key: confirmKey, user: user._id }).save();

    sendMail({
        sender: 'noreply',
        receiver: { alias: user.login, email: user.email },
        subject: t('Password recovery request'),
        head: true,
        body: recallTpl({
            config,
            confirmKey,
            username: user.disp,
            linkvalid: formatLinkValid(lang, t),
            t,
        }),
        text: t('Follow this link: {{link}}', { link: `${config.client.origin}/confirm/${confirmKey}` }),
    });

    return {
        message: t('Request submitted. To continue, follow the instructions sent to your e-mail.'),
    };
}

// Password change by recall request from email
async function passChangeRecall({ key, pass, pass2 }) {
    const { handshake: { usObj: iAm } } = this;
    const t = getT(langFromHandshake(this.handshake));

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

    return { message: t('New password saved successfully') };
}

// Password changing in user's settings page with entering current password
async function passChange({ login, pass, passNew, passNew2 }) {
    const { handshake: { usObj: iAm } } = this;
    const t = getT(langFromHandshake(this.handshake));

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

    return { message: t('New password set successfully') };
}

// Check confirm key
async function checkConfirm({ key }) {
    const t = getT(langFromHandshake(this.handshake));

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
            message: t('Thank you, your registration is confirmed. You can now sign in with your login and password.'),
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
