/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { promises as fsAsync } from 'fs';
import _ from 'lodash';
import path from 'path';
import pug from 'pug';
import log4js from 'log4js';
import Utils from '../commons/Utils';
import * as session from './_session';
import config from '../config';
import { waitDb } from './connection';
import { send as sendMail } from './mail';
import { userSettingsDef } from './settings';
import { buildPhotosQuery } from './photo';
import * as regionController from './region.js';
import * as userObjectRelController from './userobjectrel';
import constantsError from '../app/errors/constants';
import { AuthorizationError, BadParamsError, NotFoundError } from '../app/errors';

import { News } from '../models/News';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Session } from '../models/Sessions';
import { UserNoty, UserObjectRel } from '../models/UserStates';

const logger = log4js.getLogger('subscr.js');

let noticeTpl;
const noticeTplPath = path.normalize('./views/mail/notice.pug');
const sendFreq = 1500; // Conveyor step frequency in ms
const sendPerStep = 10; // Amount of sending emails in conveyor step
const subscrPerPage = 24;
const sortNotice = (a, b) => a.brief.newest < b.brief.newest ? 1 : a.brief.newest > b.brief.newest ? -1 : 0;
const sortSubscr = ({ ccount_new: aCount = 0, sbscr_create: aDate }, { ccount_new: bCount = 0, sbscr_create: bDate }) =>
    aCount < bCount ? 1 : aCount > bCount ? -1 : aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
const declension = {
    comment: [' новый комментарий', ' новых комментария', ' новых комментариев'],
    commentUnread: [' непрочитанный', ' непрочитанных', ' непрочитанных'],
};

// Subscribe to/unsubscribe from object (external, for current user by object cid)
async function subscribeUser({ cid, type = 'photo', subscribe }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    cid = Number(cid);

    if (!cid || cid < 1) {
        throw new BadParamsError();
    }

    const obj = await (type === 'news' ?
        News.findOne({ cid }, { _id: 1 }).exec() : this.call('photo.find', { query: { cid } }));

    if (_.isEmpty(obj)) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    if (subscribe) {
        // TODO: Подумать, что делать с новыми комментариями появившимися после просмотра объекта, но до подписки
        await UserObjectRel.updateOne(
            { obj: obj._id, user: iAm.user._id, type },
            { $set: { sbscr_create: new Date() } },
            { upsert: true }
        ).exec();
    } else {
        await UserObjectRel.updateOne(
            { obj: obj._id, user: iAm.user._id, type },
            { $unset: { sbscr_create: 1, sbscr_noty_change: 1, sbscr_noty: 1 } }
        ).exec();
    }

    return { subscribe };
}

/**
 * Subscribe by userId and objectId (internal, for example, after photo approval)
 *
 * @param {object} obj
 * @param {object|ObjectId} obj.user User object or userId
 * @param {ObjectId} obj.objId
 * @param {boolean} obj.setCommentView
 * @param {string} [obj.type=photo]
 * @returns {Promise}
 */
export async function subscribeUserByIds({ user, objId, setCommentView, type = 'photo' }) {
    const userId = user._id || user;
    const stamp = new Date();
    const $update = { $set: { sbscr_create: stamp } };

    if (setCommentView) {
        $update.$set.comments = stamp;
    }

    return UserObjectRel.updateOne({ obj: objId, user: userId, type }, $update, { upsert: true }).exec();
}

/**
 * Remove subscriptions to object. If specified userId, only his subscription
 *
 * @param {object} obj
 * @param {ObjectId} obj.objId
 * @param {string} [obj.userId] Without it remove subscription to object from all users
 * @returns {Promise}
 */
async function unSubscribeObj({ objId, userId }) {
    const query = { obj: objId };

    if (userId) {
        query.user = userId;
    }

    return UserObjectRel.updateOne(
        query, { $unset: { sbscr_create: 1, sbscr_noty_change: 1, sbscr_noty: 1 } }
    ).exec();
}

/**
 * Establishes notification readiness for object by event of comment addition
 *
 * @param {ObjectId} objId
 * @param {object} user
 * @param {Date} [stamp=new Date()]
 * @returns {object[]} users
 */
export async function commentAdded(objId, user, stamp = new Date()) {
    // Find all users (except comment creator), who is subscribed to object and still don't waiting notification
    const objs = await UserObjectRel.find(
        { obj: objId, user: { $ne: user._id }, sbscr_create: { $exists: true }, sbscr_noty: { $exists: false } },
        { _id: 1, user: 1 },
        { lean: true }
    ).populate({ path: 'user', select: { _id: 1, nologin: 1, 'settings.subscr_disable_noty': 1 } }).exec();

    if (_.isEmpty(objs)) {
        return []; // If no one is subscribed to object - exit
    }

    const ids = [];
    const users = [];

    for (const obj of objs) {
        // Don't schedule notification if user is not permitted to login or
        // notifications are disabled in user preferences.
        if (!(obj.user.nologin || obj.user.settings.subscr_disable_noty)) {
            ids.push(obj._id);
            users.push(obj.user._id);
        }
    }

    // Set flag of readiness of notification by object for subscribed users
    await UserObjectRel.updateMany(
        { _id: { $in: ids } },
        { $set: { sbscr_noty_change: stamp, sbscr_noty: true } }
    ).exec();

    // Schedule notification sending for subscribed users.
    await scheduleUserNotice(users);

    return users;
}

/**
 * Sets object comments like viewed, ie unnecessary to notify
 *
 * @param {ObjectId} objId
 * @param {object} user
 * @param {boolean} [setInRel]
 */
export async function commentViewed(objId, user, setInRel) {
    if (setInRel) {
        const { matchedCount: numberAffected = 0 } = await UserObjectRel.updateOne(
            { obj: objId, user: user._id },
            { $unset: { sbscr_noty: 1 }, $set: { sbscr_noty_change: new Date() } },
            { upsert: false }
        ).exec();

        if (numberAffected === 0) {
            return;
        }
    }

    // Calculate amount of notification which ready for sending to user
    const count = await UserObjectRel.countDocuments({ user: user._id, sbscr_noty: true }).exec();

    if (count === 0) {
        // If there is no notifications ready fo sending left, reset scheduled sending to user
        await UserNoty.updateOne({ user: user._id }, { $unset: { nextnoty: 1 } }).exec();
    }
}

/**
 * When user changes his 'throttle', need to change time of scheduled sending, if its exists
 *
 * @param {ObjectId} userId
 * @param {number} newThrottle
 */
export async function userThrottleChange(userId, newThrottle) {
    if (!newThrottle) {
        return;
    }

    const userNoty = await UserNoty.findOne(
        { user: userId, nextnoty: { $exists: true } }, { _id: 0 }, { lean: true }
    ).exec();

    if (_.isEmpty(userNoty)) {
        return;
    }

    const nearestNoticeTimeStamp = Date.now() + 10000;
    const newNextNoty = userNoty.lastnoty && userNoty.lastnoty.getTime ?
        Math.max(userNoty.lastnoty.getTime() + newThrottle, nearestNoticeTimeStamp) :
        nearestNoticeTimeStamp;

    await UserNoty.updateOne({ user: userId }, { $set: { nextnoty: new Date(newNextNoty) } }).exec();
}

/**
 * Cancel all scheduled notifications.
 *
 * @param {ObjectId} userId
 */
export async function userCancelNotifications(userId) {
    // Reset notifications ready to send flag.
    await UserObjectRel.updateMany(
        { user: userId },
        { $unset: { sbscr_noty: 1 }, $set: { sbscr_noty_change: new Date() } }
    ).exec();
    // Reset scheduled sending to user.
    await UserNoty.updateOne({ user: userId }, { $unset: { nextnoty: 1 } }).exec();
}

/**
 * Schedule sending of notification for users
 *
 * @param {ObjectId[]} users Array of users _id
 */
async function scheduleUserNotice(users) {
    const [usersThrottle, usersNoty] = await Promise.all([
        // Find for every user 'throttle' value
        User.find({ _id: { $in: users } }, { _id: 1, 'settings.subscr_throttle': 1 }, { lean: true }).exec(),
        // Find noty of users, even scheduled
        // (if we won't, we can't understand which is planed already, and wich is planning for the first time)
        UserNoty.find({ user: { $in: users } }, { _id: 0 }, { lean: true }).exec(),
    ]);

    const usersNotyHash = {};
    const usersTrottleHash = {};
    const nearestNoticeTimeStamp = Date.now() + 10000; // Closest notification for users, who have not previous one

    for (const userThrotle of usersThrottle) {
        usersTrottleHash[userThrotle._id] = _.get(userThrotle, 'settings.subscr_throttle');
    }

    for (const userNoty of usersNoty) {
        const user = userNoty.user;

        if (userNoty.nextnoty) {
            // Means that notification for user has been already scheduled and we don't need to do anything
            usersNotyHash[user] = false;
        } else {
            // If user has no next schedule time, calculate it
            const lastnoty = userNoty.lastnoty;
            let nextnoty;

            // If there was no previous notification or since it has elapsed time more then throttle,
            // or left less then 10 seconds, then set closest time
            if (lastnoty && lastnoty.getTime) {
                nextnoty = Math.max(
                    lastnoty.getTime() + (usersTrottleHash[user] || userSettingsDef.subscr_throttle),
                    nearestNoticeTimeStamp
                );
            } else {
                nextnoty = nearestNoticeTimeStamp;
            }

            usersNotyHash[user] = nextnoty;
        }
    }

    for (const userId of users) {
        if (usersNotyHash[userId] !== false) {
            UserNoty.updateOne(
                { user: userId },
                { $set: { nextnoty: new Date(usersNotyHash[userId] || nearestNoticeTimeStamp) } },
                { upsert: true }
            ).exec();
        }
    }
}

// Conveyor of notificaton sending
// Every 'sendFreq' sends 'sendPerStep' notifications
const notifierConveyor = (function () {
    async function conveyorStep() {
        try {
            // Find noty, which time nextnoty has passed
            let usersNoty = await UserNoty.find(
                { nextnoty: { $lte: new Date() } },
                { _id: 0 },
                { lean: true, limit: sendPerStep, sort: { nextnoty: 1 } }
            ).exec();

            // Hack fo checking user localization. Do not notify if user's language different from this node instanse
            // Determine user language by language in last session
            const usersNotyWithCurrentLang = [];

            for (const noty of usersNoty) {
                const sessions = await Session.find(
                    { user: noty.user }, { _id: 0, 'data.lang': 1 },
                    { lean: true, limit: 1, sort: { stamp: -1 } }
                ).exec();

                if (_.get(sessions, '[0].data.lang', 'ru') === config.lang) {
                    usersNotyWithCurrentLang.push(noty);
                }
            }

            usersNoty = usersNotyWithCurrentLang;

            if (_.isEmpty(usersNoty)) {
                return notifierConveyor();
            }

            const userIds = [];
            const nowDate = new Date();

            await Promise.all(usersNoty.map(({ user }) => {
                userIds.push(user);

                return sendUserNotice(user).catch(err => logger.error('sendUserNotice', err));
            }));

            await UserNoty.updateMany(
                { user: { $in: userIds } },
                { $set: { lastnoty: nowDate }, $unset: { nextnoty: 1 } }
            ).exec();
        } catch (err) {
            logger.error('conveyorStep', err);
        }

        notifierConveyor();
    }

    return function () {
        setTimeout(conveyorStep, sendFreq);
    };
}());

/**
 * Forms a letter to user from ready notifications (noty: true) and send it
 *
 * @param {ObjectId} userId
 * @returns {Promise}
 */
async function sendUserNotice(userId) {
    const userObj = session.getOnline({ userId });
    const user = userObj ? userObj.user :
        await User.findOne({ _id: userId }, { _id: 1, login: 1, disp: 1, email: 1 }, { lean: true }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    // Find all subscriptions of users, which ready for notyfication (sbscr_noty: true)
    const rels = await UserObjectRel.find(
        { user: userId, sbscr_noty: true },
        { user: 0, sbscr_noty: 0 },
        { lean: true }
    ).exec();

    if (_.isEmpty(rels)) {
        return;
    }

    const objsIdPhotos = [];
    const objsIdNews = [];
    const relHash = {};
    const relIds = []; // Array of relations _ids, which we'll process and reset in case of successful sending

    // Reset flag of rediness to notification (sbscr_noty) of sent objects
    async function resetRelsNoty() {
        if (!_.isEmpty(relIds)) {
            return UserObjectRel.updateMany(
                { _id: { $in: relIds } },
                { $unset: { sbscr_noty: 1 }, $set: { sbscr_noty_change: new Date() } }
            ).exec();
        }
    }

    for (const rel of rels) {
        relHash[rel.obj] = rel;
        relIds.push(rel._id);

        if (rel.type === 'news') {
            objsIdNews.push(rel.obj);
        } else {
            objsIdPhotos.push(rel.obj);
        }
    }

    // Select each object and amount of unread and new comments for it
    const [news = [], photos = []] = await Promise.all([
        objsIdNews.length ? News.find(
            { _id: { $in: objsIdNews }, ccount: { $gt: 0 } },
            { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true }
        ).exec().then(news => userObjectRelController.getNewCommentsBrief(news, relHash, userId, 'news')) : undefined,

        objsIdPhotos.length ? Photo.find( // User will receive notifications for statuses >= PUBLIC
            { _id: { $in: objsIdPhotos }, ccount: { $gt: 0 } },
            { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true }
        ).exec().then(photos => userObjectRelController.getNewCommentsBrief(photos, relHash, userId)) : undefined,
    ]);

    if (_.isEmpty(news) && _.isEmpty(photos)) {
        return resetRelsNoty();
    }

    let totalNewestComments = 0;
    const photosResult = [];
    const newsResult = [];

    // Leave only objects, for which new comments really exists
    // If user viewed object, for example, while this step of conveyor works,
    // then new comments will be cleared and we don't need to send notification anymore
    function objProcess(result, obj) {
        const newest = _.get(obj, 'brief.newest', 0);

        if (newest > 0) {
            const unread = _.get(obj, 'brief.unread', 0);

            totalNewestComments += newest;

            obj.briefFormat = { newest: newest + Utils.format.wordEndOfNum(newest, declension.comment) };

            if (newest !== unread) {
                obj.briefFormat.unread = unread + Utils.format.wordEndOfNum(unread, declension.commentUnread);
            }

            result.push(obj);
        }

        return obj;
    }

    news.forEach(_.partial(objProcess, newsResult));
    photos.forEach(_.partial(objProcess, photosResult));

    // Send letter, only if new comments exists
    if (newsResult.length || photosResult.length) {
        // Sort by amount of new comments
        newsResult.sort(sortNotice);
        photosResult.sort(sortNotice);

        await sendMail({
            sender: 'noreply',
            receiver: { alias: String(user.disp), email: user.email },
            subject: 'Новое уведомление',
            head: true,
            body: noticeTpl({
                user,
                config,
                news: newsResult,
                photos: photosResult,
                username: String(user.disp),
                greeting: 'Уведомление о событиях на PastVu',
            }),
            text: totalNewestComments +
            (totalNewestComments === 1 ? ' новый коментарий' : ' новых ' +
            (totalNewestComments < 5 ? 'комментария' : 'комментариев')),
        });
    }

    return resetRelsNoty();
}

// Return paged list of user's subscriptions
const photosFields = {
    _id: 1, cid: 1, s: 1, user: 1, title: 1, ccount: 1, file: 1, mime: 1,
    ...regionController.regionsAllSelectHash,
};


/**
 * Get subscription object relations for given user.
 *
 * @param {object} obj
 * @param {string} obj.userId
 * @param {number} obj.page
 * @param {string} obj.type (photo or news)
 * @returns {Promise}
 */
function getUserObjectRel({ userId, page, type }) {
    const skip = page * subscrPerPage;

    return UserObjectRel.aggregate([
        { $match: { user: userId, type, sbscr_create: { $exists: true } } },
        { $project: { _id: 0, obj: 1, sbscr_create: 1, sbscr_noty: 1, ccount_new: { $cond: { if: { $eq: [0, '$ccount_new'] }, then: '$$REMOVE', else: '$ccount_new' } } } },
        { $sort: { ccount_new: -1, sbscr_create: -1 } },
        { $skip: skip },
        { $limit: subscrPerPage },
    ]);
}

/**
 * Returns user subscriptions data for Subscriptions tab.
 *
 * @param {object} obj
 * @param {string} obj.login
 * @param {number} obj.page
 * @param {string} obj.type (photo or painting)
 * @returns {object}
 */
async function giveUserSubscriptions({ login, page = 1, type = 'photo' }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const userId = await User.getUserID(login);

    if (!userId) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    page = (Math.abs(Number(page)) || 1) - 1;

    const rels = await getUserObjectRel({ userId, page, type }).exec();

    let objs = [];
    const objIds = [];
    const relHash = {};

    if (!_.isEmpty(rels)) {
        for (const rel of rels) {
            relHash[rel.obj] = rel;
            objIds.push(rel.obj);
        }

        objs = await (type === 'news' ?
            News.find(
                { _id: { $in: objIds } }, { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true }
            ).exec() :
            Photo.find(
                Object.assign(buildPhotosQuery({ r: 0, t: null, s: [5, 7, 9] }, null, iAm).query, { _id: { $in: objIds } }),
                photosFields, { lean: true }
            ).exec());
    }

    const [countPhoto = 0, countNews = 0, { nextnoty: nextNoty } = {}] = await Promise.all([
        // Count total number of photos in subscriptions
        UserObjectRel.countDocuments({ user: userId, type: 'photo', sbscr_create: { $exists: true } }).exec(),

        // Count total number of news in subscriptions
        UserObjectRel.countDocuments({ user: userId, type: 'news', sbscr_create: { $exists: true } }).exec(),

        // Take time of next scheduled notification
        await UserNoty.findOne(
            { user: userId, nextnoty: { $exists: true } }, { _id: 0, nextnoty: 1 }, { lean: true }
        ).exec() || undefined,
        // ( await xxx || undefined ) needed for 'null' to be replaced with default value '{}' in desctruction
        // https://github.com/Automattic/mongoose/issues/3457
    ]);

    if (type === 'photo') {
        await this.call('photo.fillPhotosProtection', { photos: objs, setMyFlag: true });

        for (const obj of objs) {
            obj.user = undefined;
            obj.mime = undefined;
        }
    }

    for (const obj of objs) {
        const rel = relHash[obj._id];

        if (rel.ccount_new) {
            obj.ccount_new = rel.ccount_new;
        }

        if (rel.sbscr_noty) {
            obj.sbscr_noty = true;
        }

        obj.sbscr_create = rel.sbscr_create.getTime();

        obj.subscr = undefined;
        obj._id = undefined;
    }

    objs.sort(sortSubscr); // $in doesn't guarantee sorting, so do manual sort

    return {
        type,
        nextNoty,
        countNews,
        countPhoto,
        subscr: objs,
        page: page + 1,
        perPage: subscrPerPage,
    };
}

export const ready = (async () => {
    if (! config.notifier) {
        return;
    } //Turn off notifier if disabled in config

    logger.info('Proceeding to load notifier...');

    try {
        const data = await fsAsync.readFile(noticeTplPath, 'utf-8');

        noticeTpl = pug.compile(data, { filename: noticeTplPath, pretty: false });

        await waitDb;

        notifierConveyor();
    } catch (err) {
        err.message = 'Notice pug read error: ' + err.message;
        throw err;
    }
})();

subscribeUser.isPublic = true;
giveUserSubscriptions.isPublic = true;

export default {
    subscribeUser,
    giveUserSubscriptions,

    subscribeUserByIds,
    unSubscribeObj,
};
