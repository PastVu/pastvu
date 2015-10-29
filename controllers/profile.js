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
import { userSettingsDef, userSettingsVars, userRanksHash } from './settings';

import { User } from '../models/User';

const incomeDir = path.join(config.storePath, 'incoming/');
const privateDir = path.join(config.storePath, 'private/avatars/');
const publicDir = path.join(config.storePath, 'public/avatars/');
const mkdirpAsync = Bluebird.promisify(mkdirp);
const execAsync = Bluebird.promisify(exec);
const msg = {
    badParams: 'Bad params',
    deny: 'You do not have permission for this action',

    nouser: 'Requested user does not exist',
    nosetting: 'Such setting does not exists'
};

const getUserByLogin = async function (login) {
    const usObjOnline = session.getOnline(login);
    const user = usObjOnline ? usObjOnline.user : await User.findOne({ login }).exec();

    if (!user) {
        throw { message: msg.nouser };
    }

    return { usObjOnline, user };
};

// Serve user
async function giveUser(iAm, { login } = {}) {
    if (!login) {
        throw { message: msg.badParams };
    }

    const userObj = session.getOnline(login);
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
        throw { message: msg.nouser };
    }

    if (itsMe || iAm.isAdmin) {
        user.settings = _.defaults(user.settings || {}, userSettingsDef);
    }

    user.online = Boolean(userObj);

    return { user };
}

// Save changes in user profile
async function saveUser(iAm, { login, ...data } = {}) {
    if (!login) {
        throw { message: msg.badParams };
    }
    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw { message: msg.deny };
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
        user.disp = [user.firstName, user.lastName].join(' ').trim() || undefined;
    }

    await user.save();

    if (usObjOnline) {
        session.emitUser(usObjOnline);
    }

    return { saved: 1 };
}

// Changes value of specified user setting
async function changeSetting(socket, { login, key, val } = {}) {
    if (!login || !key) {
        throw { message: msg.badParams };
    }

    const iAm = socket.handshake.usObj;
    const itsMe = iAm.registered && iAm.user.login === login;
    let forbidden = !itsMe && !iAm.isAdmin;

    if (!forbidden) {
        if (key === 'photo_watermark_add_sign') {
            forbidden = Boolean(itsMe && iAm.user.nowaterchange);
        }
    }

    if (forbidden) {
        throw { message: msg.deny };
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    const defSetting = userSettingsDef[key];
    const vars = userSettingsVars[key];

    // If this setting does not exist or its value is not allowed - throw error
    if (defSetting === undefined || vars === undefined || vars.indexOf(val) < 0) {
        throw { message: msg.nosetting };
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
        session.emitUser(usObjOnline, null, socket);
    }

    return { key, val };
};

// Change displayed name
async function changeDispName(iAm, { login, showName } = {}) {
    if (!login) {
        throw { message: msg.badParams };
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
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
        session.emitUser(usObjOnline);
    }

    return { saved: 1, disp: user.disp };
}

// Set watermark custom sign
async function setWatersignCustom(socket, { login, watersign }) {
    const iAm = socket.handshake.usObj;
    const itsMe = iAm.registered && iAm.user.login === login;

    if (itsMe && iAm.user.nowaterchange || !itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!login) {
        throw { message: msg.badParams };
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
            session.emitUser(usObjOnline, null, socket);
        }
    }

    return {
        watersignCustom: user.watersignCustom,
        photo_watermark_add_sign: user.settings && user.settings.photo_watermark_add_sign
    };
};

// Change user's email
async function changeEmail(iAm, { login, email, pass } = {}) {
    if (!login || !_.isString(email) || !email) {
        throw { message: msg.badParams };
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
    }

    email = email.toLowerCase();
    if (!email.match(/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)) {
        throw { message: 'Wrong email, check it one more time' };
    }

    const { usObjOnline, user } = await getUserByLogin(login);
    const existsEmailUser = await User.findOne({ email }, { _id: 0, login: 1 }).exec();

    if (existsEmailUser) {
        if (existsEmailUser.login === login) {
            return { email };
        }
        throw { message: 'This email already in use by another user' };
    }

    if (!pass) {
        return { confirm: 'pass' };
    }

    const isMatch = await iAm.user.checkPass(pass);

    if (!isMatch) {
        throw { message: 'Wrong password' };
    }

    user.email = email;
    await user.save();

    if (usObjOnline) {
        session.emitUser(usObjOnline);
    }

    return { email: user.email };
}

async function changeAvatar(iAm, { login, file, type } = {}) {
    if (!login || !file || !new RegExp('^[a-z0-9]{10}\\.(jpe?g|png)$', '').test(file)) {
        throw { message: msg.badParams };
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    const fullfile = file.replace(/((.)(.))/, '$2/$3/$1');
    const originPath = path.join(privateDir, fullfile);
    const dirPrefix = fullfile.substr(0, 4);
    const lossless = type === 'image/png';

    await* [
        // Transfer file from incoming to private
        fs.renameAsync(incomeDir + file, path.normalize(originPath)),
        // Create folders inside public
        mkdirpAsync(path.join(publicDir, 'd/', dirPrefix)),
        mkdirpAsync(path.join(publicDir, 'h/', dirPrefix))
    ];

    await* [
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
    ];

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
        session.emitUser(usObjOnline);
    }

    return { avatar: user.avatar };
}

// Remove avatar
async function delAvatar(iAm, { login } = {}) {
    if (!login) {
        throw { message: msg.badParams };
    }

    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
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
            session.emitUser(usObjOnline);
        }
    }

    return { message: 'ok' };
}

// Change (by administrator) user ability to change his watersign setting
async function setUserWatermarkChange(socket, { login, nowaterchange } = {}) {
    const iAm = socket.handshake.usObj;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!login) {
        throw { message: msg.badParams };
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
            session.emitUser(usObjOnline, null, socket);
        }
    }

    return { nowaterchange: user.nowaterchange };
};

// Save user ranks
async function saveUserRanks(iAm, { login, ranks } = {}) {
    if (!login || !Array.isArray(ranks)) {
        throw { message: msg.badParams};
    }

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    // Check that all values are allowed
    for (const rank of ranks) {
        if (!userRanksHash[rank]) {
            throw { message: msg.badParams };
        }
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    user.ranks = ranks.length ? ranks : undefined;

    await user.save();

    if (usObjOnline) {
        session.emitUser(usObjOnline);
    }

    return { saved: true, ranks: user.ranks || [] };
}

async function giveUserRules(iAm, { login } = {}) {
    if (!login) {
        throw { message: msg.badParams};
    }

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    const { user } = await getUserByLogin(login);

    return { rules: user.rules || {}, info: { canPhotoNew: photoController.core.getNewPhotosLimit(user) } };
}

async function saveUserRules(iAm, { login, rules } = {}) {
    if (!login || !rules) {
        throw { message: msg.badParams};
    }

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    const { usObjOnline, user } = await getUserByLogin(login);

    if (!user.rules) {
        user.rules = {};
    }

    if (rules.photoNewLimit !== undefined) {
        if (_.isNumber(rules.photoNewLimit)) {
            user.rules.photoNewLimit = Math.min(
                Math.max(0, rules.photoNewLimit), photoController.core.maxNewPhotosLimit
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
        session.emitUser(usObjOnline);
    }

    return {
        saved: true,
        rules: user.rules,
        info: { canPhotoNew: photoController.core.getNewPhotosLimit(user) }
    };
}

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('giveUser', function (data) {
            giveUser(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUser', resultData);
                });
        });

        socket.on('saveUser', function (data) {
            saveUser(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveUserResult', resultData);
                });
        });

        socket.on('changeDispName', function (data) {
            changeDispName(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('changeDispNameResult', resultData);
                });
        });

        socket.on('changeUserSetting', function (data) {
            changeSetting(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('changeUserSettingResult', resultData);
                });
        });
        socket.on('setWatersignCustom', function (data) {
            setWatersignCustom(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('setWatersignCustomResult', resultData);
                });
        });
        socket.on('setUserWatermarkChange', function (data) {
            setUserWatermarkChange(socket, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('setUserWatermarkChangeResult', resultData);
                });
        });
        socket.on('changeEmail', function (data) {
            changeEmail(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('changeEmailResult', resultData);
                });
        });

        socket.on('changeAvatar', function (data) {
            changeAvatar(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('changeAvatarResult', resultData);
                });
        });
        socket.on('delAvatar', function (data) {
            delAvatar(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('delAvatarResult', resultData);
                });
        });

        socket.on('saveUserRanks', function (data) {
            saveUserRanks(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveUserRanksResult', resultData);
                });
        });

        socket.on('giveUserRules', function (data) {
            giveUserRules(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserRules', resultData);
                });
        });

        socket.on('saveUserRules', function (data) {
            saveUserRules(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveUserRulesResult', resultData);
                });
        });
    });
};