import { UserObjectRel } from '../../models/UserStates';
import subscr from '../subscr';
import testHelpers from '../../tests/testHelpers';

jest.mock('../mail');

describe('subscription', () => {
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
});
