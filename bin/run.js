#!/usr/bin/env node
/**
 * Entry point to application. It's purpuse - to run script with transformation
 * This file is not being transformed by babel, nor being checked by eslint and that's why it must be written carefully
 */

const startStamp = Date.now();
const babelConfig = require('../babel/server.config');
// Use require-hook babel
require('babel-core/register')(Object.assign({}, babelConfig, {
    only: [ // May be array of regexp, or github.com/isaacs/node-glob
        '@(app|downloader|uploader).js',
        'controllers/!(api|apilog).js',
        'models/*.js',
        'config/*.js'
    ]
}));
function requireModule(modulePath) {
    return require(path.resolve(modulePath));
}

if (require.main !== module) { // If run.js is required by another fil
    module.exports = requireModule;
    return;
}

// If run.js was invoked directly
const os = require('os');
const fs = require('fs');
const _ = require('lodash');
const util = require('util');
const path = require('path');
const posix = require('posix');
const mkdirp = require('mkdirp');
const log4js = require('log4js');
const Bluebird = require('bluebird');

const argv = require('yargs')
    .help('help') // --help to get help
    .options('s', {
        'alias': 'script',
        'default': 'app.js',
        describe: 'Path to script to start'
    })
    .options('c', {
        alias: 'config',
        describe: 'Alternative path to config file'
    })
    .argv;

const config = require('../config');
const logPath = config.logPath;
const env = config.env;

mkdirp.sync(logPath);
log4js.configure('./log4js.json', { cwd: logPath });
if (env === 'development') {
    log4js.addAppender(log4js.appenders.console()); // In dev write all logs also to the console
}

const appName = path.parse(argv.script).name;
const logger = log4js.getLogger(appName);
const nofileLimits = posix.getrlimit('nofile');

// Handling uncaught exceptions
process.on('uncaughtException', function (err) {
    logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
    logger.trace(err && (err.stack || err));
});

process.on('exit', function () {
    logger.info('--SHUTDOWN--');
});

// Displays information about the environment and configuration
logger.info('●▬▬▬▬▬▬▬▬ ★ ▬▬▬▬▬▬▬▬●');
logger.info(
    `Starting ${appName} server v${config.version} in ${env.toUpperCase()} mode with NODE_ENV=${process.env.NODE_ENV}`
);
logger.info(`Platform: ${process.platform}, architecture: ${process.arch} with ${os.cpus().length} cpu cores`);
logger.info(`Node.js [${process.versions.node}] with v8 [${process.versions.v8}] on pid: ${process.pid}`);
logger.info(`Posix file descriptor limits: soft=${nofileLimits.soft}, hard=${nofileLimits.hard}`);
logger.info(`Configuration:\n`, util.inspect(
    // Do deep clone of config and shade password fields
    _.cloneDeep(config, (val, key) => key === 'pass' ? '######' : undefined),
    { depth: null, colors: env === 'development' }
));

// Enable verbose stack trace of Bluebird promises (not in production)
if (env !== 'production') {
    logger.info('Bluebird long stack traces are enabled');
    Bluebird.longStackTraces();
}
Bluebird.promisifyAll(fs);

const requiredModule = requireModule(argv.script);

if (typeof requiredModule.configure === 'function') {

    // Wrap configuration within try to catch error and exit
    try {
        const result = requiredModule.configure(startStamp);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }

    // If configuration has returned Promise, handle error with catch()
    if (result && result.catch) {
        result.catch(err => {
            logger.error(err);
            process.exit(1);
        });
    }
}

module.exports = requiredModule;