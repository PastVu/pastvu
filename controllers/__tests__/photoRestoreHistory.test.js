/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { PhotoHistory } from '../../models/Photo';
import photo from '../photo';
import testHelpers from '../../tests/testHelpers';
import { AuthorizationError, BadParamsError, NotFoundError } from '../../app/errors';

const PUBLIC = 5;
const DEACTIVATE = 7;

describe('photo.restorePointInHistory', () => {
    const cid = 100500;
    const t1 = new Date('2020-01-01T10:00:00Z');
    const t2 = new Date('2020-01-02T10:00:00Z');
    const t3 = new Date('2020-01-03T10:00:00Z');
    let user;
    let owner;
    let saveCall;
    let currentPhoto;
    let saveResult;

    // Mocks this.call: photo.find returns current photo, real prefetchForEdit checks permissions,
    // photo.save is recorded.
    beforeEach(async () => {
        user = await testHelpers.createUser({ login: 'admin1' });
        owner = await testHelpers.createUser({ login: 'owner1' });
        photo.handshake = { usObj: { registered: true, isAdmin: true, user } };

        saveCall = undefined;
        saveResult = { photo: { cid }, can: {} };
        currentPhoto = { cid, user: owner._id, s: PUBLIC, r0: 1, title: 'Current' };
        photo.call = jest.fn(async (name, args) => { //eslint-disable-line jest/prefer-spy-on
            if (name === 'photo.find') {
                return currentPhoto;
            }

            if (name === 'photo.prefetchForEdit') {
                return photo.prefetchForEdit.call({ handshake: photo.handshake, call: photo.call }, args);
            }

            if (name === 'photo.save') {
                saveCall = args;

                return saveResult;
            }
        });
    });

    afterEach(() => {
        delete photo.call;
        delete photo.handshake;
    });

    const addHistory = (stamp, values, extra = {}) => PhotoHistory.create({ cid, user: user._id, stamp, values, ...extra });

    it('replays history up to the target and saves it with restoreStamp', async () => {
        expect.assertions(5);

        await addHistory(t1, { s: PUBLIC, title: 'First', geo: [10, 20], regions: [1, 2] });
        await addHistory(t2, { title: 'Second' });
        await addHistory(t3, { title: 'Third' });

        await photo.restorePointInHistory({ cid, stamp: t2.getTime() });

        expect(saveCall.restoreStamp).toStrictEqual(t2);
        expect(saveCall.ignoreChange).toBe(true);
        expect(saveCall.changes.title).toBe('Second');
        // Coordinates are reversed, as they are reversed again at validation.
        expect(saveCall.changes.geo).toStrictEqual([20, 10]);
        expect(saveCall.changes.regions).toBeUndefined();
    });

    it('uses last region and clears fields removed in history if there are no coordinates', async () => {
        expect.assertions(3);

        await addHistory(t1, { s: PUBLIC, title: 'First', geo: [10, 20], regions: [1, 2] });
        await addHistory(t2, {}, { del: ['geo'] });

        await photo.restorePointInHistory({ cid, stamp: t2.getTime() });

        expect(saveCall.changes.geo).toBeNull();
        expect(saveCall.changes.region).toBe(2);
        expect(saveCall.changes.title).toBe('First');
    });

    it('clears fields that were added after the target', async () => {
        expect.assertions(2);

        await addHistory(t1, { s: PUBLIC, title: 'First' });
        await addHistory(t2, { title: 'Second' });
        await addHistory(t3, { source: 'Later' }, { add: ['source'] });

        // Current photo carries the field added at t3.
        Object.assign(currentPhoto, { title: 'Second', source: 'Later' });

        await photo.restorePointInHistory({ cid, stamp: t2.getTime() });

        expect(saveCall.changes.title).toBe('Second');
        expect(saveCall.changes.source).toBeNull();
    });

    it('refuses to restore when the status at the target is not public', async () => {
        expect.assertions(2);

        await addHistory(t1, { s: PUBLIC, title: 'First' });
        await addHistory(t2, { s: DEACTIVATE });
        await addHistory(t3, { title: 'Third' });

        await expect(photo.restorePointInHistory({ cid, stamp: t3.getTime() })).rejects.toThrow(BadParamsError);
        expect(saveCall).toBeUndefined();
    });

    it('throws if there is no history up to the target', async () => {
        expect.assertions(1);

        await addHistory(t2, { s: PUBLIC, title: 'Second' });

        await expect(photo.restorePointInHistory({ cid, stamp: t1.getTime() })).rejects.toThrow(NotFoundError);
    });

    it('allows a moderator', async () => {
        expect.assertions(1);

        await addHistory(t1, { s: PUBLIC, title: 'First' });

        photo.handshake = { usObj: { registered: true, isModerator: true, user } };

        await photo.restorePointInHistory({ cid, stamp: t1.getTime() });

        expect(saveCall.changes.title).toBe('First');
    });

    it('allows a regional moderator of the photo region', async () => {
        expect.assertions(1);

        await addHistory(t1, { s: PUBLIC, title: 'First' });

        photo.handshake = {
            usObj: { registered: true, isModerator: true, user: { _id: user._id, mod_regions: [{ cid: 1 }] }, mod_rhash: { 1: {} } },
        };

        await photo.restorePointInHistory({ cid, stamp: t1.getTime() });

        expect(saveCall.changes.title).toBe('First');
    });

    it('does not allow a regional moderator of another region', async () => {
        expect.assertions(2);

        await addHistory(t1, { s: PUBLIC, title: 'First' });

        photo.handshake = {
            usObj: { registered: true, isModerator: true, user: { _id: user._id, mod_regions: [{ cid: 2 }] }, mod_rhash: { 2: {} } },
        };

        await expect(photo.restorePointInHistory({ cid, stamp: t1.getTime() })).rejects.toThrow(AuthorizationError);
        expect(saveCall).toBeUndefined();
    });

    it('restores content of a currently deactivated photo, but keeps its status', async () => {
        expect.assertions(2);

        await addHistory(t1, { s: PUBLIC, title: 'First' });
        await addHistory(t2, { s: DEACTIVATE });
        currentPhoto.s = DEACTIVATE;

        await photo.restorePointInHistory({ cid, stamp: t1.getTime() });

        expect(saveCall.changes.title).toBe('First');
        expect(saveCall.changes.s).toBe(DEACTIVATE);
    });

    it('does not allow photo author to restore', async () => {
        expect.assertions(2);

        await addHistory(t1, { s: PUBLIC, title: 'First' });

        photo.handshake = { usObj: { registered: true, user: owner } };

        await expect(photo.restorePointInHistory({ cid, stamp: t1.getTime() })).rejects.toThrow(AuthorizationError);
        expect(saveCall).toBeUndefined();
    });

    it('returns save result, so client can tell that nothing has changed', async () => {
        expect.assertions(1);

        await addHistory(t1, { s: PUBLIC, title: 'First' });
        saveResult = { emptySave: true };

        await expect(photo.restorePointInHistory({ cid, stamp: t1.getTime() })).resolves.toStrictEqual({ emptySave: true });
    });

    it('rejects bad stamp', async () => {
        expect.assertions(1);

        await expect(photo.restorePointInHistory({ cid, stamp: 'garbage' })).rejects.toThrow(BadParamsError);
    });

    it('rejects unregistered user', async () => {
        expect.assertions(1);

        photo.handshake = { usObj: { registered: false } };

        await expect(photo.restorePointInHistory({ cid, stamp: t1.getTime() })).rejects.toThrow(AuthorizationError);
    });
});
