import _ from 'lodash';
import { User, UserConfirm } from '../../models/User';
import { send } from '../mail';
import { AuthenticationError, InputError, BadParamsError } from '../../app/errors';
import constants from '../../app/errors/constants';

jest.mock('../mail', () => ({
    send: jest.fn().mockResolvedValue(),
    ready: jest.fn().mockResolvedValue(),
}));

let auth;

describe('authentication', () => {
    beforeAll(() => {
        auth = require('../auth').default;
        send.mockClear();
    });

    describe('user registration', () => {
        it('should create user record and send email', async () => {
            expect.assertions(5);

            // Register user.
            const data = { 'login': 'user1', 'email': 'user1@test.com', 'pass': 'pass1', 'pass2': 'pass1' };
            const result = await auth.register(data);

            expect(result).toHaveProperty('message');

            // Expect email has been dispatched.
            expect(send).toHaveBeenCalledTimes(1);
            expect(send).toHaveBeenCalledWith(expect.objectContaining({
                receiver: { 'alias': data.login, 'email': data.email },
            }));

            // Check user is in the database.
            const user = await User.findOne({ 'login': data.login });

            expect(user).toMatchObject(_.omit(data, ['pass', 'pass2']));

            // Check confirmation key record exists.
            const userConfirm = await UserConfirm.findOne({ 'user': user._id });

            expect(userConfirm).toBeTruthy();
        });

        it('throws on email problem', async () => {
            expect.assertions(2);

            // Mocked send function should reject.
            send.mockRejectedValue('Mail is not configured');

            // Register user.
            const data = { 'login': 'user1', 'email': 'user1@test.com', 'pass': 'pass1', 'pass2': 'pass1' };

            await expect(auth.register(data)).rejects.toThrow(new AuthenticationError(constants.AUTHENTICATION_REGISTRATION));

            // Restore original mock.
            send.mockResolvedValue();

            // Check user record was deleted.
            await expect(User.findOne({ 'login': data.login })).resolves.toBeNull();
        });

        describe('throws on invalid input values', () => {
            const data = { 'login': 'user1', 'email': 'user1@test.com', 'pass': 'pass1', 'pass2': 'pass1' };

            it('empty login field', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'login': '' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new InputError(constants.INPUT_LOGIN_REQUIRED));
            });

            it('login field starts with digit', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'login': '1user' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.INPUT_LOGIN_CONSTRAINT));
            });

            it('login field is shorter than 3 characters', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'login': 'u' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.INPUT_LOGIN_CONSTRAINT));
            });

            it('login field is longer than 15 characters', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'login': 'user'.repeat(5) }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.INPUT_LOGIN_CONSTRAINT));
            });

            it('empty email field', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'email': '' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new InputError(constants.INPUT_EMAIL_REQUIRED));
            });

            it('empty password field', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'pass': '' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new InputError(constants.INPUT_PASS_REQUIRED));
            });

            it('passwords don\'t match', async () => {
                expect.assertions(1);

                const testData = _.defaults({ 'pass2': 'pass2' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.AUTHENTICATION_PASSWORDS_DONT_MATCH));
            });

            it('user login exists', async () => {
                expect.assertions(1);

                await auth.register(data);

                // Change email and register again.
                const testData = _.defaults({ 'email': 'user2@test.com' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.AUTHENTICATION_USER_EXISTS));
            });

            it('user email exists', async () => {
                expect.assertions(1);

                await auth.register(data);

                // Change login and register again.
                const testData = _.defaults({ 'login': 'user2' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.AUTHENTICATION_EMAIL_EXISTS));
            });
        });
    });

    describe('confirmation checking', () => {
        it('makes registered user active', async () => {
            expect.assertions(7);

            // Register user.
            const data = { 'login': 'user1', 'email': 'user1@test.com', 'pass': 'pass1', 'pass2': 'pass1' };

            await auth.register(data);

            // Check user is not active.
            let user = await User.findOne({ 'login': data.login });

            expect(user.active).toBeFalsy();
            expect(user.activatedate).toBeFalsy();

            // Confirm user.
            const { key } = await UserConfirm.findOne({ 'user': user._id });
            const check = await auth.checkConfirm({ key });

            expect(check).toHaveProperty('message');
            expect(check.type).toBe('noty');

            // Check that user became active
            user = await User.findOne({ 'login': data.login });

            expect(user.active).toBeTruthy();
            expect(user.activatedate).toBeTruthy();

            // Check that confirmation was deleted.
            await expect(UserConfirm.findOne({ 'user': user._id })).resolves.toBeNull();
        });

        const testData = [
            ['length is > 8', { 'key': 'a'.repeat(9) }, undefined],
            ['length is < 7', { 'key': 'a'.repeat(6) }, undefined],
            ['does not exist', { 'key': 'abcdefg' }, constants.AUTHENTICATION_KEY_DOESNT_EXISTS],
        ];

        it.each(testData)('throws on key %s', async (desc, key, errorString) => {
            expect.assertions(1);
            await expect(auth.checkConfirm(key)).rejects.toThrow(new BadParamsError(errorString));
        });
    });
});
