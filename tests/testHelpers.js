import { User, UserConfirm } from '../models/User';
import auth from '../controllers/auth';

jest.mock('../controllers/mail');

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

export default {
    createUser,
    mongoObjectId,
};
