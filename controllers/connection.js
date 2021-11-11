import ms from 'ms';
import log4js from 'log4js';
import { ApplicationError } from '../app/errors';
import constantsError from '../app/errors/constants';
import exitHook from 'async-exit-hook';
import { checkPendingMigrations } from './migration';

const modelPromises = [];
let connectionPromises;
let getDBResolve;
let getDBReject;

export let db = null;
export let dbNative = null;
export let dbRedis = null;

export const waitDb = new Promise((resolve, reject) => {
    getDBResolve = resolve;
    getDBReject = reject;
});

export const registerModel = modelPromise => {
    if (db) {
        modelPromise(db);
    } else {
        modelPromises.push(modelPromise);
    }

    return waitDb;
};

/**
 * Ensures that the indexes defined in model schemas match the indexes
 * in respective MongoDB collections.
 *
 * @returns {Promise} Promise that resolves when all indexes sync is completed.
 */
export async function syncAllIndexes() {
    const syncPromises = db.modelNames().map(modelName => db.model(modelName).syncIndexes());

    return Promise.all(syncPromises);
}

export default option => connectionPromises || init(option);

function init({ mongo, redis, logger = log4js.getLogger('app') }) {
    connectionPromises = [];

    if (mongo) {
        const mongoose = require('mongoose');
        const { uri, poolSize = 1 } = mongo;
        let connErrorLogLevel = 'error';

        // Set native Promise as mongoose promise provider
        mongoose.Promise = Promise;

        connectionPromises.push(new Promise((resolve, reject) => {
            mongoose.connect(uri, {
                poolSize,
                promiseLibrary: Promise,
                noDelay: true,
                keepAlive: 0, // Enable keep alive connection
                socketTimeoutMS: 0,
                connectTimeoutMS: ms('5m'),
                useUnifiedTopology: true, // Use new topology engine (since MongoDB driver 3.3)
                useNewUrlParser: true, // Use new connection string parser.
                useCreateIndex: true, // Use createIndex internally (ensureIndex is deprecated in MongoDB driver 3.2).
                useFindAndModify: false, // Use findOneAndUpdate interally (findAndModify is deprecated in MongoDB driver 3.1).
                autoIndex: false, // Do not attempt to create index automatically, we use syncIndexes in worker.
            }).then(openHandler, errFirstHandler);

            exitHook(cb => {
                // Connection related events are no longer regarded as errors.
                connErrorLogLevel = 'info';
                logger.info('MongoDB client is shutting down');
                db.close(cb);
            });

            async function openHandler() {
                db = mongoose.connection;
                dbNative = db.db;

                const adminDb = db.db.admin(); // Use the admin database for some operation
                const [buildInfo, serverStatus, listDatabases] = await Promise.all([adminDb.buildInfo(),
                    adminDb.serverStatus(), adminDb.listDatabases()]);

                if (!listDatabases.databases.some(r => r.name === db.name)) {
                    // MongoDB allows connection to non-existing databases,
                    // it is not an error, but we require database to exist
                    // for operation.
                    return errFirstHandler(`Database ${db.name} does not exist.`);
                }

                logger.info(
                    `MongoDB[${buildInfo.version}, ${serverStatus.storageEngine.name}, x${buildInfo.bits},`,
                    `pid ${serverStatus.pid}] connected through Mongoose[${mongoose.version}]`,
                    `with poolsize ${poolSize} at ${uri}`
                );

                // Hook on events.
                db.on('error', err => {
                    logger.error(`MongoDB connection error to ${uri}`, err);
                });
                db.on('disconnected', () => {
                    logger.log(connErrorLogLevel, 'MongoDB disconnected!');
                });
                db.on('close', () => {
                    logger.log(connErrorLogLevel, 'MongoDB connection closed and onClose executed on all of this connections models!');
                });
                db.on('reconnected', () => {
                    logger.info('MongoDB reconnected at ' + uri);
                });

                if (! await checkPendingMigrations()) {
                    const err = 'DB migration is required, make sure that worker instance is started or migrate manually';

                    getDBReject(err);
                    reject(err);
                }

                await Promise.all(modelPromises.map(modelPromise => modelPromise(db)));
                modelPromises.splice(0, modelPromises.length); // Clear promises array

                getDBResolve(db);
                resolve(db);
            }

            function errFirstHandler(err) {
                logger.error('Connection error to MongoDB at ' + uri);
                getDBReject(err);
                reject(err);
            }
        }));
    }

    if (redis) {
        const { maxReconnectTime, ...config } = redis;
        let totalRetryTime = 0;

        connectionPromises.push(new Promise((resolve, reject) => {
            const Redis = require('ioredis');

            config.retryStrategy = function (times) {
                // End reconnecting after a specific timeout and flush all commands with a individual error
                if (totalRetryTime > maxReconnectTime) {
                    const error = new ApplicationError(constantsError.REDIS_MAX_CONNECTION_ATTEMPS);

                    logger.error(error.message);
                    reject(error); // Reject if it's first time, not doesn't matter in loosing connections in runtime

                    return ''; // Return non-number to stop retrying.
                }

                const delay = Math.min(Math.max(times * 100, 1000), 4000);

                totalRetryTime += delay;

                // Reconnect after delay.
                return delay;
            };

            dbRedis = new Redis(config)
                .on('ready', () => {
                    // Reset retries.
                    totalRetryTime = 0;

                    // Report success to log.
                    const server = dbRedis.serverInfo;
                    const uri = `${config.host}:${server.tcp_port}`;

                    logger.info(
                        `Redis[${server.redis_version}, gcc ${server.gcc_version}, x${server.arch_bits},`,
                        `pid ${server.process_id}, ${server.redis_mode} mode] connected at ${uri}`
                    );
                    resolve(dbRedis);
                })
                .on('error', error => {
                    // Log error and reject promise if it is different to
                    // connection issue.  For connection issue we record error
                    // when retries limit is reached.
                    if (error.code !== 'ENOTFOUND') {
                        logger.error(error.message);
                        reject(error);
                    }
                })
                .on('reconnecting', () => {
                    const uri = `${config.host}:${config.port}`;
                    const time = Math.max((maxReconnectTime - totalRetryTime) / 1000, 0);

                    logger.warn(
                        `Redis reconnection attempt at ${uri}.`,
                        `Time to stop trying ${time}s`
                    );
                });

            exitHook(cb => {
                logger.info('Redis client is shutting down');
                dbRedis.quit(cb);
            });
        }));
    }

    return Promise.all(connectionPromises);
}
