import fs from 'fs';
import gm from 'gm';
import _ from 'lodash';
import path from 'path';
import mkdirp from 'mkdirp';
import config from '../config';
import Bluebird from 'bluebird';
import { exec } from 'child_process';
import Utils from '../commons/Utils';
import * as session from './_session';
import constants from './constants.js';
import * as photoController from './photo';
import { userThrottleChange } from './subscr';
import constantsError from '../app/errors/constants';
import { userSettingsDef, userSettingsVars, userRanksHash } from './settings';
import { AuthenticationError, AuthorizationError, BadParamsError, InputError, NotFoundError } from '../app/errors';

import { User } from '../models/User';

const incomeDir = path.join(config.storePath, 'incoming/');
const privateDir = path.join(config.storePath, 'private/avatars/');
const publicDir = path.join(config.storePath, 'public/avatars/');
const mkdirpAsync = Bluebird.promisify(mkdirp);
const execAsync = Bluebird.promisify(exec);
const emailRegexp = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const getUserByLogin = async function (login) {
    const usObjOnline = session.getOnline({ login });
    const user = usObjOnline ? usObjOnline.user : await User.findOne({ login }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    return { usObjOnline, user };
};

// Serve user
async function giveUser({ login }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    const userObj = session.getOnline({ login });
    const itsMe = iAm.registered && iAm.user.login === login;

    const user = userObj ? session.getPlainUser(userObj.user) : await User.findOne(
        { login, active: true },
        { _id: 0, cid: 0, pass: 0, activatedate: 0, loginAttempts: 0, active: 0, rules: 0 }, { lean: true }
    ).populate([
        {
            path: 'regionHome',
            select: { _id: 0, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 }
        },
        { path: 'regions', select: { _id: 0, cid: 1, title_en: 1, title_local: 1 } },
        { path: 'mod_regions', select: { _id: 0, cid: 1, title_en: 1, title_local: 1 } }
    ]).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    if (itsMe || iAm.isAdmin) {
        user.settings = _.defaults(user.settings || {}, userSettingsDef);
    }

    user.online = Boolean(userObj);

    return { user };
}

// Save changes in user profile
async function saveUser({ login, ...data }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }
    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    // New values of really changing properties
    const newValues = Utils.diff(_.pick(data,
        'firstName', 'lastName', 'birthdate', 'sex', 'country', 'city', 'work',
        'www', 'icq', 'skype', 'aim', 'lj', 'flickr', 'blogger', 'aboutme'
    ), user.toObject());

    if (_.isEmpty(newValues)) {
        return { message: 'Nothing to save' };
    }

    Object.assign(user, newValues);

    if (user.disp && user.disp !== user.login) {
        user.disp = [user.firstName, user.lastName].join(' ').trim() || user.login;
    }

    await user.save();

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline });
    }

    // TODO: return user through 'giveUser'
    return { saved: 1 };
}

// Changes value of specified user setting
async function changeSetting({ login, key, val }) {
    const { socket, handshake: { usObj: iAm } } = this;

    if (!login || !key) {
        throw new BadParamsError();
    }

    const itsMe = iAm.registered && iAm.user.login === login;
    let forbidden = !itsMe && !iAm.isAdmin;

    if (!forbidden) {
        if (key === 'photo_watermark_add_sign') {
            forbidden = Boolean(itsMe && iAm.user.nowaterchange);
        }
    }

    if (forbidden) {
        throw new AuthorizationError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    const defSetting = userSettingsDef[key];
    const vars = userSettingsVars[key];

    // If this setting does not exist or its value is not allowed - throw error
    if (defSetting === undefined || vars === undefined || vars.indexOf(val) < 0) {
        throw new BadParamsError(constantsError.SETTING_DOESNT_EXISTS);
    }

    if (!user.settings) {
        user.settings = {};
    }

    if (user.settings[key] === val) {
        // If the specified setting have not changed, just return
        return { key, val };
    }

    // Saving new setting value and marking settings object as changed, because it has Mixed type
    user.settings[key] = val;
    user.markModified('settings');

    // If throttle value has changed, trying to reschedule next notification time
    if (key === 'subscr_throttle') {
        userThrottleChange(user._id, val);
    }

    await user.save();

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline, excludeSocket: socket });
    }

    return { key, val };
};

// Change displayed name
async function changeDispName({ login, showName }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    if (Boolean(showName)) {
        const f = user.firstName || '';
        const l = user.lastName || '';
        user.disp = (f + (f && l ? ' ' : '') + l) || user.login;
    } else {
        user.disp = user.login;
    }

    await user.save();

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline });
    }

    return { saved: 1, disp: user.disp };
}

// Set watermark custom sign
async function setWatersignCustom({ login, watersign }) {
    const { socket, handshake: { usObj: iAm } } = this;

    const itsMe = iAm.registered && iAm.user.login === login;

    if (itsMe && iAm.user.nowaterchange || !itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }
    if (!login) {
        throw new BadParamsError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    watersign = _.isString(watersign) ? watersign
        .match(constants.photo.watersignPattern).join('')
        .trim().replace(/ {2,}/g, ' ').substr(0, constants.photo.watersignLength) : '';

    let watermarkSetting;

    if (watersign.length) {
        if (watersign !== user.watersignCustom) {
            watermarkSetting = 'custom';
            user.watersignCustom = watersign;
        }
    } else if (user.watersignCustom !== undefined) {
        watermarkSetting = true;
        user.watersignCustom = undefined;
    }

    if (watermarkSetting) {
        if (!user.settings) {
            user.settings = {};
        }

        if (watermarkSetting !== user.settings.photo_watermark_add_sign) {
            user.settings.photo_watermark_add_sign = watermarkSetting;
            user.markModified('settings');
        }

        await user.save();

        if (usObjOnline) {
            session.emitUser({ usObj: usObjOnline, excludeSocket: socket });
        }
    }

    return {
        watersignCustom: user.watersignCustom,
        photo_watermark_add_sign: user.settings && user.settings.photo_watermark_add_sign
    };
};

// Change user's email
async function changeEmail({ login, email, pass }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login || !_.isString(email) || !email) {
        throw new BadParamsError();
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    email = email.toLowerCase();
    if (!email.match(emailRegexp)) {
        throw new InputError(constantsError.MAIL_WRONG);
    }

    const { usObjOnline, user } = await getUserByLogin(login);
    const existsEmailUser = await User.findOne({ email }, { _id: 0, login: 1 }).exec();

    if (existsEmailUser) {
        if (existsEmailUser.login === login) {
            return { email };
        }
        throw new InputError(constantsError.MAIL_IN_USE);
    }

    if (!pass) {
        return { confirm: 'pass' };
    }

    const isMatch = await iAm.user.checkPass(pass);

    if (!isMatch) {
        throw AuthenticationError(constantsError.AUTHENTICATION_PASS_WRONG);
    }

    user.email = email;
    await user.save();

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline });
    }

    return { email: user.email };
}

async function changeAvatar({ login, file, type }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login || !file || !new RegExp('^[a-z0-9]{10}\\.(jpe?g|png)$', '').test(file)) {
        throw new BadParamsError();
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    const fullfile = file.replace(/((.)(.))/, '$2/$3/$1');
    const originPath = path.join(privateDir, fullfile);
    const dirPrefix = fullfile.substr(0, 4);
    const lossless = type === 'image/png';

    await Promise.all([
        // Transfer file from incoming to private
        fs.renameAsync(incomeDir + file, path.normalize(originPath)),
        // Create folders inside public
        mkdirpAsync(path.join(publicDir, 'd/', dirPrefix)),
        mkdirpAsync(path.join(publicDir, 'h/', dirPrefix))
    ]);

    await Promise.all([
        // Copy 100px from private to public/d/
        Utils.copyFile(originPath, publicDir + 'd/' + fullfile),

        // Convert from private into 50px to public/h/
        new Promise((resolve, reject) => {
            gm(originPath).quality(90).filter('Sinc').resize(50, 50).write(publicDir + 'h/' + fullfile, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        }),

        // WebP verions
        execAsync(
            `cwebp -preset photo -m 5 ${lossless ? '-lossless ' : ''}${originPath} -o ${publicDir}d/${fullfile}.webp`
        ),
        execAsync(
            `cwebp -preset photo -m 5 -resize 50 50 ${lossless ? '-lossless ' : ''}${originPath} ` +
            `-o ${publicDir}h/${fullfile}.webp`
        )
    ]);

    const currentAvatar = user.avatar;

    // Assign and save new avatar;
    user.avatar = fullfile;
    await user.save();

    // Remove current avatar if it has been
    if (currentAvatar) {
        fs.unlink(path.join(privateDir, currentAvatar), _.noop);
        fs.unlink(path.join(publicDir, 'd', currentAvatar), _.noop);
        fs.unlink(path.join(publicDir, 'd', currentAvatar + '.webp'), _.noop);
        fs.unlink(path.join(publicDir, 'h', currentAvatar), _.noop);
        fs.unlink(path.join(publicDir, 'h', currentAvatar + '.webp'), _.noop);
    }

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline });
    }

    return { avatar: user.avatar };
}

// Remove avatar
async function delAvatar({ login }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    const currentAvatar = user.avatar;

    if (currentAvatar) {
        fs.unlink(path.join(privateDir, currentAvatar), _.noop);
        fs.unlink(path.join(publicDir, 'd', currentAvatar), _.noop);
        fs.unlink(path.join(publicDir, 'd', currentAvatar + '.webp'), _.noop);
        fs.unlink(path.join(publicDir, 'h', currentAvatar), _.noop);
        fs.unlink(path.join(publicDir, 'h', currentAvatar + '.webp'), _.noop);

        user.avatar = undefined;
        await user.save();

        if (usObjOnline) {
            session.emitUser({ usObj: usObjOnline });
        }
    }

    return { message: 'ok' };
}

// Change (by administrator) user ability to change his watersign setting
async function setUserWatermarkChange({ login, nowaterchange }) {
    const { socket, handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }
    if (!login) {
        throw new BadParamsError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    let changed;
    if (nowaterchange) {
        if (!user.nowaterchange) {
            user.nowaterchange = changed = true;
        }
    } else if (user.nowaterchange !== undefined) {
        user.nowaterchange = undefined;
        changed = true;
    }

    if (changed) {
        await user.save();

        if (usObjOnline) {
            session.emitUser({ usObj: usObjOnline, excludeSocket: socket });
        }
    }

    return { nowaterchange: user.nowaterchange };
};

// Save user ranks
async function saveUserRanks({ login, ranks }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login || !Array.isArray(ranks)) {
        throw new BadParamsError();
    }

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    // Check that all values are allowed
    for (const rank of ranks) {
        if (!userRanksHash[rank]) {
            throw new BadParamsError();
        }
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    user.ranks = ranks.length ? ranks : undefined;

    await user.save();

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline });
    }

    return { saved: true, ranks: user.ranks || [] };
}

async function giveUserRules({ login }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const { user } = await getUserByLogin(login);

    return { rules: user.rules || {}, info: { canPhotoNew: photoController.getNewPhotosLimit(user) } };
}

async function saveUserRules({ login, rules }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login || !rules) {
        throw new BadParamsError();
    }

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    if (!user.rules) {
        user.rules = {};
    }

    if (rules.photoNewLimit !== undefined) {
        if (_.isNumber(rules.photoNewLimit)) {
            user.rules.photoNewLimit = Math.min(
                Math.max(0, rules.photoNewLimit), photoController.maxNewPhotosLimit
            );
        } else {
            delete user.rules.photoNewLimit;
        }
    }

    // If rules is empty - remove it
    if (!Object.keys(user.rules).length) {
        user.rules = undefined;
    }

    user.markModified('rules');

    await user.save();

    if (usObjOnline) {
        session.emitUser({ usObj: usObjOnline });
    }

    return {
        saved: true,
        rules: user.rules,
        info: { canPhotoNew: photoController.getNewPhotosLimit(user) }
    };
}

giveUser.isPublic = true;
saveUser.isPublic = true;
changeDispName.isPublic = true;
changeSetting.isPublic = true;
setWatersignCustom.isPublic = true;
setUserWatermarkChange.isPublic = true;
changeEmail.isPublic = true;
changeAvatar.isPublic = true;
delAvatar.isPublic = true;
saveUserRanks.isPublic = true;
giveUserRules.isPublic = true;
saveUserRules.isPublic = true;
export default {
    giveUser,
    saveUser,
    changeDispName,
    changeSetting,
    setWatersignCustom,
    setUserWatermarkChange,
    changeEmail,
    changeAvatar,
    delAvatar,
    saveUserRanks,
    giveUserRules,
    saveUserRules
};