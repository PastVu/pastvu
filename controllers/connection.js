import Bluebird from 'bluebird';
import mongoose from 'mongoose';
import log4js from 'log4js';

// Set native Promise as mongoose promise provider
mongoose.Promise = Promise;

// Made methods works as promise. This methods'll be with Async postfix, e.g., model.saveAsync().then(..)
Bluebird.promisifyAll(mongoose);

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
    modelPromises.push(modelPromise);
    return waitDb;
};

export default function (uri, poolSize = 1, logger = log4js.getLogger('app.js')) {
    if (!connectionPromise) {
        connectionPromise = new Promise(function (resolve, reject) {
            db = mongoose.createConnection() // http://mongoosejs.com/docs/api.html#connection_Connection
                .once('open', openHandler)
                .once('error', errFirstHandler);

            db.open(uri, {
                db: { native_parser: true, promiseLibrary: Promise },
                server: { poolSize, auto_reconnect: true }
            });

            async function openHandler() {
                const adminDb = db.db.admin(); // Use the admin database for some operation

                const [buildInfo, serverStatus] = await* [adminDb.buildInfo(), adminDb.serverStatus()];

                logger.info(
                    `MongoDB[${buildInfo.version}, ${serverStatus.storageEngine.name}, x${buildInfo.bits}, ` +
                    `pid ${serverStatus.pid}] connected through Mongoose[${mongoose.version}] at: ${uri}`
                );

                db.removeListener('error', errFirstHandler);
                db.on('error', function (err) {
                    logger.error('Connection error to MongoDB at: ' + uri);
                    logger.error(err && (err.message || err));
                });
                db.on('reconnected', function () {
                    logger.info('Reconnected to MongoDB at: ' + uri);
                });

                dbNative = db.db;
                dbEval = Bluebird.promisify(dbNative.eval, dbNative);

                await* modelPromises.map(modelPromise => modelPromise(db));

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