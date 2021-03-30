import log4js from 'log4js';
import config from '../config';
import Queue from 'bull';
import constantsError from '../app/errors/constants';
import { ApplicationError } from '../app/errors';
import exitHook from 'async-exit-hook';

const logger = log4js.getLogger('queue');
const queueInstances = new Map();

exitHook(cb => {
    logger.info('Stopping all queues');
    shutdownQueues().then(() => cb());
});

/**
 * Gracefully shutdown all opened queues.
 *
 * @returns {Promise}
 */
function shutdownQueues() {
    const queues = Array.from(queueInstances.values()).map(queue => queue.close(false).then(() => {
        logger.info(`Closed queue '${queue.name}'`);
    }));

    return Promise.all(queues);
}

/**
 * Retrieve an open queue. If queue has not been opened yet, create a new instance.
 *
 * @param {string} name Name of the queue.
 * @returns {Queue}
 */
function getQueue(name) {
    if (queueInstances.has(name)) {
        return queueInstances.get(name);
    }

    const queue = new Queue(name, { redis: config.redis });

    queueInstances.set(name, queue);

    return queue;
}

/**
 * Initialise a queue. This is supposed to be used on worker start.
 *
 * @param {string} name Name of the queue.
 * @returns {Queue}
 */
export async function createQueue(name) {
    if (queueInstances.has(name)) {
        // Queue is already created and initialised.
        console.warn(`Calling createQueue on existing queue ${name}, use getQueue instead.`);

        return queueInstances.get(name);
    }

    const queueLogPrefix = `Queue '${name}'`;

    logger.info(`${queueLogPrefix} is initialised`);

    const queue = new Queue(name, { redis: config.redis });

    // Clear all jobs left from previous run.
    // TODO: Check if this is needed especially if we use more than one
    // worker.
    await queue.getJobs().then(() => Promise.all([queue.empty(), queue.removeJobs('*')]))
        .then(() => {
            logger.info(`${queueLogPrefix} is cleared.`);
        });

    // Report on job start to log.
    queue.on('active', (job/*, jobPromise*/) => {
        logger.info(`${queueLogPrefix} job '${job.name}' processing started`);
    });

    // Report on job completion to log.
    queue.on('completed', (job, result) => {
        job = job.toJSON();
        logger.info(`${queueLogPrefix} job '${job.name}' is completed in ${(job.finishedOn - job.processedOn) / 1000}s.`);

        if (result.message) {
            logger.info(`${queueLogPrefix} job '${job.name}' reported: ${result.message}`);
        }

        if (job.opts.repeat) {
            const opts = job.opts.repeat;

            if (opts.every) {
                const nextRunMillis = Math.floor(Date.now() / opts.every) * opts.every + opts.every;
                const nextRun = new Date(nextRunMillis).toString();

                logger.info(`${queueLogPrefix} job '${job.name}' next run is scheduled on ${nextRun}`);
            }
            // TODO: Output next run info for jobs defined using cron syntax.
        }
    });
    // Report on job failed to log.
    queue.on('failed', (job, err) => {
        job = job.toJSON();
        logger.error(`${queueLogPrefix} job '${job.name}' failed with error: ${err}`);
    });
    // Add to the list of opened queues.
    queueInstances.set(name, queue);

    return queue;
}

/**
 * Job completion listener class. Triggers callbacks on global job completion
 * event. Designed to be used on frontend instance when some code needs to be
 * executed following regular task completion on worker instance.
 */
export class JobCompletionListener {
    constructor(queueName) {
        this.jobCompletionCallbacks = new Map();
        this.queue = getQueue(queueName);
    }

    /**
     * Initialise queue completion event listening.
     */
    init() {
        this.queue.on('global:completed', (jobId, result) => {
            this.queue.getJob(jobId).then(job => {
                if (job === null) {
                    logger.error(`${jobId} can't be located, make sure you don't remove job on completion`);
                    throw new ApplicationError(constantsError.QUEUE_JOB_NOT_FOUND);
                }

                if (this.jobCompletionCallbacks.has(job.name)) {
                    logger.info(`Executing callback on job '${job.name}' completion in '${job.queue.name}' queue`);

                    const callback = this.jobCompletionCallbacks.get(job.name);

                    result = JSON.parse(result); // In global event result is serialised.
                    callback(result.data || null);
                }
            });
        });
        logger.info(`Initiaise job completion event listening in '${this.queue.name}' queue`);
    }

    /**
     * Add job completed callback. Callback receives JSON serialised
     * result.data from job processing promise.
     *
     * @param {string} jobName
     * @param {Function} callback - The callback function that handles the response, result.data is passed as param.
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
    return getQueue('userjobs').add(jobName, params || {})
        .then(job => {
            logger.info(`Added job '${job.name}' for processing in '${job.queue.name}' queue`);

            // Wait for job completion.
            return job.finished();
        })
        .then(result => result.data || {})
        .catch(error => ({ 'error': error }));
}
