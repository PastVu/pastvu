/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { User, UserConfirm } from '../models/User';
import { Photo } from '../models/Photo';
import auth from '../controllers/auth';
import * as session from '../controllers/_session';

/**
 * Create test user using auth controller for consistency.
 *
 * @param {object} obj
 * @param {object} obj.login
 * @param {object} obj.pass Optional password, set to login if not specified.
 * @param {object} obj.confirmUser
 * @returns {object} user
 */
async function createUser({ login, pass = '', confirmUser = true }) {
    pass = pass || login;

    const data = { login, 'email': login + '@test.me', pass, 'pass2': pass };

    await auth.register(data);

    const user = await User.findOne({ 'login': data.login });

    if (confirmUser) {
        const { key } = await UserConfirm.findOne({ 'user': user._id });

        await auth.checkConfirm({ key });
    }

    return user;
}

/**
 * Generate Mongo ObjectId
 * https://gist.github.com/solenoid/1372386
 *
 * @returns {string}
 */
export const mongoObjectId = function () {
    const timestamp = (new Date().getTime() / 1000 | 0).toString(16);

    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () => (Math.random() * 16 | 0).toString(16)).toLowerCase();
};

/**
 * Register user in the online hashes of this process, as if he is connected to this instance.
 *
 * @param {object} user User document.
 * @returns {object} usObj
 */
function goOnline(user) {
    const usObj = { registered: true, user, sessions: {}, photoFilterTypes: [] };

    session.usId.set(user._id.toString(), usObj);
    session.usLogin.set(user.login, usObj);

    return usObj;
}

/**
 * Remove all users registered with goOnline.
 */
function clearOnline() {
    session.usId.clear();
    session.usLogin.clear();
}

/**
 * Make plain object good enough for photo.approve, which only reads it and passes
 * it to this.call. It is not a Photo document.
 *
 * @param {number} cid
 * @param {object} owner User document.
 * @param {object} [overrides] Properties to override.
 * @returns {object} photo
 */
function makePhoto(cid, owner, overrides = {}) {
    return {
        cid,
        user: owner._id,
        s: 0,
        r0: 1,
        title: 'Test photo',
        year: 1950,
        year2: 1950,
        type: 1,
        toObject() {
            return { cid: this.cid, s: this.s, type: this.type };
        },
        ...overrides,
    };
}

/**
 * Create Photo documents for the user with given statuses, cids are assigned sequentially from 1.
 *
 * @param {object} owner User document.
 * @param {number[]} statuses
 * @returns {Promise<object[]>} Created photos.
 */
function createPhotos(owner, statuses) {
    return Photo.create(statuses.map((s, i) => ({
        cid: i + 1,
        user: owner._id,
        s,
        path: `p${i + 1}`,
        file: `p${i + 1}`,
    })));
}

export default {
    createUser,
    mongoObjectId,
    goOnline,
    clearOnline,
    makePhoto,
    createPhotos,
};
