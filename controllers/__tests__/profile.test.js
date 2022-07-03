import profile from '../profile';
import { User } from '../../models/User';
import { BadParamsError, AuthorizationError } from '../../app/errors';
import testHelpers from '../../tests/testHelpers';

describe('profile', () => {
    describe('save user ranks', () => {
        beforeEach(async () => {
            // Register user and confirm.
            await testHelpers.createUser({ login: 'user1', pass: 'pass1' });

            // Mock non-registerd user handshake.
            profile.handshake = { 'usObj': { 'isAdmin': true } };
        });

        afterEach(() => {
            // Delete handshake.
            delete profile.handshake;
        });

        it('should save ranks', async () => {
            expect.assertions(2);

            // Save user ranks.
            const ranks = ['mec'];
            const result = await profile.saveUserRanks({ 'login': 'user1', 'ranks': ranks });

            // Convert CoreMongooseArray to array.
            result.ranks = Array.from(result.ranks);

            expect(result).toStrictEqual({ 'saved': true, 'ranks': ranks });

            // Check record.
            const user = await User.findOne({ 'login': 'user1' });

            expect(Array.from(user.ranks)).toStrictEqual(ranks);
        });

        it('throws on missing login', async () => {
            expect.assertions(1);
            await expect(profile.saveUserRanks({ 'ranks': [] })).rejects.toThrow(new BadParamsError());
        });

        it('throws on non-existing or malformed ranks', async () => {
            expect.assertions(3);
            await expect(profile.saveUserRanks({ 'login': 'user1', 'ranks': undefined })).rejects.toThrow(new BadParamsError());
            await expect(profile.saveUserRanks({ 'login': 'user1', 'ranks': ['blabla'] })).rejects.toThrow(new BadParamsError());
            await expect(profile.saveUserRanks({ 'login': 'user1', 'ranks': ['mec', 'blabla'] })).rejects.toThrow(new BadParamsError());
        });

        it('throws on unauthorised access', async () => {
            expect.assertions(1);

            profile.handshake.usObj.isAdmin = false;

            await expect(profile.saveUserRanks({ 'login': 'user1', 'ranks': ['mec'] })).rejects.toThrow(new AuthorizationError());
        });
    });
});
