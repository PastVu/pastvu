import fs, { promises as fsAsync } from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import http from 'http';
import mimeMap from 'mime';
import LRU from 'lru-cache';
import log4js from 'log4js';
import config from './config';
import Utils from './commons/Utils';
import { parse as parseCookie } from 'cookie';
import contentDisposition from 'content-disposition';
import CorePlug from './controllers/serviceConnectorPlug';
import { ApplicationError, AuthorizationError, BadParamsError, NotFoundError } from './app/errors';

import connectDb, { dbRedis } from './controllers/connection';
import { Download } from './models/Download';

export async function configure(startStamp) {
    const {
        storePath,
        downloader: {
            port: listenport,
        },
    } = config;

    const status404Text = http.STATUS_CODES[404];
    const logger = log4js.getLogger('downloader');
    const core = new CorePlug(logger, { port: config.core.port, host: config.core.hostname });

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

    const sendFile = function (filePath, response, onError) {
        const file = new fs.ReadStream(filePath);

        file.pipe(response);

        file.on('error', err => {
            if (onError) {
                return onError(err);
            }

            response.statusCode = 500;
            response.end('Server Error');
            logger.error(err);
        });

        // Handle unexpected client disconnection to close file read stream and release memory
        response.on('close', () => {
            file.destroy();
        });
    };

    // Manual promise for exists because fs.exists is deprecated,
    // because fs.exists doesn't call back with error as first argument
    const exists = function (path) {
        return new Promise(resolve => {
            resolve(fs.existsSync(path));
        });
    };

    /**
     * Serve origin photo file for download
     */
    const originDownloadPattern = /^\/download\/(\w{32})$/;
    const originDownloadHandler = (function () {
        function responseCode(code, response) {
            const textStatus = http.STATUS_CODES[code];

            // File must be downloaded, even if error occured, because ahref on page not '_blank'
            // So we keep 200 status for response and make file with actual status within it name and text inside
            response.setHeader('Content-Disposition', contentDisposition(`${code} ${textStatus}.html`));
            response.setHeader('Content-Type', 'text/html');

            response.end(textStatus);
        }

        return async function handleOriginDownloadRequest(req, res) {
            res.statusCode = 200;
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Expires', '0');

            if (req.method !== 'GET') {
                return responseCode(405, res);
            }

            try {
                const [, key] = req.url.match(originDownloadPattern) || [];

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

                const size = keyData.size || (await fsAsync.stat(filePath)).size;
                const fileName = contentDisposition(keyData.fileName);

                res.setHeader('Content-Disposition', fileName);
                res.setHeader('Content-Type', keyData.mime || mimeMap.getType(filePath));

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
    }());

    /**
     * Check if protected files can be served by upper level (nginx/proxy)
     */
    const counters = { all: 0, ok: 0, fail: 0 };
    const protectedServePattern = /^\/_pr?\/([/a-z0-9]{26,40}\.(?:jpe?g|png)).*$/i;
    const protectedHandler = (function () {
        // Session key in client cookies
        const SESSION_COOKIE_KEY = 'past.sid';
        // Local cache to not pull redis more then once if request/core for the same file is arrived within TTL
        const L0Cache = new LRU({ max: 2000, maxAge: config.protectedFileLinkTTL });
        const hostnameRegexp = new RegExp(`^https?:\\/\\/(www\\.)?${config.client.hostname}`, 'i');

        (function countPrint() {
            if (counters.all) {
                logger.info(`Protection serve stat: ${counters.ok} ok, ${counters.fail} fail, ${counters.all} total`);
            }

            setTimeout(countPrint, ms('5m'));
        }());

        // Set result from L1-L2 to L0 cache
        async function setL0(key, mime, file, ttl = config.protectedFileLinkTTL) {
            if (!mime) {
                mime = mimeMap.getType(file);
            }

            // Set result to L0 lru-cache over remaining ttl, that was returned from redis
            L0Cache.set(key, mime, ttl);

            return mime;
        }

        // Try to get protected file permission from local lru cache
        async function getL0(sid, file) {
            const key = `pr:${sid}:${file}`;

            return L0Cache.peek(key) || getL1(key, sid, file);
        }

        // Try to get protected file permission from redis fast cache
        async function getL1(key, sid, file) {
            const [value, ttl] = await dbRedis.multi([['get', key], ['ttl', key]]).execAsync() || [];

            if (!value) {
                return getL2(key, sid, file);
            }

            const [, mime] = value.split(':');

            return setL0(key, mime, file, (ttl || 1) * 1000);
        }

        // Try to get protected file permission from core service
        async function getL2(key, sid, file) {
            // First, check that photo is exists and unpubliched. Redis has map of unpublished photos (path - cid)
            const cid = Number(await dbRedis.getAsync(`notpublic:${file}`));

            if (!cid || !core.connected) {
                throw new NotFoundError({ sid });
            }

            // If coresponding cid has been found, select session and photo from persistent storage (mongo)
            const { result, mime } = await core.request({ sid, method: 'photo.giveCanProtected', params: { cid } });

            if (!result) {
                throw new NotFoundError({ sid });
            }

            return setL0(key, mime, file);
        }

        return async function handleProtectedRequest(req, res) {
            counters.all++;

            const { headers = {}, url = '' } = req;
            const [, filePath] = url.match(protectedServePattern) || [];

            try {
                if (!filePath) {
                    throw new BadParamsError();
                }

                if (!headers || !headers['user-agent'] || !headers.cookie) {
                    throw new AuthorizationError(); // If session doesn't contain header or user-agent - deny
                }

                const cookieObj = parseCookie(headers.cookie); // Parse cookie
                const sid = cookieObj[SESSION_COOKIE_KEY]; // Get session key from cookie

                if (!sid) {
                    throw new AuthorizationError(); // If session doesn't contain header or user-agent - deny
                }

                const file = filePath.substr(2);
                const mime = await getL0(sid, file);

                if (!mime) {
                    throw new NotFoundError({ sid });
                }

                res.statusCode = 303;
                res.setHeader('Location', `/${filePath}`);
                counters.ok++;
            } catch (error) {
                counters.fail++;

                let { referer = '' } = req.headers;
                let { details: { sid = '' } = {} } = error;

                if (referer) {
                    referer = ` to ${referer.replace(hostnameRegexp, '') || '/'}`;
                }

                if (sid) {
                    sid = ` for ${sid}`;
                }

                if (error instanceof ApplicationError) {
                    res.statusCode = error.statusCode;
                    res.write(error.statusText || '');
                    logger.warn(`Serving protected file ${filePath}${referer}${sid} failed, ${error.message}`);
                } else {
                    res.statusCode = 500;
                    res.write(http.STATUS_CODES[500]);
                    logger.error(`Serving protected file ${filePath}${referer}${sid} failed`, error);
                }
            } finally {
                res.end();
            }
        };
    }());

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, poolSize: config.mongo.pool },
        logger,
    });

    // Connect to core, without waiting
    core.connect();

    // Start server and do manual manual url router, express is not needed
    http
        .createServer(function handleRequest(req, res) {
            if (protectedServePattern.test(req.url)) {
                return protectedHandler(req, res);
            }

            if (originDownloadPattern.test(req.url)) {
                return originDownloadHandler(req, res);
            }

            res.statusCode = 404;
            res.end(status404Text);
        })
        .listen(listenport, '0.0.0.0', () => {
            logger.info(
                `Downloader server started up in ${(Date.now() - startStamp) / 1000}s`,
                `and listening [*:${listenport}]\n`
            );

            scheduleMemInfo(startStamp - Date.now());
        });
}
