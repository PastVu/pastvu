/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import constants from '../constants';
import { Photo } from '../../models/Photo';
import { Cluster, ClusterPaint, ClusterParams } from '../../models/Cluster';
import cluster, { clusterPhotosAll } from '../cluster';
import { runJob } from '../queue';
import { AuthorizationError, BadParamsError } from '../../app/errors';

jest.mock('../queue', () => ({ runJob: jest.fn(async () => ({ photos: 0, clusters: 0 })) }));

const { PHOTO, PAINTING } = constants.photo.type;
const { PUBLIC } = constants.photo.status;

function photoDoc(cid, type, geo, year) {
    return { cid, type, s: PUBLIC, geo, year, year2: year, file: `${cid}.jpg`, path: `${cid}.jpg` };
}

describe('cluster', () => {
    describe('clusterPhotosAll', () => {
        beforeEach(async () => {
            await Promise.all([Photo.syncIndexes(), Cluster.syncIndexes(), ClusterPaint.syncIndexes()]);
            await ClusterParams.insertMany([{ z: 3, w: 10, h: 10 }, { z: 10, w: 0.1, h: 0.1 }]);
            // Bypass validation, only fields used by clustering matter here.
            await Photo.collection.insertMany([
                photoDoc(1, PHOTO, [37.61, 55.75], 1950),
                photoDoc(2, PHOTO, [37.62, 55.75], 1960),
                photoDoc(3, PAINTING, [37.615, 55.751], 1850),
                { ...photoDoc(4, PHOTO, [37.6, 55.7], 1970), s: constants.photo.status.READY },
            ]);
        });

        it('puts photos and paintings into their own cluster collections', async () => {
            expect.assertions(7);

            const { data } = await clusterPhotosAll({ withGravity: true });

            expect(data).toStrictEqual({ photos: 3, clusters: 4 });

            const photoClusters = await Cluster.find({}, { _id: 0, z: 1, c: 1, y: 1, 'p.cid': 1 }).sort({ z: 1 }).lean();
            const paintClusters = await ClusterPaint.find({}, { _id: 0, z: 1, c: 1, y: 1, 'p.cid': 1 }).sort({ z: 1 }).lean();

            expect(photoClusters).toHaveLength(2);
            expect(photoClusters.map(c => c.c)).toStrictEqual([2, 2]);
            expect(photoClusters[0].y).toStrictEqual({ 1950: 1, 1960: 1 });
            expect([1, 2]).toContain(photoClusters[0].p.cid);

            expect(paintClusters.map(c => [c.z, c.c, c.p.cid])).toStrictEqual([[3, 1, 3], [10, 1, 3]]);
            expect(paintClusters[0].y).toStrictEqual({ 1850: 1 });
        });

        it('rebuilds only requested photo types', async () => {
            expect.assertions(3);

            const stale = { g: [0, 0], geo: [0, 0], z: 3, c: 42, y: {} };

            await Cluster.collection.insertOne({ ...stale });

            const { data } = await clusterPhotosAll({ withGravity: true, types: [PAINTING] });

            expect(data).toStrictEqual({ photos: 1, clusters: 2 });
            // Photo clusters are left as they were.
            await expect(Cluster.find({}, { _id: 0, c: 1 }).lean()).resolves.toStrictEqual([{ c: 42 }]);
            await expect(ClusterPaint.countDocuments()).resolves.toBe(2);
        });
    });

    describe('rebuild', () => {
        afterEach(() => {
            delete cluster.handshake;
        });

        it('requires admin', async () => {
            expect.assertions(2);

            cluster.handshake = { usObj: { registered: true, isAdmin: false } };

            await expect(cluster.rebuild({ types: [PHOTO] })).rejects.toThrow(AuthorizationError);
            expect(runJob).not.toHaveBeenCalled();
        });

        it.each([
            [undefined],
            [[]],
            [[3]],
            ['1'],
        ])('rejects invalid types %p', async types => {
            expect.assertions(2);

            cluster.handshake = { usObj: { registered: true, isAdmin: true } };

            await expect(cluster.rebuild({ types })).rejects.toThrow(BadParamsError);
            expect(runJob).not.toHaveBeenCalled();
        });

        it('runs clustering job for requested types only', async () => {
            expect.assertions(1);

            cluster.handshake = { usObj: { registered: true, isAdmin: true } };

            await cluster.rebuild({ types: [PAINTING, PAINTING] });

            expect(runJob).toHaveBeenCalledWith('clusterPhotosAll', { withGravity: true, types: [PAINTING] });
        });
    });

    describe('recalcAll', () => {
        it('always rebuilds both photos and paintings', async () => {
            expect.assertions(1);

            cluster.handshake = { usObj: { registered: true, isAdmin: true } };

            await cluster.recalcAll({ params: [{ z: 3, w: 10, h: 10 }], conditions: { sgeo: [37.6, 55.7], sz: 13, sw: 40, sh: 40 } });
            delete cluster.handshake;

            expect(runJob).toHaveBeenCalledWith('clusterPhotosAll', { withGravity: true, types: [PHOTO, PAINTING] });
        });
    });
});
