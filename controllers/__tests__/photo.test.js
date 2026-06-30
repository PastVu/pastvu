/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { PhotoHistory } from '../../models/Photo';
import photo from '../photo';
import testHelpers from '../../tests/testHelpers';

describe('photo', () => {
    describe('giveObjHist - original filename', () => {
        const cid = 100500;
        const filename = 'IMG_20030714_grandma.jpg';
        let owner;

        beforeEach(async () => {
            owner = await testHelpers.createUser({ login: 'owner1' });

            // Earliest history entry represents the upload moment with empty
            // values (this is what saveHistory creates on first edit).
            await PhotoHistory.create({ cid, user: owner._id, stamp: new Date('2020-01-01'), values: {} });

            // photo.find is reached via this.call; return a photo carrying the
            // immutable original filename.
            photo.call = jest.fn(async () => ({ cid, user: owner._id, s: 5, ldate: new Date('2019-12-31'), filename })); //eslint-disable-line jest/prefer-spy-on
        });

        afterEach(() => {
            delete photo.call;
            delete photo.handshake;
        });

        it('shows original filename to the photo owner', async () => {
            expect.assertions(2);

            photo.handshake = { usObj: { registered: true, user: owner } };

            const result = await photo.giveObjHist({ cid, fetchId: 1 });

            expect(result.hists).toHaveLength(1);
            expect(result.hists[0].values.filename).toBe(filename);
        });

        it('shows original filename to a moderator/admin', async () => {
            expect.assertions(2);

            const admin = await testHelpers.createUser({ login: 'admin1' });

            photo.handshake = { usObj: { registered: true, isAdmin: true, user: admin } };

            const result = await photo.giveObjHist({ cid, fetchId: 1 });

            expect(result.hists).toHaveLength(1);
            expect(result.hists[0].values.filename).toBe(filename);
        });

        it('hides original filename from a non-owner, non-moderator', async () => {
            expect.assertions(1);

            const stranger = await testHelpers.createUser({ login: 'stranger1' });

            photo.handshake = { usObj: { registered: true, user: stranger } };

            const result = await photo.giveObjHist({ cid, fetchId: 1 });
            const entriesWithFilename = result.hists.filter(h => h.values).filter(h => 'filename' in h.values);

            expect(entriesWithFilename).toHaveLength(0);
        });

        it('hides original filename from an unregistered visitor', async () => {
            expect.assertions(1);

            photo.handshake = { usObj: { registered: false } };

            const result = await photo.giveObjHist({ cid, fetchId: 1 });
            const entriesWithFilename = result.hists.filter(h => h.values).filter(h => 'filename' in h.values);

            expect(entriesWithFilename).toHaveLength(0);
        });

        it('shows original filename on the synthetic entry when no history exists yet', async () => {
            expect.assertions(2);

            await PhotoHistory.deleteMany({ cid });

            photo.handshake = { usObj: { registered: true, user: owner } };

            const result = await photo.giveObjHist({ cid, fetchId: 1 });

            expect(result.hists).toHaveLength(1);
            expect(result.hists[0].values.filename).toBe(filename);
        });
    });
});
