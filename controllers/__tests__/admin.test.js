/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { News } from '../../models/News';
import { CommentN } from '../../models/Comment';
import { BadParamsError, AuthorizationError, NotFoundError, NoticeError } from '../../app/errors';
import constants from '../../app/errors/constants';
import admin from '../admin';
import comment from '../comment';
import testHelpers from '../../tests/testHelpers';

describe('admin', () => {
    beforeEach(async () => {
        // Mock non-registerd user handshake.
        admin.handshake = { 'usObj': { 'isAdmin': true } };
    });

    afterEach(() => {
        // Delete handshake.
        delete admin.handshake;
    });

    describe('save or create news', () => {
        it('should create and update news', async () => {
            expect.assertions(2);

            const data = { pdate: new Date(), 'title': 'Test news', 'txt': 'Test news content' };
            let result = await admin.saveOrCreateNews(data);

            expect(result.news).toMatchObject(data);

            // Update same record.
            data.title = 'Test news updated';
            data.txt = 'Test news content updated';
            data.cid = result.news.cid;
            result = await admin.saveOrCreateNews(data);

            expect(result.news).toMatchObject(data);
        });

        it('should create news with commenting disabled', async () => {
            expect.assertions(2);

            const data = { 'title': 'Test news', 'txt': 'Test news content', nocomments: true };
            const result = await admin.saveOrCreateNews(data);

            expect(result.news).toMatchObject(data);
            expect(result.news.nocomments).toBeTruthy();
        });

        it('throws on non-admin use', async () => {
            expect.assertions(1);

            // Reset handshake.
            admin.handshake = { 'usObj': { 'isAdmin': false } };

            const data = { 'title': 'Test news', 'txt': 'Test news content' };

            expect(() => admin.saveOrCreateNews(data)).toThrow(new AuthorizationError());
        });

        it('throws on empty text', async () => {
            expect.assertions(1);

            const data = { 'title': 'Test news' };

            expect(() => admin.saveOrCreateNews(data)).toThrow(new BadParamsError());
        });

        it('throws on non-existing news', async () => {
            expect.assertions(1);

            const data = { cid: 1000, 'title': 'Test news', 'txt': 'Test news content' };

            await expect(admin.saveOrCreateNews(data)).rejects.toThrow(new NotFoundError(constants.NO_SUCH_NEWS));
        });
    });

    describe('delete news', () => {
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

        it('delete news', async () => {
            expect.assertions(2);

            // Delete news record.
            const del = await admin.deleteNews(news);

            expect(del).toMatchObject({});
            await expect(News.findOne({ cid: news.cid })).resolves.toBeNull();
        });

        it('throws on non-admin use', async () => {
            expect.assertions(1);

            // Reset handshake.
            admin.handshake = { 'usObj': { 'isAdmin': false } };

            await expect(admin.deleteNews(news)).rejects.toThrow(new AuthorizationError());
        });

        it('throws on missing cid', async () => {
            expect.assertions(1);

            news.cid = undefined;

            await expect(admin.deleteNews(news)).rejects.toThrow(new BadParamsError());
        });

        it('throws on non-existing news', async () => {
            expect.assertions(1);

            const data = { cid: 1000 };

            await expect(admin.deleteNews(data)).rejects.toThrow(new NotFoundError(constants.NO_SUCH_NEWS));
        });

        it('throws on non-zero comments', async () => {
            expect.assertions(2);

            const data = { txt: 'news comment', type: 'news', obj: news.cid };

            await comment.create(data);

            await expect(CommentN.count({ obj: news })).resolves.toBe(1);
            await expect(admin.deleteNews(news)).rejects.toThrow(new NoticeError(constants.NEWS_CONTAINS_COMMENTS));
        });
    });
});
