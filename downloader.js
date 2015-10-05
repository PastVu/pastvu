'use strict';

const startStamp = Date.now();

import './commons/JExtensions';
import fs from 'fs';
import os from 'os';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import http from 'http';
import mkdirp from 'mkdirp';
import log4js from 'log4js';
import { argv } from 'optimist';
import mongoose from 'mongoose';
import Bluebird from 'bluebird';
import Utils from './commons/Utils';
import contentDisposition from 'content-disposition';

const addresses = _.transform(os.networkInterfaces(), (result, face) => face.forEach(function (address) {
    if (address.family === 'IPv4' && !address.internal) {
        result.push(address.address);
    }
}), []);

const conf = JSON.parse(JSON.minify(fs.readFileSync(argv.conf || __dirname + '/config.json', 'utf8')));
const storePath = path.normalize(argv.storePath || conf.storePath || (__dirname + '/../store/'));
const land = argv.land || conf.land || 'dev'; // Environment (dev, test, prod)
const listenport = argv.dport || conf.dport || 3002;
const listenhost = argv.hostname || conf.hostname || undefined;

const moongoUri = argv.mongo || conf.mongo.con;
const moongoPool = argv.mongopool || conf.mongo.pool;

const domain = argv.domain || conf.domain || addresses[0] || '127.0.0.1'; // Server address for clients
const dport = argv.projectdport || conf.projectdport || ''; // Port of downloader server
const host = domain + dport; // Hostname (address+port)

const logPath = path.normalize(argv.logPath || conf.logPath || (__dirname + '/logs')); // Путь к папке логов

let Download;

console.log('\n');
mkdirp.sync(logPath);
log4js.configure('./log4js.json', { cwd: logPath });
if (land === 'dev') {
    // В dev выводим все логи также в консоль
    log4js.addAppender(log4js.appenders.console());
}
const logger = log4js.getLogger('downloader.js');

/**
 * Handling uncaught exceptions
 */
process.on('uncaughtException', function (err) {
    // Add here storage for saving and resuming
    logger.fatal('PROCESS uncaughtException: ' + (err && (err.message || err)));
    logger.trace(err && (err.stack || err));
});

// Enable detailed stack trace for blubird (not in production)
if (land !== 'prod') {
    logger.info('Bluebird long stack traces are enabled');
    Bluebird.longStackTraces();
}

// Made some libriries methods works as promise. This methods'll be with Async postfix, e.g., model.saveAsync().then(..)
Bluebird.promisifyAll(mongoose);
Bluebird.promisifyAll(fs);

function openConnection() {
    return new Promise(function (resolve, reject) {
        const db = mongoose.createConnection() // http://mongoosejs.com/docs/api.html#connection_Connection
            .once('open', openHandler)
            .once('error', errFirstHandler);

        db.open(moongoUri, {
            db: { native_parser: true, promiseLibrary: Promise },
            server: { poolSize: moongoPool, auto_reconnect: true }
        });

        async function openHandler() {
            const adminDb = db.db.admin(); // Use the admin database for some operation

            const [buildInfo, serverStatus] = await* [adminDb.buildInfo(), adminDb.serverStatus()];

            logger.info(
                `MongoDB[${buildInfo.version}, ${serverStatus.storageEngine.name}, x${buildInfo.bits}, ` +
                `pid ${serverStatus.pid}] connected through Mongoose[${mongoose.version}] at: ${moongoUri}`
            );

            db.removeListener('error', errFirstHandler);
            db.on('error', function (err) {
                logger.error('Connection error to MongoDB at: ' + moongoUri);
                logger.error(err && (err.message || err));
            });
            db.on('reconnected', function () {
                logger.info('Reconnected to MongoDB at: ' + moongoUri);
            });

            resolve(db);
        }

        function errFirstHandler(err) {
            logger.error('Connection error to MongoDB at: ' + moongoUri);
            reject(err);
        }
    });
}

const responseCode = function (code, response) {
    const textStatus = http.STATUS_CODES[code];

    // File must be downloaded, even if error occured, because ahref on page not '_blank'
    // So we keep 200 status for response and make file with actual status within it name and text inside
    response.setHeader('Content-Disposition', contentDisposition(`${code} ${textStatus}.html`));
    response.setHeader('Content-Type', 'text/html');

    response.end(textStatus);
};

const sendFile = function (filePath, response) {
    const file = new fs.ReadStream(filePath);

    file.pipe(response);

    file.on('error', function (err) {
        response.statusCode = 500;
        response.end('Server Error');
        logger.error(err);
    });

    // Handle unexpected client disconnection to close file read stream and release memory
    response.on('close', function () {
        file.destroy();
    });
};

// Manual promise for exists because fs.existsAsync can't be promisyfied by bluebird,
// because fs.exists doesn't call back with error as first argument
const exists = function (path) {
    return new Promise(function (resolve) {
        fs.exists(path, function (exists) {
            resolve(exists);
        });
    });
};

const utlPattern = /^\/download\/(\w{32})$/;

const handleRequest = async function (req, res) {
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Expires', '0');

    try {
        if (req.method !== 'GET') {
            return responseCode(405, res);
        }

        const key = _.get(req.url.match(utlPattern), '[1]');

        if (!key) {
            return responseCode(403, res);
        }

        const keyEntry = await Download.findOneAndRemoveAsync({ key }, { _id: 0, data: 1 });
        const keyData = _.get(keyEntry, 'data');
        let filePath = _.get(keyData, 'path');

        if (filePath) {
            filePath = path.join(storePath, filePath);
        }

        const fileAvailable = filePath && await exists(filePath);

        if (!fileAvailable) {
            logger.warn('File not available', keyEntry);
            return responseCode(404, res);
        }

        const size = keyData.size || (await fs.statAsync(filePath)).size;
        const fileName = contentDisposition(keyData.fileName);

        res.setHeader('Content-Disposition', fileName);
        res.setHeader('Content-Type', keyData.type || 'text/html');

        if (size) {
            res.setHeader('Content-Length', size);
        }

        logger.debug(`${keyData.login} get ${keyData.origin ? 'origin' : 'water'} of ${keyData.cid} as ${fileName}`);

        sendFile(filePath, res);
    } catch (err) {
        logger.error(err);
        responseCode(500, res);
    }
};

const scheduleMemInfo = (function () {
    const INTERVAL = ms('30s');

    function memInfo() {
        let elapsedMs = Date.now() - startStamp;
        const elapsedDays = Math.floor(elapsedMs / Utils.times.msDay);
        const memory = process.memoryUsage();

        if (elapsedDays) {
            elapsedMs -= elapsedDays * Utils.times.msDay;
        }

        logger.info(
            `+${elapsedDays}.${Utils.hh_mm_ss(elapsedMs, true)} `,
            `rss: ${Utils.format.fileSize(memory.rss)}`,
            `heapUsed: ${Utils.format.fileSize(memory.heapUsed)}, heapTotal: ${Utils.format.fileSize(memory.heapTotal)}`
        );

        scheduleMemInfo();
    }

    return function (delta = 0) {
        setTimeout(memInfo, INTERVAL + delta);
    };
}());

(async function configure() {
    const db = await openConnection();

    require('./models/Download').makeModel(db);
    Download = db.model('Download');

    http.createServer(handleRequest).listen(listenport, listenhost, function () {
        logger.info(`Uploader host for users: [${host}]`);
        logger.info(`Uploader server listening [${listenhost ? listenhost : '*'}:${listenport}]\n`);

        scheduleMemInfo(startStamp - Date.now());
    });
}());