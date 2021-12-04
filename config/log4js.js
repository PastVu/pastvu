/**
 * Log4js configuration.
 */

const path = require('path');
const _ = require('lodash');
const makeDir = require('make-dir');

// Default configuration (logging to stdout only).
let configDefault = {
    appenders: {
        out: {
            type: 'stdout',
        },
    },
    categories: {
        default: {
            appenders: ['out'],
            level: 'INFO',
        },
        http: {
            appenders: ['out'],
            level: 'ERROR',
        },
    },
};

// Configure logging to filesystem.
const configFile = {
    appenders: {
        file: {
            type: 'file',
            filename: 'all.log',
            maxLogSize: 15728640,
            backups: 3,
        },
        errorFile: {
            type: 'file',
            filename: 'errors.log',
            maxLogSize: 15728640,
            backups: 3,
        },
        errors: {
            type: 'logLevelFilter',
            level: 'error',
            appender: 'errorFile',
        },
        httpErrorFile: {
            type: 'file',
            filename: 'http-errors.log',
            maxLogSize: 15728640,
            backups: 3,
        },
    },
    categories: {
        default: {
            appenders: ['file', 'errors'],
            level: 'INFO',
        },
        http: {
            appenders: ['httpErrorFile'],
            level: 'ERROR',
        },
    },
};

module.exports = function (config) {
    // Set default log level.
    configDefault.categories.default.level = config.env === 'production' ? 'INFO' : 'ALL';

    if (config.logPath) {
        // Logging to filesystem.
        config.logPath = path.resolve(config.logPath);
        makeDir.sync(config.logPath);
        // Set logging path.
        _.each(configFile.appenders, appender => {
            if (appender.filename) {
                appender.filename = path.join(config.logPath, appender.filename);
            }
        });
        // Merge with default configuration.
        configDefault = _.mergeWith(configFile, configDefault, (objValue, srcValue) => {
            if (_.isArray(objValue)) {
                return objValue.concat(srcValue);
            }
        });
    }

    return configDefault;
};
