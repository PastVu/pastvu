import ms from 'ms';
import bcrypt from 'bcrypt';
import { Schema } from 'mongoose';
import constants from '../app/errors/constants';
import NotFoundError from '../app/errors/NotFound';
import AuthenticationError from '../app/errors/Authentication';
import { registerModel } from '../controllers/connection';

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
        { type: Schema.Types.ObjectId, ref: 'Region' },
    ],
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
            validate: [/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, 'incorrect email'],
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
            { type: Schema.Types.ObjectId, ref: 'Region' },
        ],
        mod_regions: [ // Regions in which user is moderator
            { type: Schema.Types.ObjectId, ref: 'Region' },
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

        nologin: { type: Boolean }, // Prevent user from login in
        noprofile: { type: Boolean }, // Prevent user from changing profile info and avatar
        nophotoupload: { type: Boolean }, // Prevent user from uploading new photos
        nophotoedit: { type: Boolean }, // Prevent user from editing their photos
        nophotostatus: { type: Boolean }, // Prevent user from changins status of their photos
        nocomments: { type: Boolean }, // Prevent user from creating or editing comments
        nowaterchange: { type: Boolean }, // Prohibit user to change his own default watersign setting and watersign of his own photos
    });

    // Before every save generate hash and salt with Blowfish, if password changed
    UserScheme.pre('save', async function (next) {
        const user = this;

        // only hash the password if it has been modified (or is new)
        if (!this.isModified('pass')) {
            return next();
        }

        try {
            // Generate salt
            const salt = await bcrypt.genSalt(SALT_ROUNDS);
            // Hash the password along with our new salt
            const hash = await bcrypt.hash(user.pass, salt);

            // Override the cleartext password with the hashed one
            user.pass = hash;
            next();
        } catch (err) {
            next(err);
        }
    });

    // Checks if pass is right for current user
    UserScheme.methods.checkPass = function (candidatePassword) {
        return bcrypt.compare(candidatePassword, this.pass);
    };

    UserScheme.virtual('isLocked').get(function () {
        // Check for a future lockUntil timestamp
        return !!(this.lockUntil && this.lockUntil > Date.now());
    });

    UserScheme.methods.incLoginAttempts = function () {
        // If we have a previous lock that has expired, restart at 1
        if (this.lockUntil && this.lockUntil < Date.now()) {
            return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } }).exec();
        }

        // Otherwise we're incrementing
        const updates = { $inc: { loginAttempts: 1 } };

        // Lock the account if we've reached max attempts and it's not locked already
        if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
            updates.$set = { lockUntil: Date.now() + LOCK_TIME };
        }

        return this.updateOne(updates).exec();
    };

    UserScheme.statics.getAuthenticated = async function (login, password) {
        const user = await this.findOne({
            $or: [
                { login: new RegExp('^' + login + '$', 'i') },
                { email: login.toLowerCase() },
            ], active: true, pass: { $ne: 'init' },
        });

        // Make sure the user exists
        if (!user) {
            throw new NotFoundError(constants.NOT_FOUND_USER);
        }

        // Check if the account is currently locked
        if (user.isLocked) {
            // just increment login attempts if account is already locked
            await user.incLoginAttempts();
            throw new AuthenticationError(constants.AUTHENTICATION_MAX_ATTEMPTS);
        }

        if (user.nologin) {
            throw new AuthenticationError(constants.AUTHENTICATION_NOT_ALLOWED);
        }

        // Test for a matching password
        const isMatch = await user.checkPass(password);

        if (isMatch) {
            // If there's no lock or failed attempts, just return the user
            if (!user.loginAttempts && !user.lockUntil) {
                return user;
            }

            // Reset attempts and lock info
            user.loginAttempts = 0;
            user.lockUntil = undefined;
            await user.save();

            return user;
        }

        // Password is incorrect, so increment login attempts before responding
        await user.incLoginAttempts();
        throw new AuthenticationError(constants.AUTHENTICATION_PASS_WRONG);
    };

    UserScheme.path('sex').validate(sex => sexes.indexOf(sex) !== -1, 'Incorrect sex');

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
            rules: 0,
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
                        { email: login.toLowerCase() },
                    ],
                },
                { active: true },
            ],
        }).exec(cb);
    };

    UserScheme.statics.getUserID = async function (login) {
        const user = await this.findOne({ login }, { _id: 1 }).exec();

        return user && user._id;
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
            user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        }
    ));
});
