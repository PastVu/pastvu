/**
 * Migrate-mongo configuration.
 */
const mongoConfig = require('./').mongo;

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
