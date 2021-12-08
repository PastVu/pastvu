import _ from 'lodash';
import { User, UserConfirm } from '../../models/User';
import { send } from '../mail';
import { AuthenticationError, InputError, BadParamsError, AuthorizationError } from '../../app/errors';
import constants from '../../app/errors/constants';

jest.mock('../mail', () => ({
    send: jest.fn().mockResolvedValue(),
    ready: jest.fn().mockResolvedValue(),
}));

let auth;

describe('authentication', () => {
    beforeAll(() => {
        auth = require('../auth').default;
        // Mocking this.call for auth.
        auth.call = jest.fn(() => true); //eslint-disable-line jest/prefer-spy-on

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

            // Define test data
            const testData = [
                ['empty login field', { 'login': '' }, InputError, constants.INPUT_LOGIN_REQUIRED],
                ['login field starts with digit', { 'login': '1user' }, AuthenticationError, constants.INPUT_LOGIN_CONSTRAINT],
                ['login field < 3 characters', { 'login': 'u' }, AuthenticationError, constants.INPUT_LOGIN_CONSTRAINT],
                ['login field > 15 characters', { 'login': 'user'.repeat(5) }, AuthenticationError, constants.INPUT_LOGIN_CONSTRAINT],
                ['empty email field', { 'email': '' }, InputError, constants.INPUT_EMAIL_REQUIRED],
                ['empty password field', { 'pass': '' }, InputError, constants.INPUT_PASS_REQUIRED],
                ['passwords don\'t match', { 'pass2': 'pass2' }, AuthenticationError, constants.AUTHENTICATION_PASSWORDS_DONT_MATCH],
            ];

            it.each(testData)('%s', async (descr, modifier, ErrorClass, errorMessage) => {
                expect.assertions(1);

                const testData = _.defaults(modifier, data);

                await expect(auth.register(testData)).rejects.toThrow(new ErrorClass(errorMessage));
            });

            it('user login exists', async () => {
                expect.assertions(1);

                // Register user.
                await auth.register(data);

                // Change email and register again.
                const testData = _.defaults({ 'email': 'user2@test.com' }, data);

                await expect(auth.register(testData)).rejects.toThrow(new AuthenticationError(constants.AUTHENTICATION_USER_EXISTS));
            });

            it('user email exists', async () => {
                expect.assertions(1);

                // Register user.
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

    describe('user login', () => {
        beforeEach(async () => {
            // Register user and confirm.
            const data = { 'login': 'user1', 'email': 'user1@test.com', 'pass': 'pass1', 'pass2': 'pass1' };

            await auth.register(data);

            const user = await User.findOne({ 'login': data.login });
            const { key } = await UserConfirm.findOne({ 'user': user._id });

            await auth.checkConfirm({ key });
        });

        it('login with correct credentials', async () => {
            expect.assertions(2);

            // Login.
            const login = await auth.login({ 'login': 'user1', 'pass': 'pass1' });

            expect(login).toHaveProperty('message');
            expect(login).toHaveProperty('youAre');
        });

        it('throws on empty fields', async () => {
            expect.assertions(2);
            await expect(auth.login({ 'login': '', 'pass': 'pass1' })).rejects.toThrow(new InputError(constants.INPUT_LOGIN_REQUIRED));
            await expect(auth.login({ 'login': 'user1', 'pass': '' })).rejects.toThrow(new InputError(constants.INPUT_PASS_REQUIRED));
        });

        it('throws when user does not exist', async () => {
            expect.assertions(1);

            // Login.
            const error = new AuthenticationError(constants.AUTHENTICATION_DOESNT_MATCH);

            await expect(auth.login({ 'login': 'user2', 'pass': 'pass2' })).rejects.toThrow(error);
        });

        it('throws when user is not confirmed', async () => {
            expect.assertions(1);

            // Register user.
            const data = { 'login': 'user2', 'email': 'user2@test.com', 'pass': 'pass2', 'pass2': 'pass2' };

            await auth.register(data);

            // Login.
            const error = new AuthenticationError(constants.AUTHENTICATION_DOESNT_MATCH);

            await expect(auth.login({ 'login': 'user2', 'pass': 'pass2' })).rejects.toThrow(error);
        });

        it('throws if password is wrong', async () => {
            expect.assertions(1);

            // Login.
            const error = new AuthenticationError(constants.AUTHENTICATION_DOESNT_MATCH);

            await expect(auth.login({ 'login': 'user1', 'pass': 'pass111' })).rejects.toThrow(error);
        });

        it('throws on max login attempts', async () => {
            expect.assertions(11);

            // Login 10 times with incorrect password.
            let n = 0;

            let error = new AuthenticationError(constants.AUTHENTICATION_DOESNT_MATCH);

            while (n < 10) {
                n++;

                await expect(auth.login({ 'login': 'user1', 'pass': 'pass111' })).rejects.toThrow(error);
            }

            // Login with correct password.
            error = new AuthenticationError(constants.AUTHENTICATION_MAX_ATTEMPTS);

            await expect(auth.login({ 'login': 'user1', 'pass': 'pass1' })).rejects.toThrow(error);
        });

        it('throws on login not allowed', async () => {
            expect.assertions(1);

            // Disable login (ideally we need to use profile.changeRestrictions).
            const user = await User.findOne({ 'login': 'user1' });

            user.nologin = true;
            await user.save();

            // Login with correct password.
            const error = new AuthenticationError(constants.AUTHENTICATION_NOT_ALLOWED);

            await expect(auth.login({ 'login': 'user1', 'pass': 'pass1' })).rejects.toThrow(error);
        });
    });

    describe('user changes password by entering current password', () => {
        beforeEach(async () => {
            // Register user and confirm.
            const data = { 'login': 'user1', 'email': 'user1@test.com', 'pass': 'pass1', 'pass2': 'pass1' };

            await auth.register(data);

            const user = await User.findOne({ 'login': data.login });
            const { key } = await UserConfirm.findOne({ 'user': user._id });

            await auth.checkConfirm({ key });

            // Mock handshake.
            auth.handshake = { 'usObj': { 'user': user, 'registered': true } };
        });

        afterEach(() => {
            // Delete handshake.
            delete auth.handshake;
        });

        it('changes password', async () => {
            expect.assertions(2);

            // Change password.
            const result = await auth.passChange({ 'login': 'user1', 'pass': 'pass1', 'passNew': 'pass2', 'passNew2': 'pass2' });

            expect(result).toHaveProperty('message');

            // Validate login with new password..
            await expect(auth.login({ 'login': 'user1', 'pass': 'pass2' })).resolves.toHaveProperty('message');
        });

        it('throws on unauthenticated', async () => {
            expect.assertions(1);

            // Unregister user.
            auth.handshake.usObj.registered = false;

            // Change password.
            const changeData = { 'login': 'user1', 'pass': 'pass1', 'passNew': 'pass2', 'passNew2': 'pass2' };

            await expect(auth.passChange(changeData)).rejects.toThrow(new AuthorizationError());
        });

        // Define test data
        const testData = [
            ['login mismatch', { 'login': 'user2' }, AuthorizationError, undefined],
            ['empty current pass', { 'pass': '' }, InputError, constants.INPUT_PASS_REQUIRED],
            ['empty new pass', { 'passNew': '' }, InputError, constants.INPUT_PASS_REQUIRED],
            ['empty new pass confirm', { 'passNew2': '' }, InputError, constants.INPUT_PASS_REQUIRED],
            ['new passwords are not matchig', { 'passNew2': 'pass22' }, AuthenticationError, constants.AUTHENTICATION_PASSWORDS_DONT_MATCH],
            ['current password wrong', { 'pass': 'pass111' }, AuthenticationError, constants.AUTHENTICATION_CURRPASS_WRONG],
        ];

        const changeData = { 'login': 'user1', 'pass': 'pass1', 'passNew': 'pass2', 'passNew2': 'pass2' };

        it.each(testData)('throws on %s', async (descr, modifier, ErrorClass, errorMessage) => {
            expect.assertions(1);

            const testData = _.defaults(modifier, changeData);

            await expect(auth.passChange(testData)).rejects.toThrow(new ErrorClass(errorMessage));
        });
    });
});
