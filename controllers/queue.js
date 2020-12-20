import ms from 'ms';
import log4js from 'log4js';
import config from '../config';
import connectDb, { waitDb, dbRedis } from './connection';
import Queue from 'bull';

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
        if (result.message) {
            logger.info(`${queueLogPrefix} job '${job.name}' reported: ${result.message}`);
        }
        logger.info(`${queueLogPrefix} job '${job.name}' is completed.`);
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
