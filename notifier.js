/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import moment from 'moment';
import log4js from 'log4js';
import config from './config/server.js';
import connectDb from './controllers/connection.js';

import { ready as mailReady } from './controllers/mail.js';
import { ready as subscrReady } from './controllers/subscr.js';
import { ready as settingsReady } from './controllers/settings.js';

import './models/_initValues.js';

export async function configure(startStamp) {
    const logger = log4js.getLogger('notifier');

    logger.info('Application Hash: ' + config.hash);

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, maxPoolSize: config.mongo.pool },
        logger,
    });

    moment.locale(config.lang); // Set global language for momentjs

    await Promise.all([settingsReady, subscrReady, mailReady]);

    logger.info(`Notifier started up in ${(Date.now() - startStamp) / 1000}s`);
}
