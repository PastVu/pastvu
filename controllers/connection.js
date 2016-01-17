import mongoose from 'mongoose';
import log4js from 'log4js';

// Set native Promise as mongoose promise provider
mongoose.Promise = Promise;

const modelPromises = [];
let connectionPromise;
let getDBResolve;
let getDBReject;

export let db = null;
export let dbEval = null;
export let dbNative = null;

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

export default function (uri, poolSize = 1, logger = log4js.getLogger('app')) {
    if (!connectionPromise) {
        connectionPromise = new Promise(function (resolve, reject) {
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
                        connectTimeoutMS: 0
                    }
                }
            });

            async function openHandler() {
                const adminDb = db.db.admin(); // Use the admin database for some operation

                const [buildInfo, serverStatus] = await* [adminDb.buildInfo(), adminDb.serverStatus()];

                logger.info(
                    `MongoDB[${buildInfo.version}, ${serverStatus.storageEngine.name}, x${buildInfo.bits},`,
                    `pid ${serverStatus.pid}] connected through Mongoose[${mongoose.version}]`,
                    `with poolsize ${poolSize} at: ${uri}`
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
                    logger.info('MongoDB reconnected at: ' + uri);
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

                await* modelPromises.map(modelPromise => modelPromise(db));
                modelPromises.splice(0, modelPromises.length); // Clear promises array

                getDBResolve(db);
                resolve(db);
            }

            function errFirstHandler(err) {
                logger.error('Connection error to MongoDB at: ' + uri);
                getDBReject(err);
                reject(err);
            }
        });
    }

    return connectionPromise;
};