/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import log4js from 'log4js';
import { Queue, Worker, QueueEvents } from 'bullmq';
import config from '../config';
import constantsError from '../app/errors/constants';
import { ApplicationError } from '../app/errors';
import exitHook from 'async-exit-hook';

const logger = log4js.getLogger('queue');

const queueInstances = new Map();      // name -> Queue
const workerInstances = new Map();     // name -> Worker
const queueEventInstances = new Map(); // name -> QueueEvents
const handlersByQueue = new Map();     // name -> Map(jobName -> handler)

const connection = {
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
};

exitHook(cb => {
    logger.info('Stopping all queues');
    shutdownQueues().then(() => cb());
});

/**
 * Gracefully shutdown all opened queues, workers, and queue event listeners.
 *
 * @returns {Promise}
 */
function shutdownQueues() {
    const closing = [];

    for (const [name, worker] of workerInstances) {
        closing.push(worker.close().then(() => logger.info(`Closed worker for queue '${name}'`)));
    }

    for (const [name, qe] of queueEventInstances) {
        closing.push(qe.close().then(() => logger.info(`Closed queue events for '${name}'`)));
    }

    for (const [name, queue] of queueInstances) {
        closing.push(queue.close().then(() => logger.info(`Closed queue '${name}'`)));
    }

    return Promise.all(closing);
}

/**
 * Retrieve the underlying Queue producer. Lazily creates it on first access.
 *
 * @param {string} name Name of the queue.
 * @returns {Queue}
 */
function getQueue(name) {
    if (queueInstances.has(name)) {
        return queueInstances.get(name);
    }

    const queue = new Queue(name, { connection });

    queueInstances.set(name, queue);

    return queue;
}

/**
 * Retrieve the QueueEvents listener for cross-process job lifecycle events.
 * Lazily creates it on first access.
 *
 * @param {string} name Name of the queue.
 * @returns {QueueEvents}
 */
function getQueueEvents(name) {
    if (queueEventInstances.has(name)) {
        return queueEventInstances.get(name);
    }

    const queueEvents = new QueueEvents(name, { connection });

    queueEventInstances.set(name, queueEvents);

    return queueEvents;
}

/**
 * Initialise a queue, its worker, and per-job handler registry. This is
 * supposed to be used on worker start.
 *
 * @param {string} name Name of the queue.
 * @returns {{name: string, process: Function, add: Function}}
 */
export async function createQueue(name) {
    const queueLogPrefix = `Queue '${name}'`;
    const queue = getQueue(name);

    if (workerInstances.has(name)) {
        console.warn(`Calling createQueue on existing queue ${name}, use getQueue instead.`);
    } else {
        logger.info(`${queueLogPrefix} is initialised`);

        const handlers = new Map();

        handlersByQueue.set(name, handlers);

        const worker = new Worker(name, async job => {
            const handler = handlers.get(job.name);

            if (!handler) {
                throw new Error(`No handler registered for job '${job.name}' in queue '${name}'`);
            }

            return handler(job);
        }, { connection });

        worker.on('active', job => {
            logger.info(`${queueLogPrefix} job '${job.name}' processing started`);
        });

        worker.on('completed', (job, result) => {
            logger.info(`${queueLogPrefix} job '${job.name}' is completed in ${(job.finishedOn - job.processedOn) / 1000}s.`);

            if (result?.message) {
                logger.info(`${queueLogPrefix} job '${job.name}' reported: ${result.message}`);
            }

            const every = job.opts.repeat?.every;

            if (every) {
                const nextRunMillis = Math.floor(Date.now() / every) * every + every;
                const nextRun = new Date(nextRunMillis).toString();

                logger.info(`${queueLogPrefix} job '${job.name}' next run is scheduled on ${nextRun}`);
            }
            // TODO: Output next run info for jobs defined using cron syntax.
        });

        worker.on('failed', (job, err) => {
            logger.error(`${queueLogPrefix} job '${job?.name}' failed with error: ${err}`);
        });

        worker.on('error', err => {
            logger.error(`${queueLogPrefix} worker reported error: ${err}`);
        });

        workerInstances.set(name, worker);
    }

    const handlers = handlersByQueue.get(name);

    return {
        name,
        process: (jobName, handler) => handlers.set(jobName, handler),
        add: (jobName, data, opts) => queue.add(jobName, data, opts),
    };
}

/**
 * Job completion listener class. Triggers callbacks on global job completion
 * event. Designed to be used on frontend instance when some code needs to be
 * executed following regular task completion on worker instance.
 */
export class JobCompletionListener {
    constructor(queueName) {
        this.queueName = queueName;
        this.queue = getQueue(queueName);
        this.queueEvents = getQueueEvents(queueName);
        this.jobCompletionCallbacks = new Map();
    }

    /**
     * Initialise queue completion event listening.
     */
    init() {
        this.queueEvents.on('completed', async ({ jobId, returnvalue }) => {
            const job = await this.queue.getJob(jobId);

            if (!job) {
                logger.error(`${jobId} can't be located, make sure you don't remove job on completion`);
                throw new ApplicationError(constantsError.QUEUE_JOB_NOT_FOUND);
            }

            if (!this.jobCompletionCallbacks.has(job.name)) {
                return;
            }

            logger.info(`Executing callback on job '${job.name}' completion in '${this.queueName}' queue`);

            const callback = this.jobCompletionCallbacks.get(job.name);
            const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;

            callback(result?.data || null);
        });
        logger.info(`Initiaise job completion event listening in '${this.queueName}' queue`);
    }

    /**
     * Register a callback invoked on this queue's global job completion event.
     *
     * @param {string} jobName
     * @param {Function} callback - Receives the deserialised result.data (or null).
     */
    addCallback(jobName, callback) {
        logger.info(`Add job completion callback: ${jobName} -> ${callback.name}`);
        this.jobCompletionCallbacks.set(jobName, callback);
    }
}

/**
 * Run job and return result.
 *
 * @param {string} jobName Name of the job.
 * @param {object} params Params to pass to calling function.
 * @returns {Promise} Resolving to result.data from job processing promise.
 */
export function runJob(jobName, params) {
    // TODO: Only add job if it is not in the queue already or running now.
    const queue = getQueue('userjobs');

    return queue.add(jobName, params || {})
        .then(job => {
            logger.info(`Added job '${job.name}' for processing in '${job.queueName}' queue`);

            // Wait for job completion.
            return job.waitUntilFinished(getQueueEvents('userjobs'));
        })
        .then(result => result?.data || {})
        .catch(error => ({ error }));
}
