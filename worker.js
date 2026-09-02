/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import ms from 'ms';
import moment from 'moment';
import log4js from 'log4js';
import config from './config/server.js';
import connectDb, { waitDb, syncAllIndexes } from './controllers/connection.js';
import { checkPendingMigrations } from './controllers/migration.js';
import { archiveExpiredSessions, calcUserStats } from './controllers/_session.js';
import { convertPhotosAll } from './controllers/converter.js';
import { clusterPhotosAll } from './controllers/cluster.js';
import { calcRegionStats } from './controllers/region.js';
import { createQueue } from './controllers/queue.js';

import './controllers/systemjs.js';

const logger = log4js.getLogger('worker');

export async function configure(startStamp) {
    logger.info('Application Hash: ' + config.hash);

    // Perform migration.
    await checkPendingMigrations(true);

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, maxPoolSize: config.mongo.pool },
        logger,
    });

    moment.locale(config.lang); // Set global language for momentjs

    logger.info(`Worker started up in ${(Date.now() - startStamp) / 1000}s`);

    waitDb.then(() => {
        logger.info('Syncing indexes defined in model schemas to MongoDB.');

        return syncAllIndexes();
    }).then(() => {
        setupSessionQueue();
        setupUserJobsQueue();
    }).catch(err => {
        logger.fatal(`Worker initialisation failed, queues are not processing: ${err && err.stack || err}`);
        process.exit(1);
    });
}

/**
 * Setup queue for session jobs.
 */
function setupSessionQueue() {
    // archiveExpiredSessions runs every 5 minutes, so a silent worker means
    // its blocking connection died without an error (that once left the queue
    // unprocessed for 2.5 months in production); exit to get restarted.
    createQueue('session', { silenceTimeout: ms('15m') }).then(sessionQueue => {
        // session.archiveExpiredSessions
        sessionQueue.process('archiveExpiredSessions', job => archiveExpiredSessions(job.data));

        // session.calcUserStats
        sessionQueue.process('calcUserStats', job => calcUserStats(job.data));

        // Add archiveExpiredSessions periodic job.
        sessionQueue.add('archiveExpiredSessions', {}, {
            removeOnComplete: 2, // Needed to be able to retrieve it on global event listener (in different runner).
            removeOnFail: true,
            repeat: { every: ms('5m') },
        }).catch(err => logger.error(`Adding archiveExpiredSessions periodic job failed: ${err}`));

        // Add calcUserStatsJob periodic job.
        sessionQueue.add('calcUserStats', {}, {
            removeOnComplete: 2,
            removeOnFail: true,
            repeat: { every: ms('1d') },
        }).catch(err => logger.error(`Adding calcUserStats periodic job failed: ${err}`));
    });
}

/**
 * Setup queue for user jobs (non-regular).
 */
function setupUserJobsQueue() {
    createQueue('userjobs').then(userJobsQueue => {
        // converter.convertPhotosAll
        userJobsQueue.process('convertPhotosAll', job => convertPhotosAll(job.data));
        // cluster.clusterPhotosAll
        userJobsQueue.process('clusterPhotosAll', job => clusterPhotosAll(job.data));
        // region.calcRegionStats
        userJobsQueue.process('calcRegionStats', job => calcRegionStats(job.data));
    });
}
