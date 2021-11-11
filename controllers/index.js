import ms from 'ms';
import _ from 'lodash';
import moment from 'moment';
import Utils from '../commons/Utils';
import * as session from './_session';
import * as userObjectRelController from './userobjectrel';
import constantsError from '../app/errors/constants';
import { BadParamsError, NotFoundError } from '../app/errors';

import { News } from '../models/News';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Comment, CommentN } from '../models/Comment';

let dayStart; // Time of day start
let weekStart; // Time of week start

(function periodStartCalc() {
    dayStart = moment.utc().startOf('day').toDate();
    weekStart = moment.utc().startOf('isoWeek').toDate();
    // Plan recalculation on the begining of the next day
    setTimeout(periodStartCalc, moment.utc().add(1, 'd').startOf('day').diff(moment.utc()) + 1000);
}());

// Ratings
const giveRatings = (function () {
    const memoizeInterval = ms('1m');
    const limit = 13; // Result number for every indicator

    // After selecting object by array of keys ($in) the sort order is not guaranteed,
    // so manually sort by indicator
    const sortCcount = (a, b) => b.ccount > a.ccount ? 1 : b.ccount < a.ccount ? -1 : 0;
    const sortPcount = (a, b) => b.pcount > a.pcount ? 1 : b.pcount < a.pcount ? -1 : 0;

    const photosByCommentsCount = $gt => Comment.aggregate([
        { $match: { stamp: { $gt }, s: 5, del: null } },
        { $group: { _id: '$obj', ccount: { $sum: 1 } } },
        { $sort: { ccount: -1 } },
        { $limit: limit },
    ]).exec().then(photos => {
        const countHash = {};
        const ids = photos.map(photo => {
            countHash[photo._id] = photo.ccount;

            return photo._id;
        });

        return Photo.find(
            { _id: { $in: ids }, s: 5 }, { _id: 1, cid: 1, file: 1, title: 1, ccount: 1 }, { lean: true }
        ).exec().then(photos => _.forEach(photos, photo => photo.ccount = countHash[photo._id]).sort(sortCcount));
    });

    const usersByCommentsCount = $gt => Comment.aggregate([
        { $match: { stamp: { $gt }, s: 5, del: null } },
        { $group: { _id: '$user', ccount: { $sum: 1 } } },
        { $sort: { ccount: -1 } },
        { $limit: limit },
    ]).exec().then(users => {
        const countHash = {};
        const ids = users.map(user => {
            countHash[user._id] = user.ccount;

            return user._id;
        });

        return User.find({ _id: { $in: ids } }, { _id: 1, login: 1, avatar: 1, disp: 1, ccount: 1 }, { lean: true })
            .exec().then(users => _.forEach(users, user => {
                user.ccount = countHash[user._id];
                user.online = session.usLogin.has(user.login);
            }).sort(sortCcount));
    });

    const usersByPhotosCount = $gt => Photo.aggregate([
        { $match: { adate: { $gt }, s: 5 } },
        { $group: { _id: '$user', pcount: { $sum: 1 } } },
        { $sort: { pcount: -1 } },
        { $limit: limit },
    ]).exec().then(users => {
        const countHash = {};
        const ids = users.map(user => {
            countHash[user._id] = user.pcount;

            return user._id;
        });

        return User.find({ _id: { $in: ids } }, { _id: 1, login: 1, avatar: 1, disp: 1, pcount: 1 }, { lean: true })
            .exec().then(users => _.forEach(users, user => {
                user.pcount = countHash[user._id];
                user.online = session.usLogin.has(user.login);
            }).sort(sortPcount));
    });

    return Utils.memoizePromise(async () => {
        const [pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall, upday, upweek, upall] = await Promise.all([
            // Photo by views count
            Photo.find(
                { s: 5, vdcount: { $gt: 0 } },
                { _id: 0, cid: 1, file: 1, title: 1, vdcount: 1 },
                { lean: true, limit, sort: { vdcount: -1 } }
            ).exec(),
            Photo.find(
                { s: 5, vwcount: { $gt: 0 } },
                { _id: 0, cid: 1, file: 1, title: 1, vwcount: 1 },
                { lean: true, limit, sort: { vwcount: -1 } }
            ).exec(),
            Photo.find(
                { s: 5, vwcount: { $gt: 0 } },
                { _id: 0, cid: 1, file: 1, title: 1, vcount: 1 },
                { lean: true, limit, sort: { vcount: -1 } }
            ).exec(),

            // Photo by comments count
            photosByCommentsCount(dayStart),
            photosByCommentsCount(weekStart),
            Photo.find(
                { s: 5 }, { _id: 0, cid: 1, file: 1, title: 1, ccount: 1 },
                { lean: true, limit, sort: { ccount: -1 } }
            ).exec(),

            // Users by comments count
            usersByCommentsCount(dayStart),
            usersByCommentsCount(weekStart),
            User.find(
                { ccount: { $gt: 0 } }, { _id: 0, login: 1, avatar: 1, disp: 1, ccount: 1 },
                { lean: true, limit, sort: { ccount: -1 } }
            ).exec().then(users => _.forEach(users, user => user.online = session.usLogin.has(user.login))),

            // Users by photos count
            usersByPhotosCount(dayStart),
            usersByPhotosCount(weekStart),
            User.find(
                { pcount: { $gt: 0 } }, { _id: 0, login: 1, avatar: 1, disp: 1, pcount: 1 },
                { lean: true, limit, sort: { pcount: -1 } }
            ).exec().then(users => _.forEach(users, user => user.online = session.usLogin.has(user.login))),
        ]);

        return { pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall, upday, upweek, upall };
    }, memoizeInterval);
}());

// Statistics
const giveStats = (function () {
    const memoizeInterval = ms('5m');
    const aggregateParams = [
        { $match: { s: 5 } },
        { $group: { _id: '$year', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        {
            $group: {
                _id: null,
                popYear: { $first: '$_id' },
                popYearCount: { $first: '$count' },
                unpopYear: { $last: '$_id' },
                unpopYearCount: { $last: '$count' },
            },
        },
        {
            $project: {
                _id: 0,
                pop: { year: '$popYear', count: '$popYearCount' },
                unpop: { year: '$unpopYear', count: '$unpopYearCount' },
            },
        },
    ];

    return Utils.memoizePromise(async () => {
        const [
            [photoYear],
            pallCount, ppubCount, userCount, pdayCount, pweekCount,
            callCount, cnallCount,
            cpubCount, cnpubCount, cdayCount, cndayCount, cweekCount, cnweekCount,
        ] = await Promise.all([
            Photo.aggregate(aggregateParams).exec(),

            Photo.estimatedDocumentCount().exec(),
            Photo.countDocuments({ s: 5 }).exec(),
            User.countDocuments({ active: true }).exec(),

            Photo.countDocuments({ s: 5, adate: { $gt: dayStart } }).exec(),
            Photo.countDocuments({ s: 5, adate: { $gt: weekStart } }).exec(),

            Comment.estimatedDocumentCount().exec(),
            CommentN.estimatedDocumentCount().exec(),

            Comment.countDocuments({ s: 5, del: null }).exec(),
            CommentN.countDocuments({ del: null }).exec(),
            Comment.countDocuments({ s: 5, stamp: { $gt: dayStart }, del: null }).exec(),
            CommentN.countDocuments({ stamp: { $gt: dayStart }, del: null }).exec(),
            Comment.countDocuments({ s: 5, stamp: { $gt: weekStart }, del: null }).exec(),
            CommentN.countDocuments({ stamp: { $gt: weekStart }, del: null }).exec(),
        ]);

        return {
            all: {
                photoYear, pallCount, ppubCount, userCount, pdayCount, pweekCount,
                callCount: callCount + cnallCount,
                cpubCount: cpubCount + cnpubCount,
                cdayCount: cdayCount + cndayCount,
                cweekCount: cweekCount + cnweekCount,
            },
        };
    }, memoizeInterval);
}());

// Fast statistics
const giveOnlineStats = (function () {
    const memoizeInterval = ms('5s');

    return Utils.memoizePromise(() => {
        const usersCount = session.usLogin.size;
        const anonymCount = [...session.sessConnected.values()].filter(session => !session.user).length;

        return Promise.resolve({
            onall: anonymCount + usersCount,
            onreg: usersCount,
        });
    }, memoizeInterval);
}());

async function giveIndexStats() {
    const [stat, statFast] = await Promise.all([giveStats(), giveOnlineStats()]);

    stat.common = statFast;

    return stat;
}

// News for index page
const giveIndexNews = (function () {
    const forAnonym = (function () {
        const select = { _id: 0, user: 0, cdate: 0, tdate: 0, nocomments: 0 };
        const options = { lean: true, limit: 3, sort: { pdate: -1 } };

        return Utils.memoizePromise(() => {
            const now = new Date();

            return News.find({
                pdate: { $lte: now }, $or: [
                    { tdate: { $gt: now } },
                    { tdate: { $exists: false } },
                ],
            }, select, options).exec();
        }, ms('1m'));
    }());

    const forRegistered = (function () {
        const select = { user: 0, cdate: 0, tdate: 0, nocomments: 0 };
        const options = { lean: true, limit: 3, sort: { pdate: -1 } };

        return async function (iAm) {
            const now = new Date();

            const news = await News.find({
                pdate: { $lte: now },
                $or: [
                    { tdate: { $gt: now } },
                    { tdate: { $exists: false } },
                ],
            }, select, options).exec();

            if (news.length) {
                await userObjectRelController.fillObjectByRels(news, iAm.user._id, 'news');
                news.forEach(n => delete n._id);
            }

            return news;
        };
    }());

    return async function () {
        const { handshake: { usObj: iAm } } = this;
        const news = await (iAm.registered ? forRegistered(iAm) : forAnonym());

        return { news };
    };
}());

// News archive
async function giveAllNews() {
    const { handshake: { usObj: iAm } } = this;
    const news = await News.find(
        { pdate: { $lte: new Date() } },
        { cdate: 0, tdate: 0, nocomments: 0 },
        { lean: true, sort: { pdate: -1 } }
    ).populate({ path: 'user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } }).exec();

    if (iAm.registered && !news.length) {
        // If user is logged in, fill in count of new comments for each news
        await userObjectRelController.fillObjectByRels(news, iAm.user._id, 'news');
        news.forEach(n => delete n._id);
    }

    return { news };
}

// Full news object for administration (create/edit)
async function giveNewsFull({ cid }) {
    if (!_.isNumber(cid) || cid < 1) {
        throw new BadParamsError();
    }

    const news = await News.findOne({ cid }, { _id: 0 }).exec();

    return { news };
}

// Return news for its public page
async function giveNewsPublic({ cid } = {}) {
    if (!_.isNumber(cid) || cid < 1) {
        throw new BadParamsError();
    }

    const { handshake: { usObj: iAm } } = this;
    const news = await News.findOne(
        { cid }, { _id: 1, cid: 1, user: 1, pdate: 1, title: 1, txt: 1, ccount: 1, nocomments: 1 }, { lean: true }
    ).exec();

    if (!news) {
        throw new NotFoundError(constantsError.NO_SUCH_NEWS);
    }

    const userObj = session.getOnline({ userId: news.user });

    if (userObj) {
        news.user = Object.assign(_.pick(userObj.user, 'login', 'avatar', 'disp'), { online: true });
    } else {
        news.user = await User.findOne(
            { _id: news.user }, { _id: 0, login: 1, avatar: 1, disp: 1 }, { lean: true }
        ).exec();
    }

    if (iAm.registered) {
        await userObjectRelController.fillObjectByRels(news, iAm.user._id, 'news');
        // Update object view time by user
        await userObjectRelController.setObjectView(news._id, iAm.user._id, 'news');
    }

    delete news._id;

    return { news };
}

// Avatars for about
const giveAbout = (function () {
    const query = { login: { $in: ['Ilya', 'Duche', 'klimashkin', 'dema501', 'abdulla_hasan'] } };
    const select = { _id: 0, login: 1, avatar: 1 };
    const options = { lean: true };

    return Utils.memoizePromise(async () => {
        const users = await User.find(query, select, options).exec();

        return _.transform(users, (result, user) => result[user.login] = user.avatar || '/img/caps/avatar.png', {});
    }, ms('1m'));
}());

giveIndexNews.isPublic = true;
giveAllNews.isPublic = true;
giveNewsFull.isPublic = true;
giveNewsPublic.isPublic = true;
giveRatings.isPublic = true;
giveIndexStats.isPublic = true;
giveAbout.isPublic = true;

export default {
    giveIndexNews,
    giveAllNews,
    giveNewsFull,
    giveNewsPublic,
    giveRatings,
    giveIndexStats,
    giveAbout,
};
