/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import photo, { getNewPhotosLimit } from '../photo';
import * as regionController from '../region';
import * as converter from '../converter';
import * as session from '../_session';
import { createQueue, JobCompletionListener, shutdownQueues } from '../queue';
import { User } from '../../models/User';
import testHelpers from '../../tests/testHelpers';

jest.setTimeout(20000);

// Utils is frozen and can't be spied on, derive object from it with moveFile replaced (upload moves files from incoming dir).
jest.mock('../../commons/Utils', () => {
    const actual = jest.requireActual('../../commons/Utils');

    return Object.create(actual, { moveFile: { value: jest.fn().mockResolvedValue() } });
});

function waitFor(fn, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const check = async () => {
            if (await fn()) {
                return resolve();
            }

            if (Date.now() - started > timeout) {
                return reject(new Error('waitFor timeout'));
            }

            setTimeout(check, 50);
        };

        check();
    });
}

async function approvePhoto(photoToApprove) {
    photo.call = jest.fn(async method => { //eslint-disable-line jest/prefer-spy-on
        switch (method) {
            case 'photo.prefetchForEdit':
                return { photo: photoToApprove, canModerate: true };
            case 'photo.update':
                return { rel: {} };
            default:
                return {};
        }
    });

    await photo.approve({ cid: photoToApprove.cid });
}

describe('user new photos limit', () => {
    let owner;

    beforeEach(async () => {
        jest.spyOn(regionController, 'putPhotoToRegionStatQueue').mockResolvedValue();

        owner = await testHelpers.createUser({ login: 'owner1' });
        // Three photos waiting for approval, no published photos: limit is 10 - 3.
        await User.updateOne({ _id: owner._id }, { $set: { pfcount: 3, pcount: 0 } });
        owner = await User.findById(owner._id);
    });

    afterEach(() => {
        delete photo.call;
        testHelpers.clearOnline();
        jest.restoreAllMocks();
    });

    describe('approve on the same instance', () => {
        it('updates counters and limit of offline owner in db', async () => {
            expect.assertions(4);

            expect(getNewPhotosLimit(owner)).toBe(7);

            await approvePhoto(testHelpers.makePhoto(1, owner));

            const fresh = await User.findById(owner._id);

            expect(fresh.pfcount).toBe(2);
            expect(fresh.pcount).toBe(1);
            expect(getNewPhotosLimit(fresh)).toBe(8);
        });

        it('updates counters and limit of online owner in memory and db', async () => {
            expect.assertions(5);

            const usObj = testHelpers.goOnline(owner);

            await approvePhoto(testHelpers.makePhoto(1, owner));

            const fresh = await User.findById(owner._id);

            expect(usObj.user.pfcount).toBe(2);
            expect(usObj.user.pcount).toBe(1);
            expect(getNewPhotosLimit(usObj.user)).toBe(8);
            expect(fresh.pfcount).toBe(2);
            expect(fresh.pcount).toBe(1);
        });
    });

    describe('approve on another instance', () => {
        // Another instance does not have owner online, so it only does $inc in db.
        const approveElsewhere = () => User.updateOne({ _id: owner._id }, { $inc: { pfcount: -1, pcount: 1 } });

        it('leaves in-memory limit of online owner stale until user is re-read', async () => {
            expect.assertions(3);

            const usObj = testHelpers.goOnline(owner);

            await approveElsewhere();

            expect(usObj.user.pfcount).toBe(3);
            expect(getNewPhotosLimit(usObj.user)).toBe(7);
            expect(getNewPhotosLimit(await User.findById(owner._id))).toBe(8);
        });

        it('does not lose counters changed by another instance when owner is approved here', async () => {
            expect.assertions(2);

            testHelpers.goOnline(owner);

            // Photo #1 is approved on another instance, photo #2 is approved on this one.
            await approveElsewhere();
            await approvePhoto(testHelpers.makePhoto(2, owner));

            const fresh = await User.findById(owner._id);

            // Both photos are approved: 3 - 2 new and 0 + 2 public.
            expect(fresh.pfcount).toBe(1);
            expect(fresh.pcount).toBe(2);
        });
    });

    describe('upload', () => {
        const uploadFiles = (usObj, socket, count) => photo.create.call(
            { socket, handshake: { usObj }, ridMark: 'test' },
            { files: Array.from({ length: count }, (_, i) => ({ file: `abcdef${i}.jpg`, name: `f${i}.jpg`, mime: 'image/jpeg', size: 1 })) }
        );
        const fakeSocket = () => ({
            // Acknowledge emit, like a real client does.
            emit: jest.fn((...args) => {
                const ack = args[args.length - 1];

                if (typeof ack === 'function') {
                    ack({});
                }
            }),
        });

        beforeEach(() => {
            jest.spyOn(converter, 'addPhotos').mockImplementation(() => {});
        });

        it('updates counters and limit of online owner in memory and db', async () => {
            expect.assertions(4);

            const usObj = testHelpers.goOnline(owner);
            const { cids } = await uploadFiles(usObj, fakeSocket(), 2);
            const fresh = await User.findById(owner._id);

            expect(cids).toHaveLength(2);
            expect(usObj.user.pfcount).toBe(5);
            expect(fresh.pfcount).toBe(5);
            expect(getNewPhotosLimit(usObj.user)).toBe(5);
        });

        it('does not lose counters changed by another instance', async () => {
            expect.assertions(3);

            const usObj = testHelpers.goOnline(owner);

            // Photo is approved on another instance: pfcount 3 -> 2, pcount 0 -> 1.
            await User.updateOne({ _id: owner._id }, { $inc: { pfcount: -1, pcount: 1 } });
            await uploadFiles(usObj, fakeSocket(), 2);

            const fresh = await User.findById(owner._id);

            expect(fresh.pfcount).toBe(4);
            expect(fresh.pcount).toBe(1);
            // Online user is synced with db as well.
            expect(usObj.user.pfcount).toBe(4);
        });

        it('sends updated user to other sockets of the owner but not to the requesting one', async () => {
            expect.assertions(3);

            const requesting = fakeSocket();
            const other = fakeSocket();
            const usObj = testHelpers.goOnline(owner);

            usObj.sessions = { s1: { sockets: { a: requesting, b: other } } };

            await uploadFiles(usObj, requesting, 1);

            expect(requesting.emit).not.toHaveBeenCalled();
            expect(other.emit).toHaveBeenCalledTimes(1);
            expect(other.emit).toHaveBeenCalledWith('youAre', expect.objectContaining({ registered: true }), expect.any(Function));
        });
    });

    describe('calcUserStats', () => {
        it('corrects drifted counters in db and unsets empty ones', async () => {
            expect.assertions(5);

            await testHelpers.createPhotos(owner, [5, 5, 0, 9]); // 2 public, 1 new, 1 deactivated.
            await User.updateOne({ _id: owner._id }, { $set: { pfcount: 9, pcount: 9, pdcount: 9, ccount: 9 } });

            const { message } = await session.calcUserStats();
            const fresh = await User.findById(owner._id);
            const raw = await User.collection.findOne({ _id: owner._id }); // Without schema defaults.

            expect(message).toMatch(/1 users/);
            expect(fresh.pcount).toBe(2);
            expect(fresh.pfcount).toBe(1);
            expect(fresh.pdcount).toBe(1);
            expect(raw.ccount).toBeUndefined();
        });

        it('refreshes limit of online user following regetUsersAfterStatsUpdate', async () => {
            expect.assertions(3);

            await testHelpers.createPhotos(owner, [5, 5, 0, 9]); // 2 public, 1 new, 1 deactivated.

            const usObj = testHelpers.goOnline(owner); // In memory: pfcount 3, pcount 0, limit 7.

            expect(getNewPhotosLimit(usObj.user)).toBe(7);

            await session.calcUserStats();
            session.regetUsersAfterStatsUpdate();
            await waitFor(() => usObj.user.pcount === 2);

            expect(usObj.user.pfcount).toBe(1);
            expect(getNewPhotosLimit(usObj.user)).toBe(9);
        });
    });

    describe('calcUserStats job completion callback', () => {
        afterAll(async () => {
            await shutdownQueues();
        });

        it('refreshes online user on listener instance when worker finishes job', async () => {
            expect.assertions(2);

            await testHelpers.createPhotos(owner, [5, 5]);

            const usObj = testHelpers.goOnline(owner); // In memory: pfcount 3, pcount 0.

            // Worker side.
            const queue = await createQueue('session');

            queue.process('calcUserStats', job => session.calcUserStats(job.data));

            // Frontend side.
            const listener = new JobCompletionListener('session');

            session.registerJobCallbacks(listener); // The same registration as app does.
            listener.init();
            await listener.queueEvents.waitUntilReady();

            await queue.add('calcUserStats', {}, { removeOnComplete: 2 });
            await waitFor(() => usObj.user.pcount === 2);

            // No new photos, 2 public: limit is 10 - 0.
            expect(usObj.user.pfcount).toBe(0);
            expect(getNewPhotosLimit(usObj.user)).toBe(10);
        });
    });
});
