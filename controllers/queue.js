import ms from 'ms';
import log4js from 'log4js';
import config from '../config';
import connectDb, { waitDb, dbRedis } from './connection';
import Queue from 'bull';
import constantsError from '../app/errors/constants';
import { ApplicationError } from '../app/errors';

const logger = log4js.getLogger('session');

/**
 * Initialise a queue. This is supposed to be used on worker start.
 * @param {string} name Name of the queue.
 * @return {Queue}
 */
export async function createQueue(name) {
    const queueLogPrefix = `Queue '${name}'`;
    logger.info(`${queueLogPrefix} is initialised.`);
    const queue = new Queue(name, { redis: config.redis });
    // Clear all jobs left from previous run.
    // TODO: Check if this is needed especially if we use more than one
    // worker.
    await queue.getJobs().then(jobs => {
        return Promise.all([queue.empty(), queue.removeJobs('*')]);
    })
    .then(() => {
        logger.info(`${queueLogPrefix} is cleared.`);
    });

    // Report on job start to log.
    queue.on('active', function(job/*, jobPromise*/) {
        logger.info(`${queueLogPrefix} job '${job.name}' processing started.`);
    });

    // Report on job completion to log.
    queue.on('completed', function(job, result) {
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
                logger.info(`${queueLogPrefix} job '${job.name}' next run is scheduled on ${nextRun}.`);
            }
            // TODO: Output next run info for jobs defined using cron syntax.
        }
    });
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
        this.queue = new Queue(queueName, { redis: config.redis });
    }

    /**
     * Initialise queue completion event listening.
     */
    init() {
        this.queue.on('global:completed', (jobId, result) => {
            this.queue.getJob(jobId).then(job => {
                if (job === null) {
                    logger.error(`${jobId} can't be located, make sure you don't remove job on completion.`);
                    throw new ApplicationError(constantsError.QUEUE_JOB_NOT_FOUND);
                }
                if (this.jobCompletionCallbacks.has(job.name)) {
                    logger.info(`Executing callback on job ${job.name} completion in ${job.queue.name} queue.`);
                    const callback = this.jobCompletionCallbacks.get(job.name);
                    result = JSON.parse(result);
                    callback(result.data || null);
                }
            });
        });
        logger.info(`Initiaise ${this.queue.name} completed global event listening.`);
    }

    /**
    * Add job completed callback. Callback receives JSON serialised
    * result.data from job processing promise.
    * @param {string} jobName
    * @param callback - The callback function that handles the response, result.data is passed as param.
    */
    addCallback(jobName, callback) {
        logger.info(`Add job completion callback: ${jobName} -> ${callback.name}`);
        this.jobCompletionCallbacks.set(jobName, callback);
    }
}
