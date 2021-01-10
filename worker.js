import ms from 'ms';
import moment from 'moment';
import log4js from 'log4js';
import config from './config';
import connectDb, { waitDb, dbRedis } from './controllers/connection';
import { archiveExpiredSessions, calcUserStats } from './controllers/_session';
import { convertPhotosAll } from './controllers/converter';
import { clusterPhotosAll } from './controllers/cluster';
import { createQueue } from './controllers/queue';

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
        setupSessionQueue();
        setupUserJobsQueue();
    });
}

/**
 * Setup queue for session jobs.
 */
function setupSessionQueue() {
    createQueue('session').then((sessionQueue) => {
        // session.archiveExpiredSessions
        sessionQueue.process('archiveExpiredSessions', function(job){
            return archiveExpiredSessions();
        });

        // session.calcUserStats
        sessionQueue.process('calcUserStats', function(job){
            return calcUserStats();
        });

        // Add archiveExpiredSessions periodic job.
        sessionQueue.add('archiveExpiredSessions', {}, {
            removeOnComplete: 2, // Needed to be able to retrieve it on global even listener (in different runner).
            removeOnFail: true,
            repeat: { every: ms('5m') },
        });

        // Add calcUserStatsJob periodic job.
        sessionQueue.add('calcUserStats', {}, {
            removeOnComplete: 2,
            removeOnFail: true,
            repeat: { every: ms('1d') },
        });
    });
}

/**
 * Setup queue for user jobs (non-regular).
 */
function setupUserJobsQueue() {
    createQueue('userjobs').then((userJobsQueue) => {
        // converter.convertPhotosAll
        userJobsQueue.process('convertPhotosAll', function(job){
            return convertPhotosAll(job.data);
        });
        // cluster.clusterPhotosAll
        userJobsQueue.process('clusterPhotosAll', function(job){
            return clusterPhotosAll(job.data);
        });
    });
}
