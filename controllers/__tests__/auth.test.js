import _ from 'lodash';
import { User, UserConfirm } from '../../models/User';
import { send } from '../mail';
import { AuthenticationError, InputError } from '../../app/errors';
import constants from '../../app/errors/constants';

jest.mock('../mail', () => ({
    send: jest.fn().mockResolvedValue(),
    ready: jest.fn().mockResolvedValue(),
}));

let auth;

describe('user registration', () => {
    beforeAll(() => {
        auth = require('../auth').default;
        send.mockClear();
    });

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
        send.mockRejectedValue();

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
