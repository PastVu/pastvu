/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { CommentN } from '../../models/Comment';
import admin from '../admin';
import comment from '../comment';
import testHelpers from '../../tests/testHelpers';

describe('comment', () => {
    beforeEach(async () => {
        // Mock non-registerd user handshake.
        admin.handshake = { 'usObj': { 'isAdmin': true } };
    });

    afterEach(() => {
        // Delete handshake.
        delete admin.handshake;
    });

    describe('create for news', () => {
        let news;

        beforeEach(async () => {
            const data = { pdate: new Date(), 'title': 'Test news', 'txt': 'Test news content' };

            ({ news } = await admin.saveOrCreateNews(data));

            const user = await testHelpers.createUser({ login: 'user1', pass: 'pass1' });

            // Mock non-registered user handshake.
            comment.handshake = { 'usObj': { 'isAdmin': true, 'registered': true, user } };
        });

        afterEach(() => {
            // Delete handshake.
            delete comment.handshake;
        });

        it('create', async () => {
            expect.assertions(3);

            const data = { txt: 'news comment', type: 'news', obj: news.cid };

            // Create two comments.
            const result = await comment.create(data);

            expect(result.comment.txt).toMatch(data.txt);
            expect(result.comment.user).toMatch('user1');

            await expect(CommentN.count({ obj: news })).resolves.toBe(1);
        });
    });

    describe('retrive', () => {
        let news;

        beforeEach(async () => {
            const data = { pdate: new Date(), 'title': 'Test news', 'txt': 'Test news content' };

            ({ news } = await admin.saveOrCreateNews(data));

            const user = await testHelpers.createUser({ login: 'user1', pass: 'pass1' });

            // Mock non-registered user handshake.
            comment.handshake = { 'usObj': { 'isAdmin': true, 'registered': true, user } };
        });

        afterEach(() => {
            // Delete handshake.
            delete comment.handshake;
        });

        it('give news comments for user', async () => {
            expect.assertions(17);

            const data = { txt: 'news comment', type: 'news', obj: news.cid };

            // Create 4 comments.
            const comment0 = await comment.create(data);
            const comment1 = await comment.create(data);

            data.parent = comment1.comment.cid;
            data.level = comment1.comment.level + 1;

            const comment2 = await comment.create(data);

            data.parent = comment2.comment.cid;
            data.level = comment2.comment.level + 1;

            const comment3 = await comment.create(data);

            // Sanity check.
            await expect(CommentN.count({ obj: news })).resolves.toBe(4);

            const comments = await comment.giveForUser({ login: 'user1', type: 'news' });

            expect(comments.type).toMatch('news');
            expect(comments.countActive).toBe(4);
            expect(comments.objs[news.cid].cid).toStrictEqual(news.cid);
            expect(comments.objs[news.cid].ccount).toBe(4);
            // Comment 0 - no child, waits answer.
            expect(comments.comments[3].cid).toStrictEqual(comment0.comment.cid);
            expect(comments.comments[3].hasChild).toBeFalsy();
            expect(comments.comments[3].waitsAnswer).toBeTruthy();
            // Comment 1 - has child, does not wait answer.
            expect(comments.comments[2].cid).toStrictEqual(comment1.comment.cid);
            expect(comments.comments[2].hasChild).toBeTruthy();
            expect(comments.comments[2].waitsAnswer).toBeFalsy();
            // Comment 2 - has child, does not wait answer.
            expect(comments.comments[1].cid).toStrictEqual(comment2.comment.cid);
            expect(comments.comments[1].hasChild).toBeTruthy();
            expect(comments.comments[1].waitsAnswer).toBeFalsy();
            // Comment 3 - no child, waits answer.
            expect(comments.comments[0].cid).toStrictEqual(comment3.comment.cid);
            expect(comments.comments[0].hasChild).toBeFalsy();
            expect(comments.comments[0].waitsAnswer).toBeTruthy();
        });
    });
});
