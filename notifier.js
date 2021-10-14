import moment from 'moment';
import log4js from 'log4js';
import config from './config';
import connectDb from './controllers/connection';

import { ready as mailReady } from './controllers/mail';
import { ready as subscrReady } from './controllers/subscr';
import { ready as settingsReady } from './controllers/settings';

import './models/_initValues';
import './controllers/systemjs';

export async function configure(startStamp) {
    const logger = log4js.getLogger('notifier');

    logger.info('Application Hash: ' + config.hash);

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, poolSize: config.mongo.pool },
        logger,
    });

    moment.locale(config.lang); // Set global language for momentjs

    await Promise.all([settingsReady, subscrReady, mailReady]);

    logger.info(`Notifier started up in ${(Date.now() - startStamp) / 1000}s`);
}
