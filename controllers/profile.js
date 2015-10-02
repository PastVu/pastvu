var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var exec = require('child_process').exec;
var Bluebird = require('bluebird');
var gm = require('gm');
var _session = require('./_session.js');
var settings = require('./settings.js');
var photoController = require('./photo.js');
var User;
var Utils = require('../commons/Utils.js');
var step = require('step');
var log4js = require('log4js');
var _ = require('lodash');
var constants = require('./constants.js');
var logger;
var incomeDir = global.appVar.storePath + 'incoming/';
var privateDir = global.appVar.storePath + 'private/avatars/';
var publicDir = global.appVar.storePath + 'public/avatars/';
var msg = {
    badParams: 'Bad params',
    deny: 'У вас нет прав на это действие',
    nouser: 'Requested user does not exist',
    nosetting: 'Such setting does not exists'
};
var subscrController = require('./subscr.js');

//Отдаем пользователя
function giveUser(iAm, data, cb) {
    var login = data && data.login,
        itsMe = iAm.registered && iAm.user.login === login,
        itsOnline = false;

    if (!_.isObject(data) || !login) {
        return cb({ message: msg.badParams, error: true });
    }

    step(
        function () {
            var userObj = _session.getOnline(login);
            if (userObj) {
                itsOnline = true;
                this(null, _session.getPlainUser(userObj.user));
            } else {
                User.findOne({ login: login, active: true }, {
                    _id: 0,
                    cid: 0,
                    pass: 0,
                    activatedate: 0,
                    loginAttempts: 0,
                    active: 0,
                    rules: 0
                }, { lean: true })
                    .populate([
                        {
                            path: 'regionHome',
                            select: { _id: 0, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 }
                        },
                        { path: 'regions', select: { _id: 0, cid: 1, title_en: 1, title_local: 1 } },
                        { path: 'mod_regions', select: { _id: 0, cid: 1, title_en: 1, title_local: 1 } }
                    ])
                    .exec(this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }
            if (itsMe || iAm.isAdmin) {
                user.settings = _.defaults(user.settings || {}, settings.getUserSettingsDef());
            }
            user.online = itsOnline;
            cb({ message: 'ok', user: user });
        }
    );
}

//Сохраняем изменения в профиле пользователя
function saveUser(iAm, data, cb) {
    var login = data && data.login,
        userObjOnline,
        itsMe,
        newValues;

    if (!iAm.registered) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !login) {
        return cb({ message: msg.badParams, error: true });
    }
    itsMe = iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }

    step(
        function () {
            userObjOnline = _session.getOnline(login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: login }, this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }

            //Новые значения действительно изменяемых свойств
            newValues = Utils.diff(_.pick(data, 'firstName', 'lastName', 'birthdate', 'sex', 'country', 'city', 'work', 'www', 'icq', 'skype', 'aim', 'lj', 'flickr', 'blogger', 'aboutme'), user.toObject());
            if (_.isEmpty(newValues)) {
                return cb({ message: 'Nothing to save' });
            }
            if (user.disp && user.disp !== user.login && (newValues.firstName || newValues.lastName)) {
                var f = newValues.firstName || user.firstName || '',
                    l = newValues.lastName || user.lastName || '';

                user.disp = f + (f && l ? ' ' : '') + l;
            }

            _.assign(user, newValues);
            user.save(this);
        },
        function (err, user) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            if (userObjOnline) {
                _session.emitUser(userObjOnline);
            }

            cb({ message: 'ok', saved: 1 });
        }
    );
}

// Changes value of specified user setting
var changeSetting = Bluebird.method(function (socket, data) {
    if (!_.isObject(data) || !data.login || !data.key) {
        throw { message: msg.badParams };
    }

    var key = data.key;
    var login = data.login;
    var iAm = socket.handshake.usObj;
    var itsMe = iAm.registered && iAm.user.login === login;
    var forbidden = !itsMe && !iAm.isAdmin;

    if (!forbidden) {
        if (key === 'photo_watermark_add_sign') {
            forbidden = Boolean(itsMe && iAm.user.nowaterchange);
        }
    }

    if (forbidden) {
        throw { message: msg.deny };
    }

    var userObjOnline = _session.getOnline(login);

    return (userObjOnline ? Bluebird.resolve(userObjOnline.user) : User.findOneAsync({ login: login }))
        .then(function (user) {
            if (!user) {
                throw { message: msg.nouser };
            }
            var defSetting = settings.getUserSettingsDef()[data.key];
            var vars = settings.getUserSettingsVars()[data.key];

            // If this setting does not exist or its value is not allowed - throw error
            if (defSetting === undefined || vars === undefined || vars.indexOf(data.val) < 0) {
                throw { message: msg.nosetting };
            }

            if (!user.settings) {
                user.settings = {};
            }

            if (user.settings[data.key] === data.val) {
                // If the specified setting have not changed, just return
                return user;
            } else {
                // Saving new setting value and marking settings object as changed, because it has Mixed type
                user.settings[data.key] = data.val;
                user.markModified('settings');

                if (data.key === 'subscr_throttle') {
                    // If throttle value has changed, trying to reschedule next notification time
                    subscrController.userThrottleChange(user._id, data.val);
                }

                return user.saveAsync().spread(function (user) {
                    if (userObjOnline) {
                        _session.emitUser(userObjOnline, null, socket);
                    }

                    return user;
                });
            }
        })
        .then(function (user) {
            return { key: data.key, val: user.settings[data.key] };
        });
});

// Меняем отображаемое имя
function changeDispName(iAm, data, cb) {
    var login = data && data.login;
    var itsMe = iAm.registered && iAm.user.login === login;
    var userObjOnline;

    if (!itsMe && !iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !login) {
        return cb({ message: msg.badParams, error: true });
    }

    step(
        function () {
            userObjOnline = _session.getOnline(login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: login }, this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }

            if (!!data.showName) {
                var f = user.firstName || '',
                    l = user.lastName || '';
                user.disp = (f + (f && l ? ' ' : '') + l) || user.login;
            } else {
                user.disp = user.login;
            }

            user.save(this);
        },
        function (err, user) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            if (userObjOnline) {
                _session.emitUser(userObjOnline);
            }
            cb({ message: 'ok', saved: 1, disp: user.disp });
        }
    );
}

// Set watermark custom sign
var setWatersignCustom = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;
    var login = data && data.login;
    var itsMe = iAm.registered && iAm.user.login === login;

    if (itsMe && iAm.user.nowaterchange || !itsMe && !iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data) || !login) {
        throw { message: msg.badParams };
    }

    var userObjOnline = _session.getOnline(login);
    var watersign = _.isString(data.watersign) ? data.watersign
        .match(constants.photo.watersignPattern).join('')
        .trim().replace(/ {2,}/g, ' ').substr(0, constants.photo.watersignLength) : '';

    return (userObjOnline ? Bluebird.resolve(userObjOnline.user) : User.findOneAsync({ login: login }))
        .then(function (user) {
            var watermarkSetting;

            if (watersign.length) {
                if (watersign === user.watersignCustom) {
                    return user;
                }
                watermarkSetting = 'custom';
                user.watersignCustom = watersign;
            } else if (user.watersignCustom !== undefined) {
                watermarkSetting = true;
                user.watersignCustom = undefined;
            }

            if (!user.settings) {
                user.settings = {};
            }

            if (watermarkSetting !== user.settings.photo_watermark_add_sign) {
                user.settings.photo_watermark_add_sign = watermarkSetting;
                user.markModified('settings');
            }

            return user.saveAsync().spread(function (user) {
                if (userObjOnline) {
                    _session.emitUser(userObjOnline, null, socket);
                }

                return user;
            });
        })
        .then(function (user) {
            return {
                watersignCustom: user.watersignCustom,
                photo_watermark_add_sign: user.settings && user.settings.photo_watermark_add_sign
            };
        });
});

// Меняем email
function changeEmail(iAm, data, cb) {
    var user,
        login = data && data.login,
        itsMe = iAm.registered && iAm.user.login === login,
        userObjOnline;

    if (!itsMe && !iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !login || !data.email) {
        return cb({ message: msg.badParams, error: true });
    }
    data.email = data.email.toLowerCase();
    if (!data.email.match(/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)) {
        return cb({ message: 'Недействительный email. Проверьте корректность ввода.', error: true });
    }

    step(
        function () {
            userObjOnline = _session.getOnline(login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: login }, this);
            }
        },
        function (err, u) {
            if (err || !u) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }
            user = u;
            User.findOne({ email: data.email }, { _id: 0, login: 1 }, this);
        },
        function (err, u) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            if (u && u.login !== user.login) {
                return cb({ message: 'Такой email уже используется другим пользователем', error: true });
            }

            if (data.pass) {
                iAm.user.checkPass(data.pass, function (err, isMatch) {
                    if (err) {
                        return cb({ message: err.message, error: true });
                    }
                    if (isMatch) {
                        saveEmail();
                    } else {
                        cb({ message: 'Неверный пароль', error: true });
                    }
                });
            } else {
                cb({ confirm: 'pass' });
            }
        }
    );

    function saveEmail() {
        user.email = data.email;
        user.save(function (err, savedUser) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            if (userObjOnline) {
                _session.emitUser(userObjOnline);
            }
            cb({ message: 'ok', email: savedUser.email });
        });
    }
}

function changeAvatar(iAm, data, cb) {
    var user,
        login = data && data.login,
        itsMe = iAm.registered && iAm.user.login === login,
        userObjOnline,
        file,
        fullfile;

    if (!itsMe && !iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !login || !data.file || !new RegExp('^[a-z0-9]{10}\\.(jpe?g|png)$', '').test(data.file)) {
        return cb({ message: msg.badParams, error: true });
    }

    file = data.file;
    fullfile = file.replace(/((.)(.))/, '$2/$3/$1');
    var originPath = path.join(privateDir, fullfile);
    var lossless = data.type === 'image/png';

    step(
        function () {
            userObjOnline = _session.getOnline(login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: login }, this);
            }
        },
        function (err, u) {
            if (err || !u) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }
            var dirPrefix = fullfile.substr(0, 4);
            user = u;

            // Transfer file from incoming to private
            fs.rename(incomeDir + file, path.normalize(originPath), this.parallel());

            // Create folders inside public
            mkdirp(path.normalize(publicDir + 'd/' + dirPrefix), null, this.parallel());
            mkdirp(path.normalize(publicDir + 'h/' + dirPrefix), null, this.parallel());
        },
        function (err) {
            if (err) {
                return cb({ message: err.message, error: true });
            }

            // Копирование 100px из private в public/d/
            Utils.copyFile(originPath, publicDir + 'd/' + fullfile, this.parallel());
            exec(
                'cwebp -preset photo -m 5 ' + (lossless ? '-lossless ': '') + originPath + ' -o ' + publicDir + 'd/' + fullfile + '.webp',
                null, this.parallel()
            );

            // Конвертация в 50px из private в public/h/
            gm(originPath)
                .quality(90)
                .filter('Sinc')
                .resize(50, 50)
                .write(publicDir + 'h/' + fullfile, this.parallel());

            exec(
                'cwebp -preset photo -m 5 -resize 50 50 ' + (lossless ? '-lossless ': '') + originPath + ' -o ' + publicDir + 'h/' + fullfile + '.webp',
                null, this.parallel()
            );
        },
        function (err) {
            if (err) {
                return cb({ message: err.message, error: true });
            }

            //Удаляем текущий аватар, если он был
            var currentAvatar = user.avatar;
            if (currentAvatar) {
                fs.unlink(path.normalize(privateDir + currentAvatar), _.noop);
                fs.unlink(path.normalize(publicDir + 'd/' + currentAvatar), _.noop);
                fs.unlink(path.normalize(publicDir + 'h/' + currentAvatar), _.noop);
            }

            //Присваиваем и сохраняем новый аватар
            user.avatar = fullfile;
            user.save(this);
        },
        function (err) {
            if (err) {
                return cb({ message: err.message, error: true });
            }
            if (userObjOnline) {
                _session.emitUser(userObjOnline);
            }
            cb({ message: 'ok', avatar: user.avatar });
        }
    );
}

//Удаляем аватар
function delAvatar(iAm, data, cb) {
    var login = data && data.login,
        itsMe = iAm.registered && iAm.user.login === login,
        userObjOnline;

    if (!itsMe && !iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !login) {
        return cb({ message: msg.badParams, error: true });
    }

    step(
        function () {
            userObjOnline = _session.getOnline(login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: login }, this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }

            //Удаляем текущий аватар, если он был
            var currentAvatar = user.avatar;
            if (currentAvatar) {
                fs.unlink(path.normalize(privateDir + currentAvatar), _.noop);
                fs.unlink(path.normalize(publicDir + 'd/' + currentAvatar), _.noop);
                fs.unlink(path.normalize(publicDir + 'h/' + currentAvatar), _.noop);

                user.avatar = undefined;
                user.save(function (err) {
                    if (err) {
                        return cb({ message: err.message, error: true });
                    }
                    if (userObjOnline) {
                        _session.emitUser(userObjOnline);
                    }
                    cb({ message: 'ok' });
                });
            } else {
                cb({ message: 'ok' });
            }
        }
    );
}

// Change (by administrator) user ability to change his watersign setting
var setUserWatermarkChange = Bluebird.method(function (socket, data) {
    var iAm = socket.handshake.usObj;
    var login = data && data.login;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data) || !login) {
        throw { message: msg.badParams };
    }

    var userObjOnline = _session.getOnline(login);

    return (userObjOnline ? Bluebird.resolve(userObjOnline.user) : User.findOneAsync({ login: login }))
        .then(function (user) {
            if (data.nowaterchange) {
                if (user.nowaterchange) {
                    return user;
                }
                user.nowaterchange = true;
            } else if (user.nowaterchange !== undefined) {
                user.nowaterchange = undefined;
            }

            return user.saveAsync().spread(function (user) {
                if (userObjOnline) {
                    _session.emitUser(userObjOnline, null, socket);
                }

                return user;
            });
        })
        .then(function (user) {
            return { nowaterchange: user.nowaterchange };
        });
});

// Сохраняем ранки пользователя
function saveUserRanks(iAm, data, cb) {
    var login = data && data.login,
        userObjOnline,
        ranksHash,
        i;

    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }

    if (!_.isObject(data) || !login || !Array.isArray(data.ranks)) {
        return cb({ message: msg.badParams, error: true });
    }

    //Проверяем, чтобы не было несуществующих званий
    ranksHash = settings.getUserRanksHash();
    for (i = data.ranks; i--;) {
        if (!ranksHash[data.ranks[i]]) {
            return cb({ message: msg.badParams, error: true });
        }
    }

    step(
        function () {
            userObjOnline = _session.getOnline(login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: login }, this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }
            if (data.ranks.length) {
                user.ranks = data.ranks;
            } else {
                user.ranks = undefined;
            }
            user.save(function (err, savedUser) {
                if (err) {
                    return cb({ message: err.message, error: true });
                }
                if (userObjOnline) {
                    _session.emitUser(userObjOnline);
                }
                cb({ message: 'ok', saved: true, ranks: user.ranks || [] });
            });
        }
    );
}

function giveUserRules(iAm, data, cb) {
    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !data.login) {
        return cb({ message: msg.badParams, error: true });
    }

    step(
        function () {
            var userObj = _session.getOnline(data.login);
            if (userObj) {
                this(null, userObj.user);
            } else {
                User.findOne({ login: data.login }, this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }
            cb({ rules: user.rules || {}, info: { canPhotoNew: photoController.core.getNewPhotosLimit(user) } });
        }
    );
}
function saveUserRules(iAm, data, cb) {
    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }
    if (!_.isObject(data) || !data.login || !data.rules) {
        return cb({ message: msg.badParams, error: true });
    }

    var userObjOnline;

    step(
        function () {
            userObjOnline = _session.getOnline(data.login);
            if (userObjOnline) {
                this(null, userObjOnline.user);
            } else {
                User.findOne({ login: data.login }, this);
            }
        },
        function (err, user) {
            if (err || !user) {
                return cb({ message: err && err.message || msg.nouser, error: true });
            }
            var rules = data.rules;

            if (!user.rules) {
                user.rules = {};
            }

            if (rules.photoNewLimit !== undefined) {
                if (_.isNumber(rules.photoNewLimit)) {
                    user.rules.photoNewLimit = Math.min(Math.max(0, rules.photoNewLimit), photoController.core.maxNewPhotosLimit);
                } else {
                    delete user.rules.photoNewLimit;
                }
            }

            //Если правил для пользователя нет, удаляем этот объет у пользователя
            if (!Object.keys(user.rules).length) {
                user.rules = undefined;
            }
            //Помечаем поле правил изменившимся
            user.markModified('rules');

            user.save(function (err, savedUser) {
                if (err) {
                    return cb({ message: err.message, error: true });
                }
                if (userObjOnline) {
                    _session.emitUser(userObjOnline);
                }
                cb({
                    message: 'ok',
                    saved: true,
                    rules: savedUser.rules,
                    info: { canPhotoNew: photoController.core.getNewPhotosLimit(savedUser) }
                });
            });
        }
    );
}

module.exports.loadController = function (app, db, io) {
    logger = log4js.getLogger('profile.js');

    User = db.model('User');

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        socket.on('giveUser', function (data) {
            giveUser(hs.usObj, data, function (result) {
                socket.emit('takeUser', result);
            });
        });

        socket.on('saveUser', function (data) {
            saveUser(hs.usObj, data, function (resultData) {
                socket.emit('saveUserResult', resultData);
            });
        });

        socket.on('changeDispName', function (data) {
            changeDispName(hs.usObj, data, function (resultData) {
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
            changeEmail(hs.usObj, data, function (resultData) {
                socket.emit('changeEmailResult', resultData);
            });
        });

        socket.on('changeAvatar', function (data) {
            changeAvatar(hs.usObj, data, function (resultData) {
                socket.emit('changeAvatarResult', resultData);
            });
        });
        socket.on('delAvatar', function (data) {
            delAvatar(hs.usObj, data, function (resultData) {
                socket.emit('delAvatarResult', resultData);
            });
        });

        socket.on('saveUserRanks', function (data) {
            saveUserRanks(hs.usObj, data, function (result) {
                socket.emit('saveUserRanksResult', result);
            });
        });

        socket.on('giveUserRules', function (data) {
            giveUserRules(hs.usObj, data, function (result) {
                socket.emit('takeUserRules', result);
            });
        });

        socket.on('saveUserRules', function (data) {
            saveUserRules(hs.usObj, data, function (result) {
                socket.emit('saveUserRulesResult', result);
            });
        });
    });

};