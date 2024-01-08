/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import ms from 'ms';
import _ from 'lodash';
import log4js from 'log4js';
import Utils from '../commons/Utils';
import constants from './constants';
import constantsError from '../app/errors/constants';
import * as session from './_session';
import { giveReasonTitle } from './reason';
import * as photoController from './photo';
import * as subscrController from './subscr';
import * as regionController from './region.js';
import * as actionLogController from './actionlog.js';
import * as userObjectRelController from './userobjectrel';
import {
    ApplicationError,
    AuthorizationError,
    BadParamsError,
    InputError,
    NotFoundError,
    NoticeError,
} from '../app/errors';

import { News } from '../models/News';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Counter } from '../models/Counter';
import { Comment, CommentN } from '../models/Comment';

const dayMS = ms('1d');
const commentMaxLength = 12e3;
const logger = log4js.getLogger('comment.js');
const maxRegionLevel = constants.region.maxLevel;
const commentsUserPerPage = 20;

const permissions = {
    canModerate(type, obj, usObj) {
        return usObj.registered &&
            (type === 'photo' &&
             // Need to check if user can add comment to this photo,
             // for instance moderator can't reply to own deleted photo and accordingly moderate it
             photoController.permissions.getCan(obj, usObj).comment &&
             photoController.permissions.canModerate(obj, usObj) ||
             type === 'news' && usObj.isAdmin) || undefined;
    },
    canReply(type, obj, usObj) {
        return usObj.registered && !usObj.user.nocomments && !obj.nocomments &&
            (type === 'photo' && photoController.permissions.getCan(obj, usObj).comment || type === 'news');
    },
    canEdit(comment, type, obj, usObj) {
        return permissions.canReply(type, obj, usObj) &&
            comment.user.equals(usObj.user._id) && comment.stamp > Date.now() - dayMS;
    },
};

function commentsTreeBuildAnonym(comments, usersHash) {
    const hash = {};
    const tree = [];
    let latestCid = 0;
    let latestStamp = 0;

    for (const comment of comments) {
        const user = usersHash[String(comment.user)];

        if (!user) {
            logger.error(
                `User for comment undefined. Comment userId: ${String(comment.user)}`,
                `Comment: ${JSON.stringify(comment)}`
            );
            throw new ApplicationError({ code: constantsError.COMMENT_UNKNOWN_USER, userId: comment.user });
        }

        comment.user = user.login;

        comment.stamp = comment.stamp.getTime(); // Serve time in ms

        if (comment.lastChanged !== undefined) {
            comment.lastChanged = comment.lastChanged.getTime();
        }

        if (comment.level === undefined) {
            comment.level = 0;
        }

        if (comment.level > 0) {
            const commentParent = hash[comment.parent];

            if (commentParent.comments === undefined) {
                commentParent.comments = [];
            }

            commentParent.comments.push(comment);
        } else {
            tree.push(comment);
        }

        if (comment.stamp > latestStamp) {
            latestCid = comment.cid;
            latestStamp = comment.stamp;
        }

        hash[comment.cid] = comment;
    }

    // Set latest comment flag.
    if (latestCid) {
        const latestComment = hash[latestCid];

        latestComment.latest = true;
    }

    return { tree, latestCid };
}

async function commentsTreeBuildAuth({ iAm, type, commentModel, obj, canReply, showDel }) {
    const myId = String(iAm.user._id);
    const [comments, relBeforeUpdate] = await Promise.all([
        // Take all object comments
        commentModel.find(
            { obj: obj._id },
            { _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
            { lean: true, sort: { stamp: 1 } }
        ).exec(),
        // Get last user's view time of comments and object and replace it with current time
        // with notification reset if it scheduled
        userObjectRelController.setCommentView(obj._id, iAm.user._id, type),
    ]);

    const commentsTree = [];
    let countTotal = 0;
    let countNew = 0;
    let countDel = 0;

    if (!comments.length) {
        return { tree: commentsTree, users: {}, countTotal, countNew, countDel };
    }

    let previousViewStamp;

    if (relBeforeUpdate) {
        if (relBeforeUpdate.comments) {
            previousViewStamp = relBeforeUpdate.comments.getTime();
        }

        if (relBeforeUpdate.sbscr_noty) {
            // If notification has been scheduled,
            // ask subscribe controller to check if there are notification on other objects
            subscrController.commentViewed(obj._id, iAm.user);
        }
    }

    const dayAgo = Date.now() - dayMS;
    const commentsArr = [];
    const commentsHash = {};
    const usersSet = new Set();
    let latestCid = 0;
    let latestStamp = 0;

    for (const comment of comments) {
        comment.user = String(comment.user);
        usersSet.add(comment.user);
        comment.stamp = comment.stamp.getTime(); // Serve time in ms

        const commentIsMine = comment.user === myId; // It's my comment
        const commentIsDeleted = comment.del !== undefined; // Comment was deleted

        if (commentIsDeleted) {
            comment.delRoot = comment; // At the beginning removed comment considered as a removed root
        }

        if (comment.level === undefined) {
            comment.level = 0;
        }

        if (comment.level > 0) {
            const commentParent = commentsHash[comment.parent];

            // To figure out, is there a current user comment inside removed branch (so he may see this thread),
            // in every child we need to save link to root removed element, while will not current user's comment
            // and in this case mark root removed as saved and drop it children

            if (commentParent === undefined) {
                // If parent doesn't exists in hash, possibly because its in saved branch of removed comments already,
                // but is not root, and therefore already dropped, so we need drop current as well
                if (commentIsDeleted) {
                    countDel++;
                }

                continue;
            }

            if (commentIsDeleted) {
                if (commentParent.del !== undefined) {
                    if (commentParent.delRoot.delSave === true) {
                        countDel++;
                        continue; // If root removed parent has already saved, drop current
                    }

                    comment.delRoot = commentParent.delRoot; // Save link to parent's root

                    if (commentIsMine) {
                        // If it's own current, indicate that root must be saved and drop current
                        comment.delRoot.delSave = true;
                        countDel++;
                        continue;
                    }
                } else if (commentIsMine) {
                    // If it's own root removed comment (no removed parents), save it immediately
                    comment.delRoot.delSave = true;
                }
            }

            if (commentParent.comments === undefined) {
                if (canReply && commentParent.del === undefined && !commentIsDeleted && commentParent.can.del === true) {
                    // If under not removed parent comment we find first child not removed comment,
                    // and user can remove parent (i.e it's his own comment), cancel remove ability,
                    // because user can't remove his own comments with replies
                    delete commentParent.can.del;
                }

                commentParent.comments = [];
            }
        } else if (commentIsDeleted && commentIsMine) {
            // If it's own removed first level comment, immediately save it
            comment.delSave = true;
        }

        if (!commentIsDeleted) {
            countTotal++;

            if (canReply) {
                comment.can = {};

                if (commentIsMine && comment.stamp > dayAgo) {
                    // User can remove its own comment (without replies) or edit its own during twenty-four hours
                    comment.can.edit = comment.can.del = true;
                }
            }

            if (previousViewStamp && !commentIsMine && comment.stamp > previousViewStamp) {
                comment.isnew = true;
                countNew++;
            }

            if (comment.stamp > latestStamp) {
                latestCid = comment.cid;
                latestStamp = comment.stamp;
            }
        }

        commentsHash[comment.cid] = comment;
        commentsArr.push(comment);
    }

    // Set latest comment flag.
    if (latestCid) {
        const latestComment = commentsHash[latestCid];

        latestComment.latest = true;
    }

    const { usersById, usersByLogin } = await getUsersHashForComments(usersSet);

    // Grow comments tree
    for (const comment of commentsArr) {
        if (comment.del !== undefined) {
            if (comment.delRoot.delSave === true) {
                countDel++;
                // Just pass a flag, that comment is removed. Details can be found in the history of changes
                comment.del = true;

                // Don't include deleted comment in response if user doesn't want to see them
                if (!showDel) {
                    continue;
                }

                delete comment.txt; // Removed root comment (closed) pass without a text
                delete comment.frag;
                delete comment.delRoot;
                delete comment.delSave; // Remove delSave, and then its children will not be included in this branch
                delete comment.comments;
            } else {
                if (comment.delRoot.del === true) {
                    countDel++;
                }

                continue;
            }
        }

        comment.user = usersById[comment.user].login;


        if (comment.lastChanged !== undefined) {
            comment.lastChanged = comment.lastChanged.getTime();
        }

        if (comment.level > 0) {
            commentsHash[comment.parent].comments.push(comment);
        } else {
            commentsTree.push(comment);
        }
    }

    return { tree: commentsTree, users: usersByLogin, countTotal, countNew, countDel, latestCid };
}

async function commentsTreeBuildCanModerate({ iAm, type, commentModel, obj, showDel }) {
    const myId = String(iAm.user._id);
    const [comments, relBeforeUpdate, countDel = obj.cdcount] = await Promise.all([
        // Take all object comments
        commentModel.find(
            { obj: obj._id, ...showDel ? { 'del.origin': null } : { del: null } },
            { _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
            { lean: true, sort: { stamp: 1 } }
        ).exec(),
        // Get last user's view time of comments and object and replace it with current time
        // with notification reset if it scheduled
        userObjectRelController.setCommentView(obj._id, iAm.user._id, type),
        // News doesn't contain number of deleted comments, count it dynamically
        type === 'news' ? await commentModel.countDocuments({ obj: obj._id, del: { $exists: true } }).exec() : undefined,
    ]);

    const commentsTree = [];
    let countTotal = 0;
    let countNew = 0;

    if (!comments.length) {
        return { tree: commentsTree, users: {}, countTotal, countNew, countDel };
    }

    const commentsMap = new Map();
    const usersSet = new Set();
    let previousViewStamp;

    if (relBeforeUpdate) {
        if (relBeforeUpdate.comments) {
            previousViewStamp = relBeforeUpdate.comments.getTime();
        }

        if (relBeforeUpdate.sbscr_noty) {
            // If notification has been scheduled,
            // ask subscribe controller to check if there are notification on other objects
            subscrController.commentViewed(obj._id, iAm.user);
        }
    }

    let latestCid = 0;
    let latestStamp = 0;

    for (const comment of comments) {
        if (comment.level === undefined) {
            comment.level = 0;
        }

        if (comment.level > 0) {
            const commentParent = commentsMap.get(comment.parent);

            if (commentParent === undefined || commentParent.del !== undefined) {
                // If parent removed or doesn't exists (eg parent of parent is removed), drop comment
                continue;
            }

            if (commentParent.comments === undefined) {
                commentParent.comments = [];
            }

            commentParent.comments.push(comment);
        } else {
            commentsTree.push(comment);
        }

        comment.user = String(comment.user);
        usersSet.add(comment.user);
        commentsMap.set(comment.cid, comment);

        comment.stamp = comment.stamp.getTime(); // Serve time in ms

        if (comment.lastChanged !== undefined) {
            comment.lastChanged = comment.lastChanged.getTime();
        }

        if (comment.del !== undefined) {
            // Just pass a flag, that comment is removed. Details can be found in the history of changes
            comment.del = true;
            delete comment.txt; // Removed root comment (closed) pass without a text
            delete comment.frag;
            delete comment.comments;
        } else {
            countTotal++;

            if (previousViewStamp && comment.stamp > previousViewStamp && comment.user !== myId) {
                comment.isnew = true;
                countNew++;
            }

            if (comment.stamp > latestStamp) {
                latestCid = comment.cid;
                latestStamp = comment.stamp;
            }
        }
    }

    // Set latest comment flag.
    const latestComment = commentsMap.get(latestCid);

    if (latestComment) {
        latestComment.latest = true;
        commentsMap.set(latestCid, latestComment);
    }

    const { usersById, usersByLogin } = await getUsersHashForComments(usersSet);

    for (const comment of commentsMap.values()) {
        comment.user = usersById[comment.user].login;
    }

    return { tree: commentsTree, users: usersByLogin, countTotal, countNew, countDel, latestCid };
}

async function commentsTreeBuildDel(comment, childs, checkMyId) {
    const commentsMap = new Map();
    const usersSet = new Set();

    // Determine if user is able to see comment branch.
    // If checkMyId is not passed - can,
    // if passed, we will determine if user is author of one of removed comment in the requested branch
    let canSee = !checkMyId;

    // Firstly process removed parent, which was requested
    comment.user = String(comment.user);
    usersSet.add(comment.user);
    commentsMap.set(comment.cid, comment);

    comment.del = { origin: comment.del.origin || undefined };
    comment.stamp = comment.stamp.getTime();
    comment.lastChanged = comment.lastChanged.getTime();

    if (comment.level === undefined) {
        comment.level = 0;
    }

    // If ordinary user is author of removed parent, then immediatly decide that we can see branch
    if (checkMyId && comment.user === checkMyId) {
        canSee = true;
    }

    // Loop by children of removed parent
    for (const child of childs) {
        const commentParent = commentsMap.get(child.parent);

        // If current comment not in hash, means hi is not child of removed parent
        if (commentParent === undefined) {
            continue;
        }

        child.user = String(child.user);
        usersSet.add(child.user);

        if (checkMyId && child.user === checkMyId) {
            canSee = true;
        }

        child.del = { origin: child.del.origin || undefined };
        child.stamp = child.stamp.getTime();
        child.lastChanged = child.lastChanged.getTime();

        if (commentParent.comments === undefined) {
            commentParent.comments = [];
        }

        commentParent.comments.push(child);
        commentsMap.set(child.cid, child);
    }

    // If user who request is not moderator, and not whose comments are inside branch,
    // means that he can't see branch, return 'not exists'
    if (!canSee) {
        throw new NotFoundError(constantsError.COMMENT_DOESNT_EXISTS);
    }

    const { usersById, usersByLogin } = await getUsersHashForComments(usersSet);

    for (const comment of commentsMap.values()) {
        comment.user = usersById[comment.user].login;
    }

    return { tree: [comment], users: usersByLogin };
}

// Prepare users hash for comments
async function getUsersHashForComments(usersSet) {
    const usersById = {};
    const usersByLogin = {};

    if (usersSet.size) {
        const users = await User.find(
            { _id: { $in: [...usersSet] } }, { _id: 1, login: 1, avatar: 1, disp: 1, ranks: 1 }, { lean: true }
        ).exec();

        for (const user of users) {
            if (user.avatar) {
                user.avatar = '/_a/h/' + user.avatar;
            }

            // For speed check directly in hash, without 'isOnline' function
            user.online = session.usLogin.has(user.login);
            usersByLogin[user.login] = usersById[String(user._id)] = user;
            delete user._id;
        }
    }

    return { usersById, usersByLogin };
}

// Simplified comments distribution for anonymous users
async function getCommentsObjAnonym({ cid, type = 'photo' }) {
    let commentModel;
    let obj;

    if (type === 'news') {
        commentModel = CommentN;
        obj = await News.findOne({ cid }, { _id: 1 }).exec();
    } else {
        commentModel = Comment;
        obj = await this.call('photo.find', { query: { cid } });
    }

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    const comments = await commentModel.find(
        { obj: obj._id, del: null },
        { _id: 0, obj: 0, hist: 0, del: 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
        { lean: true, sort: { stamp: 1 } }
    ).exec();

    const usersSet = new Set();

    for (const comment of comments) {
        const userId = String(comment.user);

        usersSet.add(userId);
    }

    let tree;
    let usersById;
    let usersByLogin;
    let latestCid = 0;

    if (usersSet.size) {
        ({ usersById, usersByLogin } = await getUsersHashForComments(usersSet));
        ({ tree, latestCid } = commentsTreeBuildAnonym(comments, usersById));
    }

    return { comments: tree || [], countTotal: comments.length, users: usersByLogin, latestCid };
}

async function getCommentsObjAuth({ cid, type = 'photo', showDel = false }) {
    const { handshake: { usObj: iAm } } = this;

    let obj;
    let commentModel;

    if (type === 'news') {
        commentModel = CommentN;
        obj = await News.findOne({ cid }, { _id: 1, nocomments: 1, cdcount: 1 }).exec();
    } else {
        commentModel = Comment;
        obj = await this.call('photo.find', { query: { cid } });
    }

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    const canModerate = permissions.canModerate(type, obj, iAm);
    const canReply = permissions.canReply(type, obj, iAm);

    const { tree, users, countTotal, countNew, countDel, latestCid } = await (canModerate ?
        // Если это модератор данной фотографии или администратор новости
        commentsTreeBuildCanModerate({ iAm, type, commentModel, obj, showDel }) :
        // Если это зарегистрированный пользователь
        commentsTreeBuildAuth({ iAm, type, commentModel, obj, canReply, showDel })
    );

    return { comments: tree, users, countTotal, countNew, countDel, canModerate, canReply, latestCid };
}

// Select comments for object
async function giveForObj(data) {
    const { handshake: { usObj: iAm } } = this;

    data.cid = Number(data.cid);

    if (!data.cid) {
        throw new BadParamsError();
    }

    const result = await (iAm.registered ? getCommentsObjAuth.call(this, data) : getCommentsObjAnonym.call(this, data));

    result.cid = data.cid;

    return result;
}

// Select branch of removed comments starting from requested
async function giveDelTree({ cid, type = 'photo' }) {
    const { handshake: { usObj: iAm } } = this;

    cid = Number(cid);

    if (!cid || cid < 1) {
        throw new BadParamsError();
    }

    const commentModel = type === 'news' ? CommentN : Comment;

    const { obj: objId, ...comment } = await commentModel.findOne(
        { cid, del: { $exists: true } },
        { _id: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
        { lean: true }
    ).exec() || {};

    if (!objId) {
        throw new NotFoundError(constantsError.COMMENT_DOESNT_EXISTS);
    }

    const [obj, childs] = await Promise.all([
        // Find the object that owns a comment
        type === 'news' ? News.findOne({ _id: objId }, { _id: 1, nocomments: 1 }).exec() :
        this.call('photo.find', { query: { _id: objId } }),
        // Take all removed comments, created after requested and below it
        commentModel.find(
            { obj: objId, del: { $exists: true }, stamp: { $gte: comment.stamp }, level: { $gt: comment.level || 0 } },
            { _id: 0, obj: 0, hist: 0, 'del.reason': 0, geo: 0, r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, __v: 0 },
            { lean: true, sort: { stamp: 1 } }
        ).exec(),
    ]);

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    const canModerate = permissions.canModerate(type, obj, iAm);
    const commentsTree = await commentsTreeBuildDel(
        comment, childs, canModerate ? undefined : String(iAm.user._id)
    );

    return { comments: commentsTree.tree, users: commentsTree.users, cid };
}

// Select comment of user
const photosFields = { _id: 1, cid: 1, title: 1, file: 1, y: 1 };
const photosFieldsForReguser = {
    s: 1,
    mime: 1,
    user: 1,
    ...photosFields,
    ...regionController.regionsAllSelectHash,
};

async function giveForUser({ login, page = 1, type = 'photo', active = true, del = false }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    const usObj = session.getOnline({ login });
    const userId = usObj ? usObj.user._id : await User.getUserID(login);

    if (!userId) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    const canSeeDel = iAm.registered && iAm.user.login === login || iAm.isAdmin;

    if (!canSeeDel && del) {
        throw new AuthorizationError();
    }

    page = (Math.abs(Number(page)) || 1) - 1;

    let comments;
    let countNews;
    let countPhoto;

    const [countActiveP, countActiveN, countDelP = 0, countDelN = 0] = await Promise.all([
        Comment.countDocuments({ user: userId, del: null }).exec(),
        CommentN.countDocuments({ user: userId, del: null }).exec(),
        canSeeDel ? Comment.countDocuments({ user: userId, del: { $exists: true } }).exec() : undefined,
        canSeeDel ? CommentN.countDocuments({ user: userId, del: { $exists: true } }).exec() : undefined,
    ]);

    const countActive = countActiveP + countActiveN;
    const countDel = countDelP + countDelN;

    if (!active && !del) {
        comments = [];
        countNews = countPhoto = 0;
    } else {
        const commentModel = type === 'news' ? CommentN : Comment;
        const query = { user: userId };

        if (active && del) {
            countNews = countActiveN + countDelN;
            countPhoto = countActiveP + countDelP;
        } else if (del) {
            query.del = { $exists: true };
            countNews = countDelN;
            countPhoto = countDelP;
        } else {
            query.del = null;
            countNews = countActiveN;
            countPhoto = countActiveP;
        }

        const fields = { _id: 0, lastChanged: 1, cid: 1, obj: 1, stamp: 1, txt: 1, 'del.origin': 1 };
        const options = { sort: { stamp: -1 }, skip: page * commentsUserPerPage, limit: commentsUserPerPage };

        if (!iAm.registered) {
            comments = await commentModel.find(query, fields, options).lean().exec();
        } else {
            fields.hasChild = 1;
            comments = await commentModel.aggregate([
                {
                    '$match': query,
                },
                {
                    '$lookup': {
                        'from': commentModel.collection.collectionName,
                        'localField': 'cid',
                        'foreignField': 'parent',
                        'as': 'children',
                    },
                },
                {
                    '$addFields': {
                        'hasChild': {
                            $gt: [{ $size: '$children' }, 0],
                        },
                    },
                },
                {
                    '$project': fields,
                },
            ]).sort(options.sort).skip(options.skip).limit(options.limit).exec();
        }
    }

    if (_.isEmpty(comments)) {
        return {
            type, page: page + 1,
            countNews, countPhoto,
            countActive, countDel: canSeeDel ? countDel : undefined,
            perPage: commentsUserPerPage,
            comments: [], objs: {},
        };
    }

    // Make array of unique values of photo _ids
    const objIds = [...comments.reduce((result, { obj }) => result.add(String(obj)), new Set())];
    const objs = await (type === 'news' ?
        News.find(
            { _id: { $in: objIds } }, { _id: 1, cid: 1, title: 1, ccount: 1 }, { lean: true }
        ).exec() :
        Photo.find(
            { _id: { $in: objIds } }, iAm.registered ? photosFieldsForReguser : photosFields, { lean: true }
        ).exec());

    if (_.isEmpty(objs)) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    const objFormattedHashCid = {};
    const objFormattedHashId = {};
    const commentsArrResult = [];

    if (type === 'photo' && iAm.registered) {
        await this.call('photo.fillPhotosProtection', { photos: objs, setMyFlag: true });
    }

    for (const obj of objs) {
        objFormattedHashCid[obj.cid] = objFormattedHashId[obj._id] = obj;
        obj._id = undefined;
        obj.mime = undefined;
        obj.user = undefined;
    }

    // For each comment check object exists and assign to comment its cid
    for (const comment of comments) {
        // Mark those awaiting response.
        comment.waitsAnswer = comment.hasChild !== undefined && !comment.hasChild;

        const obj = objFormattedHashId[comment.obj];

        if (obj !== undefined) {
            comment.obj = obj.cid;
            commentsArrResult.push(comment);
        }
    }

    return {
        type,
        countActive,
        countDel: canSeeDel ? countDel : undefined,
        countNews,
        countPhoto,
        page: page + 1,
        perPage: commentsUserPerPage,
        comments: commentsArrResult,
        objs: objFormattedHashCid,
    };
}

// Take comments
const getComments = (function () {
    const commentSelect = { _id: 0, cid: 1, obj: 1, user: 1, txt: 1 };
    const photosSelectAllRegions = {
        _id: 1, cid: 1, file: 1, title: 1, geo: 1, ...regionController.regionsAllSelectHash,
    };

    return async function (iAm, query, data) {
        const skip = Math.abs(Number(data.skip)) || 0;
        const limit = Math.min(data.limit || 30, 100);
        const options = { lean: true, limit, sort: { stamp: -1 } };
        const photosHash = {};
        const usersHash = {};

        if (skip) {
            options.skip = skip;
        }

        const comments = await Comment.find(query, commentSelect, options).exec();
        const photosArr = [];
        const usersArr = [];

        for (const { obj: photoId, user: userId } of comments) {
            if (photosHash[photoId] === undefined) {
                photosHash[photoId] = true;
                photosArr.push(photoId);
            }

            if (usersHash[userId] === undefined) {
                usersHash[userId] = true;
                usersArr.push(userId);
            }
        }

        const [photos, users] = await Promise.all([
            Photo.find(
                { _id: { $in: photosArr } },
                iAm && iAm.rshortsel ?
                    { _id: 1, cid: 1, file: 1, title: 1, geo: 1, ...iAm.rshortsel } :
                    photosSelectAllRegions,
                { lean: true }
            ).exec(),
            User.find({ _id: { $in: usersArr } }, { _id: 1, login: 1, disp: 1 }, { lean: true }).exec(),
        ]);

        const shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm && iAm.rshortlvls || undefined);
        const photoFormattedHash = {};
        const userFormattedHash = {};

        // rs - Regions array for short view
        for (const { _id: PhotoId, cid, file, title, rs } of photos) {
            photoFormattedHash[cid] = photosHash[PhotoId] = { cid, file, title, rs };
        }

        for (const { _id, login, disp } of users) {
            userFormattedHash[login] = usersHash[_id] = { login, disp, online: session.usLogin.has(login) };
        }

        for (const comment of comments) {
            comment.obj = photosHash[comment.obj].cid;
            comment.user = usersHash[comment.user].login;
        }

        return { comments, users: userFormattedHash, photos: photoFormattedHash, regions: shortRegionsHash };
    };
}());

// Take last comments of public photos
const giveForFeed = (function () {
    const globalOptions = { limit: 30 };
    const globalFeed = Utils.memoizePromise(
        () => getComments(undefined, { s: 5, del: null }, globalOptions), ms('10s')
    );

    return function (params) {
        const { handshake: { usObj: iAm } } = this;

        if (_.isEmpty(iAm.rquery) && !iAm.photoFilterTypes.length &&
            (!params.limit || params.limit === globalOptions.limit)) {
            // User without region and types filter will get memozed result for global selection
            return globalFeed();
        }

        const query = { s: 5, del: null, ...iAm.rquery, ...iAm.photoFilterQuery };

        return getComments(iAm, query, params);
    };
}());

// Create comment
async function create(data) {
    const { socket, handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data) || !Number(data.obj) || !data.txt || data.level > 9) {
        throw new BadParamsError();
    }

    if (data.txt.length > commentMaxLength) {
        throw new InputError(constantsError.COMMENT_TOO_LONG);
    }

    const fragAdded = data.type === 'photo' && !data.frag && _.isObject(data.fragObj);
    const CommentModel = data.type === 'news' ? CommentN : Comment;
    const objCid = Number(data.obj);
    const stamp = new Date();

    const [obj, parent] = await Promise.all([
        data.type === 'news' ? News.findOne({ cid: objCid }, { _id: 1, ccount: 1, nocomments: 1 }).exec() :
        this.call('photo.find', { query: { cid: objCid } }),
        data.parent ? CommentModel.findOne({ cid: data.parent }, { _id: 0, level: 1, del: 1 }, { lean: true }).exec() :
        null,
    ]);

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    if (!permissions.canReply(data.type, obj, iAm)) {
        throw obj.nocomments ? new NoticeError(constantsError.COMMENT_NOT_ALLOWED) : new AuthorizationError();
    }

    if (data.parent && (!parent || parent.del || parent.level >= 9 || data.level !== parent.level + 1)) {
        throw new NoticeError(constantsError.COMMENT_WRONG_PARENT);
    }

    const { next: cid } = await Counter.increment('comment');

    if (!cid) {
        throw new ApplicationError(constantsError.COUNTER_ERROR);
    }

    const comment = { cid, obj, user: iAm.user, stamp, txt: Utils.inputIncomingParse(data.txt).result, del: undefined };

    // If it comment for photo, assign photo's regions to it
    if (data.type === 'photo') {
        comment.s = obj.s;
        comment.type = obj.type;

        if (obj.geo) {
            comment.geo = obj.geo;
        }

        for (let i = 0; i <= maxRegionLevel; i++) {
            comment['r' + i] = obj['r' + i] || undefined;
        }
    }

    comment.level = data.level ?? 0;

    if (data.parent) {
        comment.parent = data.parent;
        comment.level = data.level ?? parent.level + 1;
    }

    if (fragAdded) {
        comment.frag = true;
    }

    await new CommentModel(comment).save();

    let frag;

    if (fragAdded) {
        if (!obj.frags) {
            obj.frags = [];
        }

        frag = {
            cid,
            l: Utils.math.toPrecision(Number(data.fragObj.l) || 0, 2),
            t: Utils.math.toPrecision(Number(data.fragObj.t) || 0, 2),
            w: Utils.math.toPrecision(Number(data.fragObj.w) || 20, 2),
            h: Utils.math.toPrecision(Number(data.fragObj.h) || 15, 2),
        };
        obj.frags.push(frag);
    }

    if (data.type === 'photo') {
        regionController.putPhotoToRegionStatQueue(obj);
    }

    obj.ccount = (obj.ccount || 0) + 1;

    const promises = [obj.save()];

    iAm.user.ccount += 1;
    promises.push(iAm.user.save());
    promises.push(userObjectRelController.onCommentAdd(obj._id, iAm.user._id, data.type));

    await Promise.all(promises);

    comment.user = iAm.user.login;
    comment.obj = objCid;
    comment.can = {};

    session.emitUser({ usObj: iAm, excludeSocket: socket });
    subscrController.commentAdded(obj._id, iAm.user, stamp);

    return { comment, frag };
}

/**
 * Remove comment and its children
 *
 * @param {object} data
 */
async function remove(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data) || !Number(data.cid) || !data.reason || !Number(data.reason.cid) && !data.reason.desc) {
        throw new BadParamsError();
    }

    const cid = Number(data.cid);
    const commentModel = data.type === 'news' ? CommentN : Comment;

    const comment = await commentModel.findOne(
        { cid, del: null }, { _id: 1, obj: 1, user: 1, stamp: 1 }, { lean: true }
    ).exec();

    if (!comment) {
        throw new NotFoundError(constantsError.COMMENT_DOESNT_EXISTS);
    }

    const obj = await (data.type === 'news' ?
        News.findOne({ _id: comment.obj }, { _id: 1, ccount: 1, nocomments: 1 }).exec() :
        this.call('photo.find', { query: { _id: comment.obj } })
    );

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    // Count amout of unremoved children
    const childCount = await commentModel.countDocuments({ obj: obj._id, parent: cid, del: null }).exec();

    // Regular user can remove if there no unremoved comments and it's his own fresh comment
    const canEdit = !childCount && permissions.canEdit(comment, data.type, obj, iAm);
    let canModerate;

    if (!canEdit) {
        // Otherwise moderation rights needed
        canModerate = permissions.canModerate(data.type, obj, iAm);

        if (!canModerate) {
            throw obj.nocomments ? new NoticeError(constantsError.COMMENT_NOT_ALLOWED) : new AuthorizationError();
        }
    }

    // Find all unremoved comments of this object which below of current level and created after it
    // Among them we'll find directly descendants of removing
    const children = childCount ? await commentModel.find(
        { obj: obj._id, del: null, stamp: { $gte: comment.stamp }, level: { $gt: comment.level || 0 } },
        { _id: 0, obj: 0, txt: 0, hist: 0 },
        { lean: true, sort: { stamp: 1 } }
    ).exec() : [];

    const childsCids = [];
    const commentsForRelArr = [];
    const commentsSet = new Set();
    const usersCountMap = new Map();
    const delInfo = { user: iAm.user._id, stamp: new Date(), reason: {} };

    comment.user = String(comment.user); // For Map key

    // Substruct it from public statistic
    usersCountMap.set(comment.user, 1);
    commentsForRelArr.push(comment);

    // Find directly descendants of removing comment by filling commentsSet
    commentsSet.add(cid);

    for (const child of children) {
        child.user = String(child.user);

        if (child.level && commentsSet.has(child.parent) && !child.del) {
            usersCountMap.set(child.user, (usersCountMap.get(child.user) || 0) + 1);
            commentsForRelArr.push(child);
            childsCids.push(child.cid);
            commentsSet.add(child.cid);
        }
    }

    // If moderator/administrator role was used, track it for this moment
    if (canModerate && iAm.user.role) {
        delInfo.role = iAm.user.role;

        // In case of region moderator 'permissions.canModerate' returns 'cid' of region
        if (iAm.isModerator && _.isNumber(canModerate)) {
            delInfo.roleregion = canModerate;
        }
    }

    if (Number(data.reason.cid)) {
        delInfo.reason.cid = Number(data.reason.cid);
    }

    if (data.reason.desc) {
        delInfo.reason.desc = Utils.inputIncomingParse(data.reason.desc).result;
    }

    await commentModel.updateOne({ cid }, { $set: { lastChanged: delInfo.stamp, del: delInfo } }).exec();

    const countCommentsRemoved = (childsCids.length || 0) + 1;

    if (childsCids.length) {
        const delInfoChilds = Object.assign(_.omit(delInfo, 'reason'), { origin: cid });

        await commentModel.updateMany(
            { cid: { $in: childsCids } },
            { $set: { lastChanged: delInfo.stamp, del: delInfoChilds } }
        ).exec();
    }

    let frags = obj.frags && obj.frags.toObject();
    let frag;

    if (!_.isEmpty(frags)) {
        for (frag of frags) {
            if (commentsSet.has(frag.cid)) {
                obj.frags.id(frag._id).del = true;
            }
        }
    }

    if (data.type === 'photo') {
        regionController.putPhotoToRegionStatQueue(obj);
    }

    obj.ccount = (obj.ccount || 0) - countCommentsRemoved;
    obj.cdcount = (obj.cdcount || 0) + countCommentsRemoved;

    const promises = [obj.save()];

    for (const [userId, count] of usersCountMap) {
        const userObj = session.getOnline({ userId });

        if (userObj !== undefined) {
            userObj.user.ccount = userObj.user.ccount - count;
            promises.push(session.saveEmitUser({ usObj: userObj }));
        } else {
            promises.push(User.updateOne({ _id: userId }, { $inc: { ccount: -count } }).exec());
        }
    }

    if (commentsForRelArr.length) {
        promises.push(userObjectRelController.onCommentsRemove(obj._id, commentsForRelArr, data.type));
    }

    await Promise.all(promises);

    // Pass to client only fragments of unremoved comments, for replacement on client
    if (obj.frags) {
        obj.frags = obj.frags.toObject();

        frags = [];

        for (frag of obj.frags) {
            if (!frag.del) {
                frags.push(frag);
            }
        }
    } else {
        frags = undefined;
    }

    actionLogController.logIt(
        iAm.user,
        comment._id,
        actionLogController.OBJTYPES.COMMENT,
        actionLogController.TYPES.REMOVE,
        delInfo.stamp,
        delInfo.reason,
        delInfo.roleregion,
        childsCids.length ? { childs: childsCids.length } : undefined
    );

    return {
        frags,
        delInfo,
        stamp: delInfo.stamp.getTime(),
        countUsers: usersCountMap.size,
        countComments: countCommentsRemoved,
        myCountComments: usersCountMap.get(String(iAm.user._id)) || 0, // Number of my removed comments
    };
}

// Restore comment and its descendants
async function restore({ cid, type }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    cid = Number(cid);

    if (!cid) {
        throw new BadParamsError();
    }

    const commentModel = type === 'news' ? CommentN : Comment;
    const comment = await commentModel.findOne(
        { cid, del: { $exists: true } }, { _id: 1, obj: 1, user: 1, stamp: 1, del: 1 }, { lean: true }
    ).exec();

    if (!comment) {
        throw new NotFoundError(constantsError.COMMENT_DOESNT_EXISTS);
    }

    const obj = await (type === 'news' ?
        News.findOne({ _id: comment.obj }, { _id: 1, ccount: 1, nocomments: 1 }).exec() :
        this.call('photo.find', { query: { _id: comment.obj } })
    );

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    const canModerate = permissions.canModerate(type, obj, iAm);

    if (!canModerate) {
        throw new AuthorizationError();
    }

    // Find all comments directly descendants to restoring, which were deleted with it,
    // eg theirs 'origin' refers to the current
    const children = await commentModel.find(
        { obj: obj._id, 'del.origin': cid }, { _id: 0, obj: 0, txt: 0, hist: 0 }, { lean: true, sort: { stamp: 1 } }
    ).exec();

    const stamp = new Date();
    const commentsForRelArr = [];
    const usersCountMap = new Map();
    const commentsCidSet = new Set();

    comment.user = String(comment.user); // For Map key

    commentsCidSet.add(cid);
    usersCountMap.set(comment.user, 1);
    commentsForRelArr.push(comment);

    const childsCids = [];

    // Loop by children for restoring comment
    for (const child of children) {
        child.user = String(child.user);

        usersCountMap.set(child.user, (usersCountMap.get(child.user) || 0) + 1);
        commentsForRelArr.push(child);

        childsCids.push(child.cid);
        commentsCidSet.add(child.cid);
    }

    const hist = [
        Object.assign(_.omit(comment.del, 'origin'), { del: { reason: comment.del.reason } }),
        { user: iAm.user._id, stamp, restore: true, role: iAm.user.role },
    ];

    if (iAm.isModerator && _.isNumber(canModerate)) {
        hist[1].roleregion = canModerate;
    }

    await commentModel.updateOne(
        { cid }, { $set: { lastChanged: stamp }, $unset: { del: 1 }, $push: { hist: { $each: hist } } }
    ).exec();

    if (childsCids.length) {
        const histChilds = [
            Object.assign(_.omit(comment.del, 'reason'), { del: { origin: cid } }),
            { user: iAm.user._id, stamp, restore: true, role: iAm.user.role },
        ];

        if (iAm.isModerator && _.isNumber(canModerate)) {
            histChilds[1].roleregion = canModerate;
        }

        await commentModel.updateMany({ obj: obj._id, 'del.origin': cid }, {
            $set: { lastChanged: stamp },
            $unset: { del: 1 },
            $push: { hist: { $each: histChilds } },
        }).exec();
    }

    let frags = obj.frags && obj.frags.toObject();
    let frag;

    if (!_.isEmpty(frags)) {
        for (frag of frags) {
            if (commentsCidSet.has(frag.cid)) {
                obj.frags.id(frag._id).del = undefined;
            }
        }
    }

    const countCommentsRestored = children.length + 1;

    if (type === 'photo') {
        regionController.putPhotoToRegionStatQueue(obj);
    }

    obj.ccount = (obj.ccount || 0) + countCommentsRestored;
    obj.cdcount = (obj.cdcount || 0) - countCommentsRestored;

    const promises = [obj.save()];

    for (const [userId, ccount] of usersCountMap) {
        const userObj = session.getOnline({ userId });

        if (userObj !== undefined) {
            userObj.user.ccount = userObj.user.ccount + ccount;
            promises.push(session.saveEmitUser({ usObj: userObj }));
        } else {
            promises.push(User.updateOne({ _id: userId }, { $inc: { ccount } }).exec());
        }
    }

    if (commentsForRelArr.length) {
        promises.push(userObjectRelController.onCommentsRestore(obj._id, commentsForRelArr, type));
    }

    await Promise.all(promises);

    // Pass to client only fragments of unremoved comments, for replacement on client
    if (obj.frags) {
        obj.frags = obj.frags.toObject();

        frags = [];

        for (frag of obj.frags) {
            if (!frag.del) {
                frags.push(frag);
            }
        }
    } else {
        frags = undefined;
    }

    actionLogController.logIt(
        iAm.user,
        comment._id,
        actionLogController.OBJTYPES.COMMENT,
        actionLogController.TYPES.RESTORE,
        stamp,
        undefined,
        iAm.isModerator && _.isNumber(canModerate) ? canModerate : undefined,
        childsCids.length ? { childs: childsCids.length } : undefined
    );

    return {
        frags,
        stamp: stamp.getTime(),
        countUsers: usersCountMap.size,
        countComments: countCommentsRestored,
        myCountComments: usersCountMap.has(String(iAm.user._id)),
    };
}

// Edit comment
async function update(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    const cid = Number(data.cid);

    if (!data.obj || !cid || !data.txt) {
        throw new BadParamsError();
    }

    if (data.txt.length > commentMaxLength) {
        throw new InputError(constantsError.COMMENT_TOO_LONG);
    }

    const [obj, comment] = await Promise.all(data.type === 'news' ? [
        News.findOne({ cid: data.obj }, { cid: 1, frags: 1, nocomments: 1 }).exec(),
        CommentN.findOne({ cid }).exec(),
    ] : [
        this.call('photo.find', { query: { cid: data.obj } }),
        Comment.findOne({ cid }).exec(),
    ]);

    if (!comment || !obj || data.obj !== obj.cid) {
        throw new NotFoundError(constantsError.COMMENT_DOESNT_EXISTS);
    }

    const hist = { user: iAm.user };

    // Ability to edit as regular user, if it' own comment younger than day
    const canEdit = permissions.canEdit(comment, data.type, obj, iAm);
    let canModerate;

    if (!canEdit) {
        // В противном случае нужны права модератора/администратора
        canModerate = permissions.canModerate(data.type, obj, iAm);

        if (!canModerate) {
            throw obj.nocomments ? new NoticeError(constantsError.COMMENT_NOT_ALLOWED) : new AuthorizationError();
        }
    }

    const parsedResult = Utils.inputIncomingParse(data.txt);
    const content = parsedResult.result;
    let fragChangedType;
    let txtChanged;

    const fragExists = _.find(obj.frags, { cid: comment.cid });

    const fragRecieved = data.type === 'photo' && data.fragObj && {
        cid: comment.cid,
        l: Utils.math.toPrecision(Number(data.fragObj.l) || 0, 2),
        t: Utils.math.toPrecision(Number(data.fragObj.t) || 0, 2),
        w: Utils.math.toPrecision(Number(data.fragObj.w) || 20, 2),
        h: Utils.math.toPrecision(Number(data.fragObj.h) || 15, 2),
    };

    if (fragRecieved) {
        if (!fragExists) {
            // If fragment was received and had not had exist before, simply append it
            fragChangedType = 1;
            comment.frag = true;
            obj.frags = obj.frags || [];
            obj.frags.push(fragRecieved);
        } else if (fragRecieved.l !== fragExists.l || fragRecieved.t !== fragExists.t ||
            fragRecieved.w !== fragExists.w || fragRecieved.h !== fragExists.h) {
            // If fragment was received and had had exist before, but something changed in it,
            // then remove old and append new one
            fragChangedType = 2;
            obj.frags = obj.frags || [];
            obj.frags.pull(fragExists._id);
            obj.frags.push(fragRecieved);
        }
    } else if (fragExists) {
        // If fragment wasn't recieved, but it had had exist before, simply remove it
        fragChangedType = 3;
        comment.frag = undefined;
        obj.frags = obj.frags || [];
        obj.frags.pull(fragExists._id);
    }

    if (content !== comment.txt) {
        // Save current text (before edit) to history object
        hist.txt = comment.txt;
        // Get formatted difference of current and new tests (unformatted) and save to history object
        hist.txtd = Utils.txtdiff(Utils.txtHtmlToPlain(comment.txt), parsedResult.plain);
        txtChanged = true;
    }

    if (txtChanged || fragChangedType) {
        hist.frag = fragChangedType || undefined;

        if (canModerate && iAm.user.role) {
            // If moderator/administrator role was used for editing, save it on the moment of editing
            hist.role = iAm.user.role;

            if (iAm.isModerator && _.isNumber(canModerate)) {
                hist.roleregion = canModerate; // In case of moderator 'permissions.canModerate' returns role cid
            }
        }

        comment.hist.push(hist);
        comment.lastChanged = new Date();
        comment.txt = content;

        await Promise.all([comment.save(), fragChangedType ? obj.save() : null]);
    }

    return { comment: comment.toObject({ transform: commentDeleteHist }), frag: fragRecieved };
}
function commentDeleteHist(doc, ret/* , options */) {
    delete ret.hist;
}

/**
 * Returns the history of comment's editing
 * Stored by lines in db. Each line contains one event
 * Event can contain 2 indicator: change of text or(and) fragment.
 * Event contains previous text, eg it was written in comment at another time (at the time of another event), but
 * flag about changing of fragment refers to exactly this event.
 * Therefore, one line contains events from 2 different times.
 * To show it in readable view to user,
 * we need move changed text to the time of previous text change,
 * and current event show only if it contains fragment's change
 * or in next steps will be text change and it will move to time of this event.
 * In other words event really will be shoed,
 * if it contains a fragment's change or text modification in another event in the future
 */
async function giveHist({ cid, type = 'photo' }) {
    cid = Number(cid);

    if (!cid) {
        throw new BadParamsError();
    }

    const commentModel = type === 'news' ? CommentN : Comment;

    const comment = await commentModel.findOne(
        { cid }, { _id: 0, user: 1, txt: 1, txtd: 1, stamp: 1, hist: 1, del: 1 }, { lean: true }
    ).populate({ path: 'user hist.user del.user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } }).exec();

    if (!comment) {
        throw new NotFoundError(constantsError.COMMENT_DOESNT_EXISTS);
    }

    const result = [];
    const hists = comment.hist || [];

    // First record about text changing will be equal to comment creation
    let lastTxtObj = { user: comment.user, stamp: comment.stamp };
    let lastTxtIndex = 0; // Position of last text change in events stack

    const getregion = function (regionId) {
        if (regionId) {
            let result = regionController.getRegionsHashFromCache([regionId])[regionId];

            if (result) {
                result = _.omit(result, '_id', 'parents');
            }

            return result;
        }
    };

    if (comment.del) {
        hists.push({
            user: comment.del.user,
            stamp: comment.del.stamp,
            del: _.pick(comment.del, 'reason', 'origin'),
            role: comment.del.role,
            roleregion: comment.del.roleregion,
        });
    }

    for (let i = 0; i < hists.length; i++) {
        const hist = hists[i];
        const histDel = hist.del;

        if (hist.role && hist.roleregion) {
            hist.roleregion = getregion(hist.roleregion);
        }

        if (histDel || hist.restore) {
            if (histDel && histDel.reason && histDel.reason.cid) {
                histDel.reason.title = giveReasonTitle({ cid: histDel.reason.cid });
            }

            result.push(hist);
        } else {
            if (hist.txt) {
                lastTxtObj.txt = hist.txt; // If text exists, put it to previous record, which changed the text

                if (!lastTxtObj.frag) {
                    // If in those record had no fragment, means record was not append and need to append
                    result.splice(lastTxtIndex, 0, lastTxtObj);
                }

                delete hist.txt; // Remove text from this event and it will be waiting next text changing
                lastTxtIndex = result.length;
                lastTxtObj = hist;
            }

            // If record contains fragment change, append it
            if (hist.frag) {
                result.push(hist);
            }
        }

        // If it was last record (in case of current removal - penultimate) in history
        // and there was text changing earlier,
        // then need to append current text of comment in this last record of text change
        if (i === hists.length - 1 && lastTxtIndex > 0) {
            lastTxtObj.txt = comment.txt;

            if (!lastTxtObj.frag) {
                result.splice(lastTxtIndex, 0, lastTxtObj);
            }
        }
    }

    return { hists: result };
}

// Toggle ability to write comments for object (except administrators)
async function setNoComments({ cid, type = 'photo', val: nocomments }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered || !iAm.user.role) {
        throw new AuthorizationError();
    }

    cid = Number(cid);

    if (!cid) {
        throw new BadParamsError();
    }

    const obj = await (type === 'news' ? News.findOne({ cid }).exec() : this.call('photo.find', { query: { cid } }));

    if (!obj) {
        throw new NotFoundError(constantsError.COMMENT_NO_OBJECT);
    }

    const canModerate = permissions.canModerate(type, obj, iAm);

    if (!canModerate) {
        throw new AuthorizationError();
    }

    let oldPhotoObj;

    if (type === 'photo') {
        oldPhotoObj = obj.toObject();
        obj.cdate = new Date();
    }

    obj.nocomments = nocomments ? true : undefined;
    await obj.save();

    if (type === 'photo') {
        // Save previous value of 'nocomments' in history
        obj.nocomments = !!obj.nocomments; // To set false in history instead of undefined
        await this.call('photo.saveHistory', { oldPhotoObj, photo: obj, canModerate });
    }

    return { nocomments: obj.nocomments };
}

export async function changeObjCommentsStatus({ obj: { _id: objId, s } }) {
    const { n: count = 0 } = await Comment.updateMany({ obj: objId }, { $set: { s } }).exec();

    return count;
}

/**
 * Hide/show object comments (so doing them unpublic/public). Temporary not in use, because count all photo statuses
 *
 * @param {object} obj
 * @param {object} obj.obj
 * @param {boolean} obj.hide
 */
export async function changeObjCommentsVisibility({ obj, hide }) {
    const count = changeObjCommentsStatus(obj);

    if (count === 0) {
        return { myCount: 0 };
    }

    const { handshake: { usObj: iAm } } = this; // iAm for count how many comments of user are affected
    const comments = await Comment.find({ obj: obj._id }, {}, { lean: true }).exec();

    const usersCountMap = _.transform(comments, (result, comment) => {
        if (comment.del === undefined) {
            const userId = String(comment.user);

            result.set(userId, (result.get(userId) || 0) + 1);
        }
    }, new Map());

    for (const [userId, ccount] of usersCountMap) {
        const cdelta = hide ? -ccount : ccount;
        const userObj = session.getOnline({ userId });

        if (userObj !== undefined) {
            userObj.user.ccount = userObj.user.ccount + cdelta;
            session.saveEmitUser({ usObj: userObj });
        } else {
            User.updateOne({ _id: userId }, { $inc: { ccount: cdelta } }).exec();
        }
    }

    return { myCount: usersCountMap.get(String(iAm.user._id)) || 0 };
}

/**
 * Change photo's comments type
 *
 * @param {object} obj
 * @param {object} obj.photo
 * @param {ObjectId} obj.photo._id
 * @param {number} obj.photo.type
 */
export async function changePhotoCommentsType({ photo: { _id: objId, type } }) {
    const command = { $set: { type } };

    const { n: count = 0 } = await Comment.updateMany({ obj: objId }, command).exec();

    return { count };
}

create.isPublic = true;
update.isPublic = true;
remove.isPublic = true;
restore.isPublic = true;
giveHist.isPublic = true;
giveForObj.isPublic = true;
giveForFeed.isPublic = true;
giveForUser.isPublic = true;
giveDelTree.isPublic = true;
setNoComments.isPublic = true;

export default {
    create,
    update,
    remove,
    restore,
    giveHist,
    giveForObj,
    giveForFeed,
    giveForUser,
    giveDelTree,
    setNoComments,

    changeObjCommentsStatus,
    changeObjCommentsVisibility,
    changePhotoCommentsType,
};
