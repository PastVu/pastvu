import './commons/JExtensions';
import fs from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import http from 'http';
import log4js from 'log4js';
import config from './config';
import Utils from './commons/Utils';
import contentDisposition from 'content-disposition';

import connectDb from './controllers/connection';
import { Download } from './models/Download';

export async function configure(startStamp) {
    const {
        storePath,
        listen: {
            hostname,
            dport: listenport
        }
    } = config;

    const logger = log4js.getLogger('downloader');

    await connectDb(config.mongo.connection, config.mongo.poolDownloader, logger);

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
                `heapUsed: ${Utils.format.fileSize(memory.heapUsed)},`,
                `heapTotal: ${Utils.format.fileSize(memory.heapTotal)}`
            );

            scheduleMemInfo();
        }

        return function (delta = 0) {
            setTimeout(memInfo, INTERVAL + delta);
        };
    }());

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

            const keyEntry = await Download.findOneAndRemove({ key }, { _id: 0, data: 1 }).exec();
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
            res.setHeader('Content-Type', keyData.mime || 'text/html');

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

    http.createServer(handleRequest).listen(listenport, hostname, function () {
        logger.info(`Downloader host for users: [${config.client.hostname + config.client.dport}]`);
        logger.info(
            `Downloader server started up in ${(Date.now() - startStamp) / 1000}s`,
            `and listening [${hostname || '*'}:${listenport}]\n`
        );

        scheduleMemInfo(startStamp - Date.now());
    });
};