import ms from 'ms';
import bcrypt from 'bcrypt';
import Bluebird from 'bluebird';
import { Schema } from 'mongoose';
import { registerModel } from '../controllers/connection';

const SALT_SEED = 20;
const SALT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 10;
const LOCK_TIME = ms('2m');

const sexes = ['m', 'f'];

export let User = null;
export let UserConfirm = null;
export const AnonymScheme = {
    settings: { type: Schema.Types.Mixed },
    regionHome: { type: Schema.Types.ObjectId, ref: 'Region' }, // Home region
    regions: [ // Regions for default filtering of content
        { type: Schema.Types.ObjectId, ref: 'Region' }
    ]
};

registerModel(db => {
    const UserScheme = new Schema({
        cid: { type: Number, required: true, index: { unique: true } },
        login: { type: String, required: true, index: { unique: true } },
        email: {
            type: String,
            required: true,
            index: { unique: true },
            lowercase: true,
            validate: [/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, 'incorrect email']
        },

        pass: { type: String, required: true },
        loginAttempts: { type: Number, required: true, 'default': 0 },
        lockUntil: { type: Number },

        settings: { type: Schema.Types.Mixed },
        rules: { type: Schema.Types.Mixed }, // Rules(settings), defined by the administrator
        role: { type: Number }, // 11 - owner, 10 - admin, 5 - moderator, undefined - regular
        ranks: [String],

        regionHome: { type: Schema.Types.ObjectId, ref: 'Region' }, // Home region
        regions: [ // Regions for default filtering of content
            { type: Schema.Types.ObjectId, ref: 'Region' }
        ],
        mod_regions: [ // Regions in which user is moderator
            { type: Schema.Types.ObjectId, ref: 'Region' }
        ],

        watersignCustom: { type: String }, // User custom text on watermark

        // Profile
        avatar: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        disp: { type: String }, // Display name

        birthdate: { type: String },
        sex: { type: String },
        country: { type: String },
        city: { type: String },
        work: { type: String },
        www: { type: String },
        icq: { type: String },
        skype: { type: String },
        aim: { type: String },
        lj: { type: String },
        flickr: { type: String },
        blogger: { type: String },
        aboutme: { type: String },

        regdate: { type: Date, 'default': Date.now },
        pcount: { type: Number, 'default': 0, index: true }, // Number of public photos
        pfcount: { type: Number, 'default': 0 }, // Number of unconfirmed photos
        pdcount: { type: Number, 'default': 0 }, // Number of deleted photos
        bcount: { type: Number, 'default': 0 }, // Number of public blogs
        ccount: { type: Number, 'default': 0, index: true }, // Number of public comments

        dateFormat: { type: String, 'default': 'dd.mm.yyyy' },
        active: { type: Boolean, 'default': false },
        activatedate: { type: Date },

        nowaterchange: { type: Boolean } // Prohibit user to change his own default watersign setting and watersign of his own photos
    });

    // Before every save generate hash and salt with Blowfish, if password changed
    UserScheme.pre('save', function (next) {
        const user = this;

        // only hash the password if it has been modified (or is new)
        if (!this.isModified('pass')) {
            return next();
        }

        // Generate a salt
        bcrypt.genSalt(SALT_ROUNDS, SALT_SEED, function (err, salt) {
            if (err) {
                return next(err);
            }

            // Hash the password along with our new salt
            bcrypt.hash(user.pass, salt, function (err, hash) {
                if (err) {
                    return next(err);
                }

                // Override the cleartext password with the hashed one
                user.pass = hash;
                next();
            });
        });
    });

    // Checks if pass is right for current user
    UserScheme.methods.checkPass = function (candidatePassword, cb) {
        return new Bluebird((resolve, reject) => {
            bcrypt.compare(candidatePassword, this.pass, (err, isMatch) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(isMatch);
                }
            });
        }).nodeify(cb);
    };

    UserScheme.virtual('isLocked').get(function () {
        // Check for a future lockUntil timestamp
        return !!(this.lockUntil && this.lockUntil > Date.now());
    });

    UserScheme.methods.incLoginAttempts = function (cb) {
        // If we have a previous lock that has expired, restart at 1
        if (this.lockUntil && this.lockUntil < Date.now()) {
            return this.update({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } }, cb);
        }
        // Otherwise we're incrementing
        const updates = { $inc: { loginAttempts: 1 } };
        // Lock the account if we've reached max attempts and it's not locked already
        if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
            updates.$set = { lockUntil: Date.now() + LOCK_TIME };
        }
        return this.update(updates, cb);
    };

    // Failed Login Reasons
    const reasons = UserScheme.statics.failedLogin = {
        NOT_FOUND: 0,
        PASSWORD_INCORRECT: 1,
        MAX_ATTEMPTS: 2
    };

    UserScheme.statics.getAuthenticated = function (login, password, cb) {
        this.findOne({
            $or: [
                { login: new RegExp('^' + login + '$', 'i') },
                { email: login.toLowerCase() }
            ], active: true, pass: { $ne: 'init' }
        }, function (err, user) {
            if (err) {
                return cb(err);
            }

            // make sure the user exists
            if (!user) {
                return cb(null, null, reasons.NOT_FOUND);
            }

            // check if the account is currently locked
            if (user.isLocked) {
                // just increment login attempts if account is already locked
                return user.incLoginAttempts(function (err) {
                    if (err) {
                        return cb(err);
                    }
                    cb(null, null, reasons.MAX_ATTEMPTS);
                });
            }

            // test for a matching password
            user.checkPass(password, function (err, isMatch) {
                if (err) {
                    return cb(err);
                }

                if (isMatch) {
                    // if there's no lock or failed attempts, just return the user
                    if (!user.loginAttempts && !user.lockUntil) {
                        return cb(null, user);
                    }
                    // reset attempts and lock info
                    user.update({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } }, function (err) {
                        if (err) {
                            return cb(err);
                        }
                        cb(null, user);
                    });
                } else {
                    // password is incorrect, so increment login attempts before responding
                    user.incLoginAttempts(function (err) {
                        if (err) {
                            return cb(err);
                        }
                        cb(null, null, reasons.PASSWORD_INCORRECT);
                    });
                }
            });
        });
    };

    UserScheme.path('sex').validate(function (sex) {
        return sexes.indexOf(sex) !== -1;
    }, 'Incorrect sex');

    UserScheme.path('pass').set(function (pass) {
        pass = pass.toString();
        if (pass.length === 0) {
            return this.pass;
        }
        return pass;
    });

    UserScheme.statics.getUserPublic = function (login, cb) {
        if (!login) {
            cb(null, 'Login is not specified');
        }
        this.findOne({ login: new RegExp('^' + login + '$', 'i'), active: true }).select({
            _id: 0,
            pass: 0,
            activatedate: 0,
            rules: 0
        }).exec(cb);
    };

    UserScheme.statics.getAllPublicUsers = function (cb) {
        this.find({ active: true }).select({ _id: 0, pass: 0, activatedate: 0, rules: 0 }).exec(cb);
    };

    UserScheme.statics.getUserAll = function (login, cb) {
        if (!login) {
            cb(null, 'Login is not specified');
        }
        this.findOne({ login: new RegExp('^' + login + '$', 'i'), active: true }).exec(cb);
    };

    UserScheme.statics.getUserAllLoginMail = function (login, cb) {
        if (!login) {
            cb(null, 'Login is not specified');
        }
        this.findOne({
            $and: [
                {
                    $or: [
                        { login: new RegExp('^' + login + '$', 'i') },
                        { email: login.toLowerCase() }
                    ]
                },
                { active: true }
            ]
        }).exec(cb);
    };

    UserScheme.statics.getUserID = function (login, cb) {
        return this.collection.findOneAsync({ login }, { _id: 1 })
            .then(function (user) {
                return user && user._id;
            })
            .nodeify(cb);
    };

    UserScheme.statics.isEqual = (function () {
        function getUniq(user) {
            let result;

            if (typeof user === 'string') {
                result = user;
            } else if (user) {
                if (user._id) {
                    result = user._id;

                    if (result._bsontype === 'ObjectID') {
                        result = result.toString();
                    }
                } else if (user._bsontype === 'ObjectID') {
                    result = user.toString();
                } else if (user.login) {
                    result = user.login;
                }
            }

            return result;
        }

        return function (user1, user2) {
            if (!user1 || !user2) {
                return false;
            }

            return getUniq(user1) === getUniq(user2);
        };
    }());

    User = db.model('User', UserScheme);
    UserConfirm = db.model('UserConfirm', new Schema(
        {
            created: { type: Date, 'default': Date.now, index: { expires: '2d' } },
            key: { type: String, index: { unique: true } },
            user: { type: Schema.Types.ObjectId, ref: 'User', index: true }
        }
    ));

});