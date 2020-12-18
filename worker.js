import ms from 'ms';
import moment from 'moment';
import log4js from 'log4js';
import config from './config';
import connectDb, { waitDb, dbRedis } from './controllers/connection';
import Queue from 'bull';
import { archiveExpiredSessions } from './controllers/_session';

const logger = log4js.getLogger('worker');

export async function configure(startStamp) {
    logger.info('Application Hash: ' + config.hash);

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, poolSize: config.mongo.pool },
        logger,
    });

    moment.locale(config.lang); // Set global language for momentjs

    logger.info(`Worker started up in ${(Date.now() - startStamp) / 1000}s`);

    waitDb.then(() => {
        sessionQueue();
        //sessionQueueA();
    });
}

/**
 * Initialise a queue. This is supposed to be used on worker start.
 * @param {string} name Name of the queue.
 * @return {Queue}
 */
async function createQueue(name) {
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

/**
 * Setup queue for session jobs.
 */
function sessionQueue() {
    createQueue('session').then((sessionQueue) => {
        sessionQueue.process('archiveExpiredSessions', function(job){
            return archiveExpiredSessions();
        });

        // Add archiveExpiredSessions periodic job.
        sessionQueue.add('archiveExpiredSessions', {}, {
            removeOnComplete: true,
            removeOnFail: true,
            repeat: { every: ms('5m') },
        });
    });
}

function sessionQueueA() {
    const sessionQueue = new Queue('sessionA', { redis: config.redis });
    sessionQueue.isReady().then(() => {
        sessionQueue.process(function(job){
            console.log("QueueA", job.data);
            return new Promise( res => {
                // Resolve in 3 sec.
                setTimeout(res, 3000, 'sdsd');
            });
        });

        // Add job.
        const job1 = sessionQueue.add({key: 'value'}, {
            removeOnComplete: true,
            removeOnFail: true,
        });
        // Add another job.
        const job2 = sessionQueue.add({key: 'value'}, {
            removeOnComplete: true,
            removeOnFail: true,
        });


        sessionQueue.on('completed', function(job, result) {
            console.log(`Job ${job.id} completed! Result: ${result}`);
            sessionQueue.getJobCounts().then(jobs => {
                console.log(jobs);
            });
        });

        Promise.all([job1, job2]).then( () => {
            sessionQueue.close();
        });
    });
}
