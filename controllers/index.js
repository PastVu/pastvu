import ms from 'ms';
import _ from 'lodash';
import step from 'step';
import moment from 'moment';
import Bluebird from 'bluebird';
import Utils from '../commons/Utils';
import * as session from './_session';
import * as userObjectRelController from './userobjectrel';

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
    const sortCcount = (a, b) => b.ccount > a.ccount ? -1 : b.ccount < a.ccount ? 1 : 0;
    const sortPcount = (a, b) => b.pcount > a.pcount ? -1 : b.pcount < a.pcount ? 1 : 0;

    const photosByCommentsCount = $gt => Comment.aggregate([
        { $match: { stamp: { $gt }, del: null, hidden: null } },
        { $group: { _id: '$obj', ccount: { $sum: 1 } } },
        { $sort: { ccount: -1 } },
        { $limit: limit }
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
        { $match: { stamp: { $gt }, del: null, hidden: null } },
        { $group: { _id: '$user', ccount: { $sum: 1 } } },
        { $sort: { ccount: -1 } },
        { $limit: limit }
    ]).exec().then(users => {
        const countHash = {};
        const ids = users.map(user => {
            countHash[user._id] = user.ccount;
            return user._id;
        });

        return User.find({ _id: { $in: ids } }, { _id: 1, login: 1, avatar: 1, disp: 1, ccount: 1 }, { lean: true })
            .exec().then(users => _.forEach(users, user => {
                user.ccount = countHash[user._id];
                user.online = session.usLogin[user.login] !== undefined;
            }).sort(sortCcount));
    });

    const usersByPhotosCount = $gt => Photo.aggregate([
        { $match: { adate: { $gt }, s: 5 } },
        { $group: { _id: '$user', pcount: { $sum: 1 } } },
        { $sort: { pcount: -1 } },
        { $limit: limit }
    ]).exec().then(users => {
        const countHash = {};
        const ids = users.map(user => {
            countHash[user._id] = user.pcount;
            return user._id;
        });

        return User.find({ _id: { $in: ids } }, { _id: 1, login: 1, avatar: 1, disp: 1, pcount: 1 }, { lean: true })
            .exec().then(users => _.forEach(users, user => {
                user.pcount = countHash[user._id];
                user.online = session.usLogin[user.login] !== undefined;
            }).sort(sortPcount));
    });

    return Utils.memoizePromise(async function () {
        const [pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall, upday, upweek, upall] = await * [
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
                { lean: true, limit, sort: { ccount: -1} }
            ).exec().then(users => _.forEach(users, user => user.online = session.usLogin[user.login] !== undefined)),

            // Users by photos count
            usersByPhotosCount(dayStart),
            usersByPhotosCount(weekStart),
            User.find(
                { pcount: { $gt: 0 } }, { _id: 0, login: 1, avatar: 1, disp: 1, pcount: 1 },
                { lean: true, limit, sort: { pcount: -1 } }
            ).exec().then(users => _.forEach(users, user => user.online = session.usLogin[user.login] !== undefined))
        ];

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
                unpopYearCount: { $last: '$count' }
            }
        },
        {
            $project: {
                _id: 0,
                pop: { year: '$popYear', count: '$popYearCount' },
                unpop: { year: '$unpopYear', count: '$unpopYearCount' }
            }
        }
    ];

    return Utils.memoizePromise(async function () {
        const [
            [photoYear],
            pallCount, userCount, pdayCount, pweekCount, callCount,
            cnallCount, cdayCount, cndayCount, cweekCount, cnweekCount
        ] = await* [
            Photo.aggregate(aggregateParams).exec(),

            Photo.count({ s: 5 }).exec(),
            User.count({ active: true }).exec(),

            Photo.count({ s: 5, adate: { $gt: dayStart } }).exec(),
            Photo.count({ s: 5, adate: { $gt: weekStart } }).exec(),

            Comment.count({ del: null, hidden: null }).exec(),
            CommentN.count({ del: null, hidden: null }).exec(),
            Comment.count({ stamp: { $gt: dayStart }, del: null, hidden: null }).exec(),
            CommentN.count({ stamp: { $gt: dayStart }, del: null, hidden: null }).exec(),
            Comment.count({ stamp: { $gt: weekStart }, del: null, hidden: null }).exec(),
            CommentN.count({ stamp: { $gt: weekStart }, del: null, hidden: null }).exec()
        ];

        return {
            all: {
                photoYear, pallCount, userCount, pdayCount, pweekCount,
                callCount: callCount + cnallCount,
                cdayCount: cdayCount + cndayCount,
                cweekCount: cweekCount + cnweekCount
            }
        };
    }, memoizeInterval);
}());

// Fast statistics
const giveOnlineStats = (function () {
    const memoizeInterval = ms('5s');

    return Utils.memoizePromise(function () {
        const usersCount = _.size(session.usLogin);
        const anonymCount = _.reduce(session.sessConnected, (result, session) => {
            return session.user ? result : result + 1;
        }, 0);

        return Promise.resolve({
            onall: anonymCount + usersCount,
            onreg: usersCount
        });
    }, memoizeInterval);
}());

async function giveIndexStats() {
    const [stat, statFast] = await* [giveStats(), giveOnlineStats()];

    stat.common = statFast;

    return stat;
}

// News for index page
const giveIndexNews = (function () {
    const forAnonym = (function () {
        const select = { _id: 0, user: 0, cdate: 0, tdate: 0, nocomments: 0 };
        const options = { lean: true, limit: 3, sort: { pdate: -1 } };

        return Utils.memoizePromise(function () {
            const now = new Date();

            return News.find({
                pdate: { $lte: now }, $or: [
                    { tdate: { $gt: now } },
                    { tdate: { $exists: false } }
                ]
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
                    { tdate: { $exists: false } }
                ]
            }, select, options).exec();

            if (news.length) {
                await userObjectRelController.fillObjectByRels(news, iAm.user._id, 'news');
                news.forEach(n => delete n._id);
            }

            return news;
        };
    }());

    return async function(iAm) {
        const news = await (iAm.registered ? forRegistered(iAm) : forAnonym());

        return { news };
    };
}());

/**
 * Архив новостей
 */
var giveAllNews = function (iAm) {
    return News.find({ pdate: { $lte: new Date() } }, { cdate: 0, tdate: 0, nocomments: 0 }, {
            lean: true,
            sort: { pdate: -1 }
        })
        .populate({ path: 'user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } })
        .execAsync()
        .then(function (news) {
            if (!iAm.registered || !news.length) {
                return news;
            } else {
                //Если пользователь залогинен, заполняем кол-во новых комментариев для каждого объекта
                return userObjectRelController.fillObjectByRels(news, iAm.user._id, 'news');
            }
        })
        .then(function (news) {
            for (var i = news.length; i--;) {
                delete news[i]._id;
            }
            return { news: news };
        });
};

function giveNewsFull(data, cb) {
    if (!_.isObject(data) || !_.isNumber(data.cid) || data.cid < 1) {
        return cb({ message: 'Bad params', error: true });
    }
    step(
        function () {
            News.collection.findOne({ cid: data.cid }, { _id: 0 }, this);
        },
        function (err, news) {
            if (err) {
                return cb({ message: err && err.message, error: true });
            }
            cb({ news: news });
        }
    );
}

/**
 * Отдача новости для её страницы
 * @param iAm
 * @param data
 * @param cb
 */
var giveNewsPublic = Bluebird.method(function (iAm, data) {
    if (!_.isObject(data) || !_.isNumber(data.cid)) {
        throw { message: 'Bad params' };
    }

    return News.findOneAsync(
        { cid: data.cid },
        { _id: 1, cid: 1, user: 1, pdate: 1, title: 1, txt: 1, ccount: 1, nocomments: 1 },
        { lean: true }
        )
        .then(function (news) {
            if (!news) {
                throw { message: 'No such news' };
            }
            var userObj = session.getOnline(null, news.user);

            if (userObj) {
                news.user = {
                    login: userObj.user.login, avatar: userObj.user.avatar, disp: userObj.user.disp, online: true
                };
                return news;
            } else {
                return User.findOneAsync({ _id: news.user }, { _id: 0, login: 1, avatar: 1, disp: 1 }, { lean: true })
                    .then(function (user) {
                        news.user = user;
                        return news;
                    });
            }
        })
        .then(function (news) {
            if (iAm.registered) {
                return userObjectRelController.fillObjectByRels(news, iAm.user._id, 'news')
                    .then(function (news) {
                        // Обновляем время просмотра объекта пользователем
                        userObjectRelController.setObjectView(news._id, iAm.user._id, 'news');
                    })
                    .then(function () {
                        return news;
                    });
            } else {
                return news;
            }
        })
        .then(function (news) {
            delete news._id;
            return { news: news };
        });
});

/**
 * Аватары для About
 */
var giveAbout = (function () {
    var select = { _id: 0, login: 1, avatar: 1 },
        options = { lean: true };

    return Utils.memoizeAsync(function (handler) {
        User.find({ login: { $in: ['Ilya', 'Duche', 'klimashkin', 'dema501', 'abdulla_hasan'] } }, select, options, function (err, users) {
            if (err || !users) {
                users = [];
            }
            var result = {}, i;
            for (i = users.length; i--;) {
                result[users[i].login] = users[i].avatar || '/img/caps/avatar.png';
            }
            handler(result);
        });
    }, ms('1m'));
}());

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('giveIndexNews', function () {
            giveIndexNews(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (result) {
                    socket.emit('takeIndexNews', result);
                });
        });

        socket.on('giveAllNews', function () {
            giveAllNews(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (result) {
                    socket.emit('takeAllNews', result);
                });
        });
        socket.on('giveNews', function (data) {
            giveNewsFull(data, function (resultData) {
                socket.emit('takeNews', resultData);
            });
        });
        socket.on('giveNewsPublic', function (data) {
            giveNewsPublic(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (result) {
                    socket.emit('takeNewsPublic', result);
                });
        });

        socket.on('giveRatings', function (data) {
            giveRatings(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (result) {
                    socket.emit('takeRatings', result);
                });
        });

        socket.on('giveStats', function () {
            giveIndexStats()
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (result) {
                    socket.emit('takeStats', result);
                });
        });

        socket.on('giveAbout', function () {
            giveAbout(function (resultData) {
                socket.emit('takeAbout', resultData);
            });
        });
    });
};