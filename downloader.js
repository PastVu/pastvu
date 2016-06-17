import './commons/JExtensions';
import fs from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import http from 'http';
import mime from 'mime';
import lru from 'lru-cache';
import log4js from 'log4js';
import config from './config';
import Utils from './commons/Utils';
import { parse as parseCookie } from 'cookie';
import contentDisposition from 'content-disposition';
import { ApplicationError, AuthorizationError, NotFoundError } from './app/errors';

import connectDb, { dbRedis } from './controllers/connection';
import { Download } from './models/Download';

export async function configure(startStamp) {
    const {
        storePath,
        listen: {
            hostname,
            dport: listenport
        }
    } = config;

    const status404Text = http.STATUS_CODES[404];
    const logger = log4js.getLogger('downloader');

    await connectDb({
        redis: config.redis,
        mongo: { uri: config.mongo.connection, poolSize: config.mongo.pool },
        logger
    });

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

        file.on('error', function (err) {
            if (onError) {
                return onError(err);
            }
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

                const size = keyData.size || (await fs.statAsync(filePath)).size;
                const fileName = contentDisposition(keyData.fileName);

                res.setHeader('Content-Disposition', fileName);
                res.setHeader('Content-Type', keyData.mime || mime.lookup(filePath));

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
     * Serve protected files.
     * If user doesn't have rights or protected file doesn't exist - redirect to public version instead
     */
    const protectedServePattern = /^\/_pr\/([\/a-z0-9]{26,40}\.(?:jpe?g|png)).*$/i;
    const protectedServeHandler = (function () {
        // Session key in client cookies
        const SESSION_COOKIE_KEY = 'past.sid';
        // Local cache to not pull redis more then once if request for the same file is arrived within TTL
        const localCache = lru({ max: 2000, maxAge: config.protectedFileLinkTTL * 1000 });
        // Cache time
        const { photoCacheTime } = config;
        const cacheControl = `private, max-age=${photoCacheTime / 1000}`;

        async function servePublic(req, res, filePath) {
            const filePathFull = path.join(storePath, 'public/photos', filePath);
            const fileAvailable = await exists(filePathFull);

            if (!fileAvailable) {
                res.statusCode = 404;
                return res.end(status404Text);
            }

            res.setHeader('Content-Type', mime.lookup(filePathFull));
            const size = (await fs.statAsync(filePathFull)).size;

            if (size) {
                res.setHeader('Content-Length', size);
            }

            sendFile(filePathFull, res);
        }

        async function serveProtected(req, res, filePath) {
            const { headers } = req;
            const file = filePath.substr(2);
            const filePathFull = path.join(storePath, 'protected/photos', filePath);

            if (!headers || !headers['user-agent'] || !headers.cookie) {
                throw new AuthorizationError(); // If session doesn't contain header or user-agent - deny
            }

            const cookieObj = parseCookie(headers.cookie); // Parse cookie
            const sid = cookieObj[SESSION_COOKIE_KEY]; // Get session key from cookie

            if (!sid) {
                throw new AuthorizationError(); // If session doesn't contain header or user-agent - deny
            }

            const key = `pr:${sid}:${file}`;
            let mimeValue = localCache.peek(key);

            if (mimeValue === undefined) {
                const [value, ttl] = await dbRedis.multi([['get', key], ['ttl', key]]).execAsync() || [];

                if (!value) {
                    throw new AuthorizationError();
                }

                [, mimeValue] = value.split(':');

                if (!mimeValue) {
                    mimeValue = mime.lookup(filePathFull);
                }

                // Set result to local lru-cache over remaining ttl, that was returned from redis
                localCache.set(key, mimeValue, (ttl || 1) * 1000);
            }

            const fileAvailable = await exists(filePathFull);

            if (!fileAvailable) {
                throw new NotFoundError();
            }

            res.setHeader('Content-Type', mimeValue || mime.lookup(filePathFull));

            const { size, mtime } = await fs.statAsync(filePathFull);

            if (size) {
                res.setHeader('Content-Length', size);
            }
            if (mtime) {
                res.setHeader('Last-Modified', new Date(mtime).toUTCString());
            }

            if (photoCacheTime) {
                const now = new Date();
                res.setHeader('Cache-Control', cacheControl);
                res.setHeader('Date', now.toUTCString());
                res.setHeader('Expires', new Date(now.getTime() + photoCacheTime).toUTCString());
            }


            sendFile(filePathFull, res, () => servePublic(req, res, filePath));
        }

        return function handleProtectedRequest(req, res) {
            const [, filePath] = req.url.match(protectedServePattern) || [];

            if (!filePath) {
                res.statusCode = 400;
                return res.end(http.STATUS_CODES[400]);
            }

            serveProtected(req, res, filePath)
                .catch(error => {
                    if (error instanceof ApplicationError) {
                        logger.warn(`Serving protected file ${filePath} failed, ${error.message}`);
                    } else {
                        logger.error(`Serving protected file ${filePath} failed`, error);
                    }

                    res.statusCode = 303;
                    res.setHeader('Location', `/_p/${filePath}`);
                    res.end();
                });
        };
    }());

    // Start server and do manual manual url router, express is not needed
    http
        .createServer(function handleRequest(req, res) {
            if (protectedServePattern.test(req.url)) {
                return protectedServeHandler(req, res);
            }
            if (originDownloadPattern.test(req.url)) {
                return originDownloadHandler(req, res);
            }

            res.statusCode = 404;
            res.end(status404Text);
        })
        .listen(listenport, hostname, function () {
            logger.info(`Downloader host for users: [${config.client.hostname + config.client.dport}]`);
            logger.info(
                `Downloader server started up in ${(Date.now() - startStamp) / 1000}s`,
                `and listening [${hostname || '*'}:${listenport}]\n`
            );

            scheduleMemInfo(startStamp - Date.now());
        });
};