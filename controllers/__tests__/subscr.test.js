/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import { UserObjectRel, UserNoty } from '../../models/UserStates';
import subscr, { commentAdded, commentViewed } from '../subscr';
import profile from '../profile';
import testHelpers from '../../tests/testHelpers';

// Mock user settings, they will be used in profile.changeSetting.
jest.mock('../settings', () => ({
    userSettingsDef: { 'subscr_disable_noty': false },
    userSettingsVars: { 'subscr_disable_noty': [true, false] },
}));

describe('subscription', () => {
    beforeAll(() => {
        // Mocking this.call for profile.
        profile.call = jest.fn(() => true); //eslint-disable-line jest/prefer-spy-on
    });

    describe('get subscription object relations for given user', () => {
        let user;

        beforeEach(async () => {
            user = await testHelpers.createUser({ login: 'user1' });

            const userTwo = await testHelpers.createUser({ login: 'user2' });

            await UserObjectRel.insertMany([
                // Photo records user1.
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2012-12-17'), type: 'photo', ccount_new: 0 },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2015-01-20'), type: 'photo', ccount_new: 0 },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2018-05-21'), type: 'photo' },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2019-06-11'), type: 'photo' },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2019-05-11'), type: 'photo', ccount_new: 5 },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2017-02-20'), type: 'photo', ccount_new: 2 },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2018-06-21'), type: 'photo', ccount_new: 5 },
                // News records user1.
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2012-06-21'), type: 'news', ccount_new: 0 },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2015-07-21'), type: 'news' },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2016-05-20'), type: 'news' },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2018-05-21'), type: 'news', ccount_new: 5 },
                { obj: testHelpers.mongoObjectId(), user: user._id, sbscr_create: new Date('2018-06-21'), type: 'news', ccount_new: 2 },
                // Add some other records that are not supposed to present in result.
                { obj: testHelpers.mongoObjectId(), user: userTwo._id, sbscr_create: new Date('2022-06-18'), type: 'news' },
                { obj: testHelpers.mongoObjectId(), user: userTwo._id, sbscr_create: new Date('2022-06-17'), type: 'photo', ccount_new: 3 },
                { obj: testHelpers.mongoObjectId(), user: userTwo._id, sbscr_create: new Date('2027-06-17'), type: 'photo' },
                { obj: testHelpers.mongoObjectId(), user: user._id, type: 'photo' },
                { obj: testHelpers.mongoObjectId(), user: user._id, type: 'news' },
                { obj: testHelpers.mongoObjectId(), user: userTwo._id, type: 'photo' },
            ]);
        });

        it('should return the correct order of photo records', async () => {
            expect.assertions(1);

            const getUserObjectRel = subscr.__get__('getUserObjectRel');

            let rels = await getUserObjectRel({ userId: user._id, page: 0, type: 'photo' }).exec();

            // Extract date.
            rels = rels.map(rec => rec.sbscr_create.toISOString().split('T')[0]);

            // Validate order.
            expect(rels).toStrictEqual([
                '2019-05-11', // ccount 5
                '2018-06-21', // ccount 5 dated earlier
                '2017-02-20', // ccount 2
                '2019-06-11', // the rest is ordered by date staring from latest.
                '2018-05-21',
                '2015-01-20',
                '2012-12-17',
            ]);
        });

        it('should return the correct order of news records', async () => {
            expect.assertions(1);

            const getUserObjectRel = subscr.__get__('getUserObjectRel');

            let rels = await getUserObjectRel({ userId: user._id, page: 0, type: 'news' }).exec();

            // Extract date.
            rels = rels.map(rec => rec.sbscr_create.toISOString().split('T')[0]);

            // Validate order.
            expect(rels).toStrictEqual([
                '2018-05-21', // ccount 5
                '2018-06-21', // ccount 2
                '2016-05-20', // the rest is ordered by date staring from latest.
                '2015-07-21',
                '2012-06-21',
            ]);
        });

        it('should paginate records', async () => {
            expect.assertions(2);

            const getUserObjectRel = subscr.__get__('getUserObjectRel');

            // Override subscrPerPage constant to return 4 items per page.
            subscr.__set__('subscrPerPage', 4);

            // Query page 0.
            let rels = await getUserObjectRel({ userId: user._id, page: 0, type: 'photo' }).exec();

            // Extract date.
            rels = rels.map(rec => rec.sbscr_create.toISOString().split('T')[0]);

            // Validate order of first page records.
            expect(rels).toStrictEqual([
                '2019-05-11', // ccount 5
                '2018-06-21', // ccount 5 dated earlier
                '2017-02-20', // ccount 2
                '2019-06-11', // the rest is ordered by date staring from latest.
            ]);

            rels = await getUserObjectRel({ userId: user._id, page: 1, type: 'photo' }).exec();

            // Extract date.
            rels = rels.map(rec => rec.sbscr_create.toISOString().split('T')[0]);

            // Validate order of second page records.
            expect(rels).toStrictEqual([
                '2018-05-21',
                '2015-01-20',
                '2012-12-17',
            ]);
        });
    });

    describe('user notifications', () => {
        const users = {}; let
            obj;

        beforeEach(async () => {
            obj = testHelpers.mongoObjectId();
            users.user1 = await testHelpers.createUser({ login: 'user1' });
            users.user2 = await testHelpers.createUser({ login: 'user2' });
            users.user3 = await testHelpers.createUser({ login: 'user3' });
            users.user4 = await testHelpers.createUser({ login: 'user4' });

            await UserObjectRel.insertMany([
                // Photo record with 4 users subscribed to it.
                { obj, user: users.user1._id, sbscr_create: new Date('2018-06-21'), type: 'photo' },
                { obj, user: users.user2._id, sbscr_create: new Date('2022-06-17'), type: 'photo' },
                { obj, user: users.user3._id, sbscr_create: new Date('2022-06-17'), type: 'photo' },
                { obj, user: users.user4._id, sbscr_create: new Date('2022-06-17'), type: 'photo' },
                // Add some more subscriptions.
                { obj: testHelpers.mongoObjectId(), user: users.user1._id, sbscr_create: new Date('2016-05-20'), type: 'news' },
                { obj: testHelpers.mongoObjectId(), user: users.user2._id, sbscr_create: new Date('2022-06-18'), type: 'news' },
            ]);

            // Mock admin user handshake.
            profile.handshake = { 'usObj': { 'user': users.user1, 'registered': true, 'isAdmin': true } };
        });

        afterEach(() => {
            // Delete handshake.
            delete profile.handshake;
        });

        describe('on comment adding', () => {
            it('should schedule notification to subsribed users', async () => {
                expect.assertions(5);

                // Add comment by user1.
                const notifiedUsers = await commentAdded(obj, users.user1);

                // Check output.
                expect(notifiedUsers).toHaveLength(3);
                expect(notifiedUsers).not.toContain(users.user1._id);
                expect(notifiedUsers).toStrictEqual(expect.arrayContaining([
                    users.user2._id,
                    users.user3._id,
                    users.user4._id,
                ]));

                // Check UserObjectRel records notification flag has been set.
                const count = await UserObjectRel.countDocuments({ obj, sbscr_noty: true }).exec();

                expect(count).toBe(3);

                // Check UserNoty records notification flag has been set.
                const usersNotyCount = await UserNoty.countDocuments({ nextnoty: { $exists: true } }).exec();

                expect(usersNotyCount).toBe(3);
            });

            it('should not schedule notification to restricted notifications users', async () => {
                expect.assertions(7);

                // User2 is not allowed to login.
                await profile.changeRestrictions({ login: 'user2', key: 'nologin', val: true });

                // User3 has disabled notifications.
                await profile.changeSetting({ login: 'user3', key: 'subscr_disable_noty', val: true });

                // Add comment by user1.
                const notifiedUsers = await commentAdded(obj, users.user1);

                // Check output.
                expect(notifiedUsers).toHaveLength(1);
                expect(notifiedUsers).not.toContain(users.user1._id);
                expect(notifiedUsers).not.toContain(users.user2._id);
                expect(notifiedUsers).not.toContain(users.user3._id);
                expect(notifiedUsers).toStrictEqual(expect.arrayContaining([
                    users.user4._id,
                ]));

                // Check UserObjectRel records notification flag has been set.
                const count = await UserObjectRel.countDocuments({ obj, sbscr_noty: true }).exec();

                expect(count).toBe(1);

                // Check UserNoty records notification flag has been set.
                const usersNotyCount = await UserNoty.countDocuments({ nextnoty: { $exists: true } }).exec();

                expect(usersNotyCount).toBe(1);
            });


            it('should do nothing for object with no subscriptions', async () => {
                expect.assertions(2);

                // Add comment by user1.
                const newObj = testHelpers.mongoObjectId();
                const notifiedUsers = await commentAdded(newObj, users.user1);

                // Check output.
                expect(notifiedUsers).toHaveLength(0);

                // Check records with notification flag.
                const count = await UserObjectRel.countDocuments({ obj: newObj, sbscr_noty: true }).exec();

                expect(count).toBe(0);
            });
        });

        it('on comment view scheduled notification has to be cancelled', async () => {
            expect.assertions(6);

            // Add comment by user1.
            const notifiedUsers = await commentAdded(obj, users.user1);

            // Check output.
            expect(notifiedUsers).toHaveLength(3);
            expect(notifiedUsers).toContainEqual(users.user2._id);

            // User2 viewed the comments.
            await commentViewed(obj, users.user2, true);

            // Check UserObjectRel records with notification flag do not contain user2 any more.
            const rels = _.map(await UserObjectRel.find({ obj, sbscr_noty: true }).exec(), rec => rec.user);

            expect(rels).toHaveLength(2);
            expect(rels).not.toContain(users.user2._id);

            // Check UserNoty records with notification flag do not contain user2 any more.
            const usersNoty = _.map(await UserNoty.find({ nextnoty: { $exists: true } }).exec(), rec => rec.user);

            expect(usersNoty).toHaveLength(2);
            expect(usersNoty).not.toContain(users.user2._id);
        });

        it('on user login restriction scheduled notification has to be cancelled', async () => {
            expect.assertions(6);

            // Add comment by user1.
            const notifiedUsers = await commentAdded(obj, users.user1);

            // Check output.
            expect(notifiedUsers).toHaveLength(3);
            expect(notifiedUsers).toContainEqual(users.user2._id);

            // User2 is not allowed to login.
            await profile.changeRestrictions({ login: 'user2', key: 'nologin', val: true });

            // Check UserObjectRel records with notification flag do not contain user2 any more.
            const rels = _.map(await UserObjectRel.find({ obj, sbscr_noty: true }).exec(), rec => rec.user);

            expect(rels).toHaveLength(2);
            expect(rels).not.toContain(users.user2._id);

            // Check UserNoty records with notification flag do not contain user2 any more.
            const usersNoty = _.map(await UserNoty.find({ nextnoty: { $exists: true } }).exec(), rec => rec.user);

            expect(usersNoty).toHaveLength(2);
            expect(usersNoty).not.toContain(users.user2._id);
        });

        it('on user disabling notifications scheduled notification has to be cancelled', async () => {
            expect.assertions(6);

            // Add comment by user1.
            const notifiedUsers = await commentAdded(obj, users.user1);

            // Check output.
            expect(notifiedUsers).toHaveLength(3);
            expect(notifiedUsers).toContainEqual(users.user2._id);

            // User2 has disabled notifications.
            await profile.changeSetting({ login: 'user2', key: 'subscr_disable_noty', val: true });

            // Check UserObjectRel records with notification flag do not contain user2 any more.
            const rels = _.map(await UserObjectRel.find({ obj, sbscr_noty: true }).exec(), rec => rec.user);

            expect(rels).toHaveLength(2);
            expect(rels).not.toContain(users.user2._id);

            // Check UserNoty records with notification flag do not contain user2 any more.
            const usersNoty = _.map(await UserNoty.find({ nextnoty: { $exists: true } }).exec(), rec => rec.user);

            expect(usersNoty).toHaveLength(2);
            expect(usersNoty).not.toContain(users.user2._id);
        });
    });
});
