#!/usr/bin/env node
/**
 * Entry point to application. Its purpose is to run the requested script with common setup.
 */
import os from 'os';
import path from 'path';
import util from 'util';
import { pathToFileURL } from 'url';
import _ from 'lodash';
import log4js from 'log4js';
import config from '../config/server.js';

const startStamp = Date.now();

const { values: argv } = util.parseArgs({
    options: {
        script: { type: 'string', short: 's', default: 'app.js' },
        primary: { type: 'boolean', default: false },
        logConfig: { type: 'boolean', default: true },
    },
    strict: false,
});

const env = config.env;
const appName = path.parse(argv.script).name;
const logger = log4js.getLogger(appName);

if (appName === 'notifier') config.notifier = true;
config.primary = !!argv.primary; // If not true, the instance will run as a replica

// Handling uncaught exceptions
process.on('uncaughtException', err => {
    logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
    logger.trace(err && (err.stack || err));
});

// Displays information about the environment and configuration
logger.info('●▬▬▬▬▬▬▬▬ ★ ▬▬▬▬▬▬▬▬●');
logger.info(
    `Starting ${appName} server v${config.version} in ${env.toUpperCase()} mode with NODE_ENV=${process.env.NODE_ENV}`
);
logger.info(`Platform: ${process.platform}, architecture: ${process.arch} with ${os.cpus().length} cpu cores`);
logger.info(`Node.js [${process.versions.node}] with v8 [${process.versions.v8}] on pid: ${process.pid}`);

if (argv.logConfig) {
    logger.info('Configuration:\n', util.inspect(
        // Do deep clone of config and shade password fields
        _.cloneDeep(config, (val, key) => key === 'pass' ? '######' : undefined),
        { depth: null, colors: env === 'development' }
    ));
}

const requiredModule = await import(pathToFileURL(path.resolve(argv.script)).href);

if (typeof requiredModule.configure === 'function') {
    // Wrap configuration within try to catch error and exit
    try {
        const result = requiredModule.configure(startStamp);

        // If configuration has returned Promise, handle error with catch()
        if (result && result.catch) {
            result.catch(err => {
                logger.error(err);
                process.exit(1);
            });
        }
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
}
