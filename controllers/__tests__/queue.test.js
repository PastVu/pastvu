/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { createQueue, JobCompletionListener, runJob, shutdownQueues } from '../queue';

// Integration test: runs against redis-memory-server started in tests/globalSetup.js.

jest.setTimeout(20000);

// Returns callback and promise resolved with the argument callback is called with.
function callbackWithPromise() {
    let resolve;
    const called = new Promise(res => {
        resolve = res;
    });

    return { callback: jest.fn(resolve), called };
}

describe('queue job completion', () => {
    const queueName = `test-${Date.now()}`;
    let queue;
    let listener;

    beforeAll(async () => {
        queue = await createQueue(queueName);
        queue.process('withData', async job => ({ data: { echo: job.data.value } }));
        queue.process('noCallback', async () => ({ data: { ignored: true } }));

        listener = new JobCompletionListener(queueName);
        await listener.queueEvents.waitUntilReady();
    });

    afterAll(async () => {
        await shutdownQueues();
    });

    it('invokes registered callback with result.data on job completion', async () => {
        expect.assertions(2);

        const { callback, called } = callbackWithPromise();

        listener.addCallback('withData', callback);
        listener.init();

        await queue.add('withData', { value: 42 }, { removeOnComplete: 2 });
        await called;

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ echo: 42 });
    });

    it('does not invoke callbacks of other jobs', async () => {
        expect.assertions(2);

        const { callback, called } = callbackWithPromise();

        listener.addCallback('withData', callback);

        await queue.add('noCallback', {}, { removeOnComplete: 2 });
        // Follow up with a job having callback to know noCallback was processed before.
        await queue.add('withData', { value: 1 }, { removeOnComplete: 2 });
        await called;

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ echo: 1 });
    });

    it('runJob returns result.data to the caller', async () => {
        expect.assertions(1);

        const userJobs = await createQueue('userjobs');

        userJobs.process('calcRegionStats', async job => ({ data: { got: job.data.cids } }));

        const result = await runJob('calcRegionStats', { cids: [1, 2] });

        expect(result).toStrictEqual({ got: [1, 2] });
    });
});
