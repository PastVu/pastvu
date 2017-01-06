import _ from 'lodash';
import log4js from 'log4js';

import { UserObjectRel } from '../models/UserStates';
import { Comment, CommentN } from '../models/Comment';

const logger = log4js.getLogger('userobjectrel.js');

/**
 * Find number of new comments for array of objects for user
 * @param objIds Array of _ids of objects
 * @param userId
 * @param {string} [type=photo] Object type
 * @param {Array|Object} [rels] Already selected rows (for example when serve user subscription)
 */
export async function getViewCommentsRel(objIds, userId, type = 'photo', rels) {
    if (!rels) {
        rels = await UserObjectRel.find(
            { obj: { $in: objIds }, user: userId, type },
            { _id: 0, obj: 1, view: 1, ccount_new: 1, sbscr_create: 1 },
            { lean: true }
        ).exec();
    } else if (!Array.isArray(rels)) {
        rels = [rels];
    }

    return _.transform(rels, (result, rel) => {
        const res = { view: rel.view, ccount_new: rel.ccount_new };

        if (rel.sbscr_create) {
            res.subscr = true;
        }

        result[rel.obj] = res;
    }, {});
}

/**
 * Fill for every object in transferred array number of new comments - field 'ccount_new'
 * And flag 'changed', if 'ucdate' has changed since last object view
 * Eg mutate transferred objects
 * @param objs Array of objects
 * @param userId
 * @param {string} [type=photo] Object type
 * @param [rels]
 */
export async function fillObjectByRels(objs, userId, type = 'photo', rels) {
    const single = !Array.isArray(objs);

    if (single) {
        objs = [objs];
    }

    // Make array of _ids of objects
    const objIds = objs.map(obj => obj._id);

    const relHash = await getViewCommentsRel(objIds, userId, type, rels);

    for (const obj of objs) {
        const rel = relHash[obj._id];

        if (rel !== undefined) {
            if (rel.view) {
                obj.vdate = rel.view;

                if (obj.ucdate && obj.ucdate > rel.view) {
                    obj.changed = true;
                }
            }
            if (rel.subscr) {
                obj.subscr = true;
            }
            if (rel.ccount_new) {
                obj.ccount_new = rel.ccount_new;
            }
        }
    }

    return single ? objs[0] : objs;
}

/**
 * Record time of last object view by user
 * @param objId
 * @param userId
 * @param {string} [type=photo] Object type
 */
export function setObjectView(objId, userId, type = 'photo') {
    return UserObjectRel.findOneAndUpdate(
        { obj: objId, user: userId, type },
        { $set: { view: new Date() } },
        { upsert: true, new: true, lean: true, fields: { _id: 0 } }
    ).exec();
}

/**
 * Record time of last comments view on object by user
 * @param objId
 * @param userId
 * @param {string} [type=photo] Object type
 * @param {Date} [stamp=new Date()]
 */
export async function setCommentView(objId, userId, type = 'photo', stamp = new Date()) {
    const query = { obj: objId, user: userId, type };

    const relBeforeUpdate = await UserObjectRel.findOne(
        query, { _id: 0, obj: 0, user: 0, type: 0 }, { lean: true }
    ).exec();

    const update = { $set: { comments: stamp } };

    if (relBeforeUpdate) {
        // Reset number of new comments
        update.$unset = { ccount_new: 1 };

        if (relBeforeUpdate.sbscr_noty) {
            // If time of next notification send was setted, reset it
            update.$unset.sbscr_noty = 1;
            update.$set.sbscr_noty_change = stamp;
        }
    }

    await UserObjectRel.update(query, update, { upsert: true }).exec();

    return relBeforeUpdate;
}

/**
 * Increase new comments counter of users, who saw comments of this object, when new comment added
 * @param objId
 * @param userId
 * @param {string} [type=photo] Object type
 */
export async function onCommentAdd(objId, userId, type = 'photo') {
    const { n: count = 0 } = await UserObjectRel.update(
        { obj: objId, comments: { $exists: true }, user: { $ne: userId }, type },
        { $inc: { ccount_new: 1 } },
        { multi: true }
    ).exec();

    return count;
}

/**
 * When remove comments, decrease number of new comments of users,
 * who had read object comments before creation of last comment of removed
 * @param objId
 * @param {Array} comments Comments array
 * @param {string} [type=photo] Object type
 */
export async function onCommentsRemove(objId, comments, type = 'photo') {
    if (_.isEmpty(comments)) {
        return;
    }

    const lastCommentStamp = _.last(comments).stamp;

    // For each user, who had read object comments before creation of last comment of removed,
    // need to individually count how many of removed is new for him and not his own, and decrease by that quantity
    const rels = await UserObjectRel.find(
        { obj: objId, comments: { $lte: lastCommentStamp }, ccount_new: { $gt: 0 }, type },
        { _id: 1, user: 1, comments: 1, ccount_new: 1 },
        { lean: true }
    ).exec();

    if (_.isEmpty(rels)) {
        return 0;
    }

    // For each relation how many comments have been written after last visit,
    // and subtract them from quantity of new in this relation
    const updates = rels.reduce((result, rel) => {
        const commentsView = rel.comments;
        let newDeltaCount = comments.reduce((result, comment) => {
            if (comment.stamp > commentsView && !rel.user.equals(comment.user)) {
                result++;
            }
            return result;
        }, 0);

        if (newDeltaCount) {
            if (newDeltaCount > rel.ccount_new) {
                logger.warn(
                    `Try to decrease more new comments count due to comments removal,`,
                    `then they where calculated, objId: ${objId}, rel: ${rel._id}`
                );
                newDeltaCount = rel.ccount_new;
            }

            // Update specific rel, but just in case но на всякий случае specify maximum time of comments view,
            // on which we compute, in case while we compete user read comments again
            result.push(UserObjectRel.update(
                { _id: rel._id, comments: { $lte: lastCommentStamp } },
                { $inc: { ccount_new: -newDeltaCount } }
            ).exec());
        }

        return result;
    }, []);

    if (updates.length) {
        return (await Promise.all(updates)).reduce((result, { n: count = 0 }) => result + count, 0);
    }

    return 0;
}

/**
 * When restore deleted comments, increase new comments counter of users,
 * who had read object comments before creation of last of restored comments
 * @param objId
 * @param {Array} comments Comments array
 * @param {string} [type=photo] Object type
 */
export async function onCommentsRestore(objId, comments, type = 'photo') {
    if (_.isEmpty(comments)) {
        return;
    }

    const lastCommentStamp = _.last(comments).stamp;

    // For every user, who had read objects comment before the date of last of restored comment,
    // need to individually count how many of them is new for him and not his own, and increase by that quantity
    const rels = await UserObjectRel.find(
        { obj: objId, comments: { $lte: lastCommentStamp }, type },
        { _id: 1, user: 1, comments: 1 },
        { lean: true }
    ).exec();

    if (_.isEmpty(rels)) {
        return 0;
    }

    // For each of relations find how many removed comments have been written after last user vist,
    // and subtract them from new quantity in this relation
    const updates = rels.reduce((result, rel) => {
        const commentsView = rel.comments;
        const newDeltaCount = comments.reduce((result, comment) => {
            if (comment.stamp > commentsView && !rel.user.equals(comment.user)) {
                result++;
            }
            return result;
        }, 0);

        if (newDeltaCount) {
            result.push(UserObjectRel.update(
                // Обновляем конкретный rel, но на всякий случае указываем максимальное время просмотра комментариев,
                // по которому мы считали, на случай, если пока мы считали пользователь опять посмотрел комментарии
                { _id: rel._id, comments: { $lte: lastCommentStamp } },
                { $inc: { ccount_new: newDeltaCount } }
            ).exec());
        }

        return result;
    }, []);

    if (updates.length) {
        return (await Promise.all(updates)).reduce((result, { n: count = 0 }) => result + count, 0);
    }

    return 0;
}

/**
 * Find quantity of new comments for build notification letter for user
 * @param objs Array of _id of object
 * @param relHash
 * @param userId
 * @param {string} [type=photo] Object type
 */
export async function getNewCommentsBrief(objs, relHash, userId, type = 'photo') {
    if (_.isEmpty(objs)) {
        return [];
    }

    const commentModel = type === 'news' ? CommentN : Comment;
    const objsCommentsIds = [];
    const promises = [];

    // For each object select comments with time of last view of comments of subscription
    for (const obj of objs) {
        const objId = obj._id;
        const rel = relHash[objId];
        const commentFrom = rel && (rel.comments || rel.sbscr_noty_change || rel.sbscr_create);

        if (!commentFrom) {
            continue;
        }

        objsCommentsIds.push(objId);
        promises.push(
            commentModel.find(
                { obj: objId, del: null, stamp: { $gt: commentFrom }, user: { $ne: userId } },
                { _id: 0, obj: 1, user: 1, stamp: 1 },
                { lean: true, sort: { stamp: 1 } }
            ).populate({ path: 'user', select: { _id: 0, login: 1, disp: 1 } }).exec()
        );
    }

    const objComments = await Promise.all(promises);

    const briefsHash = objComments.reduce((result, comments, index) => {
        const objId = objsCommentsIds[index];

        result[objId] = comments.reduce((brief, comment) => {
            if (comment.stamp >= relHash[objId].sbscr_noty_change) {
                brief.newest++;
                brief.users[comment.user.login] = comment.user.disp;
            }

            return brief;
        }, { unread: comments.length, newest: 0, users: {} });

        return result;
    }, {});

    // Assign to each object its brief
    return _.forEach(objs, obj => {
        obj.brief = briefsHash[obj._id];
    });
}