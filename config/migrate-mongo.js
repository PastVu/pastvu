/**
 * Migrate-mongo configuration.
 */
const mongoConfig = require('./').mongo;
const argv = require('yargs').argv;
const logger = require('log4js').getLogger('migrate-mongo');

// Replace node console with logger for up and down migration commands, so we have a
// log record for these actions.
if (argv._.includes('up') || argv._.includes('down')) {
    console.log = logger.info.bind(logger);
    console.error = logger.error.bind(logger);
}

const config = {
    mongodb: {
        url: mongoConfig.connection,
        options: {
            useNewUrlParser: true, // removes a deprecation warning when connecting
            useUnifiedTopology: true, // removes a deprecating warning when connecting
        },
    },
    migrationsDir: 'migrations',
    changelogCollectionName: 'changelog',
};

module.exports = config;
