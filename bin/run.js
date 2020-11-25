#!/usr/bin/env node
/**
 * Entry point to application. Its purpose is to run script with some common things and transformation in development
 * This file is not being transformed by babel
 */

const startStamp = Date.now();
const path = require('path');
const requireModule = modulePath => require(path.resolve(modulePath));
const babelHook = () => {
    // Use require-hook babel in development
    const babelConfig = require('../babel/server.config');
    const babelFiles = require('../babel/server.files');

    require('@babel/register')({ sourceMap: 'inline', ...babelFiles, ...babelConfig });
};

if (require.main !== module) { // If run.js is required by another module (for example gruntfile)
    babelHook();
    module.exports = requireModule;
} else {
    // If run.js was invoked directly
    const os = require('os');
    const _ = require('lodash');
    const util = require('util');
    const makeDir = require('make-dir');
    const log4js = require('log4js');

    const argv = require('yargs')
        .help('help') // --help to get help
        .options('s', {
            'alias': 'script',
            'default': 'app.js',
            describe: 'Path to script to start',
        })
        .options('c', {
            alias: 'config',
            describe: 'Alternative path to config file',
        })
        .options('lc', {
            alias: 'logConfig',
            describe: 'Log config',
            'default': true,
        })
        .argv;

    const config = require('../config');
    const logPath = config.logPath;
    const env = config.env;

    if (env === 'development') {
        babelHook();
    }

    makeDir.sync(logPath);
    log4js.configure('./log4js.json', { cwd: logPath });

    const appName = path.parse(argv.script).name;
    const logger = log4js.getLogger(appName);

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

    const requiredModule = requireModule(argv.script);

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

    module.exports = requiredModule;
}
