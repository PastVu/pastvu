import ms from 'ms';
import util from 'util';
import log4js from 'log4js';
import { ApplicationError } from '../app/errors';
import constantsError from '../app/errors/constants';

const modelPromises = [];
let connectionPromises;
let getDBResolve;
let getDBReject;

export let db = null;
export let dbEval = null;
export let dbNative = null;
export let dbRedis = null;

export const waitDb = new Promise(function (resolve, reject) {
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

export default option => connectionPromises || init(option);

function init({ mongo, redis, logger = log4js.getLogger('app') }) {
    connectionPromises = [];

    if (mongo) {
        const mongoose = require('mongoose');
        const { uri, poolSize = 1 } = mongo;

        // Set native Promise as mongoose promise provider
        mongoose.Promise = Promise;

        connectionPromises.push(new Promise((resolve, reject) => {
            db = mongoose.createConnection() // http://mongoosejs.com/docs/api.html#connection_Connection
                .once('open', openHandler)
                .once('error', errFirstHandler);

            db.open(uri, {
                db: { native_parser: true, promiseLibrary: Promise },
                server: {
                    poolSize,
                    auto_reconnect: true,
                    reconnectTries: 10000,
                    reconnectInterval: 1000,
                    socketOptions: {
                        noDelay: true,
                        keepAlive: 0, // Enable keep alive connection
                        autoReconnect: true,
                        socketTimeoutMS: 0,
                        connectTimeoutMS: ms('5m')
                    }
                }
            });

            async function openHandler() {
                const adminDb = db.db.admin(); // Use the admin database for some operation

                const [buildInfo, serverStatus] = await Promise.all([adminDb.buildInfo(), adminDb.serverStatus()]);

                logger.info(
                    `MongoDB[${buildInfo.version}, ${serverStatus.storageEngine.name}, x${buildInfo.bits},`,
                    `pid ${serverStatus.pid}] connected through Mongoose[${mongoose.version}]`,
                    `with poolsize ${poolSize} at ${uri}`
                );

                // Full list of events can be found here
                // https://github.com/Automattic/mongoose/blob/master/lib/connection.js#L33
                db.removeListener('error', errFirstHandler);
                db.on('error', function (err) {
                    logger.error(`MongoDB connection error to ${uri}`, err);
                });
                db.on('disconnected', function () {
                    logger.error('MongoDB disconnected!');
                });
                db.on('close', function () {
                    logger.error('MongoDB connection closed and onClose executed on all of this connections models!');
                });
                db.on('reconnected', function () {
                    logger.info('MongoDB reconnected at ' + uri);
                });

                dbNative = db.db;

                // Wrapper to deal with eval crash on some enviroments (gentoo), when one of parameters are object
                // https://jira.mongodb.org/browse/SERVER-21041
                // So, do parameters stringify and parse them inside eval function
                // mongodb-native eval returns promise
                dbEval = (functionName, params, options) => dbNative.eval(
                    `function (params) {return ${functionName}.apply(null, JSON.parse(params));}`,
                    JSON.stringify(Array.isArray(params) ? params : [params]),
                    options
                );

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
        redis = require('redis');

        connectionPromises.push(new Promise((resolve, reject) => {
            config.retry_strategy = function (options) {
                // End reconnecting after a specific timeout and flush all commands with a individual error
                if (options.total_retry_time > maxReconnectTime) {
                    const error = new ApplicationError(constantsError.REDIS_MAX_CONNECTION_ATTEMPS);

                    reject(error); // Reject if it's first time, not doesn't matter in loosing connections in runtime
                    return error; // If it's runtime disconnection, this error will be thrown back to every redis call
                }

                // reconnect after
                return Math.min(Math.max(options.attempt * 100, 1000), 4000);
            };

            dbRedis = redis.createClient(config)
                .on('ready', function readyHandler() {
                    const server = dbRedis.server_info;
                    const uri = `${config.host}:${server.tcp_port}`;
                    logger.info(
                        `Redis[${server.redis_version}, gcc ${server.gcc_version}, x${server.arch_bits},`,
                        `pid ${server.process_id}] connected at ${uri}`
                    );
                    resolve(dbRedis);
                })
                .on('error', error => {
                    logger.warn(error.message);
                    reject(error);
                })
                .on('reconnecting', params => {
                    const uri = `${config.host}:${config.port}`;
                    logger.warn(
                        `Redis ${params.attempt} reconnection attemp at ${uri}.`,
                        `Time to stop trying ${(maxReconnectTime - params.total_retry_time) / 1000}s`
                    );
                });

            // Create promisified methods
            dbRedis.getAsync = util.promisify(dbRedis.get).bind(dbRedis);
            dbRedis.setAsync = util.promisify(dbRedis.set).bind(dbRedis);
            dbRedis.evalAsync = util.promisify(dbRedis.eval).bind(dbRedis);
        }));
    }

    return Promise.all(connectionPromises);
}