/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import fs, { promises as fsAsync } from 'fs';
import gm from 'gm';
import mv from 'mv';
import _ from 'lodash';
import path from 'path';
import http from 'http';
import makeDir from 'make-dir';
import log4js from 'log4js';
import config from './config';
import formidable from 'formidable';
import Utils from './commons/Utils';
import exitHook from 'async-exit-hook';

export function configure(startStamp) {
    const {
        storePath,
        uploader: {
            port: listenport,
        },
    } = config;

    const logger = log4js.getLogger('uploader');
    const incomeDir = path.join(storePath, 'incoming');
    const targetDirPhoto = path.join(storePath, 'private/photos');
    const targetDirAvatar = path.join(storePath, 'private/avatars');
    const minPhotoSize = 10240; // 10kB
    const maxPhotoSize = 52428800; // 50Mb
    const maxPhotoPostSize = 53477376; // 51Mb,
    const minAvaSize = 1024; // 1kB
    const maxAvaSize = 7340032; // 7Mb
    const maxAvaPostSize = 8388608; // 8Mb,
    const acceptFileTypes = /\.(jpe?g|png)$/i;
    const accessControl = {
        allowOrigin: '*',
        allowMethods: 'OPTIONS, POST',
        allowHeaders: 'Content-Type, Content-Range, Content-Disposition',
    };

    class FileInfo {
        constructor(file, targetDir, nameLen, dirDepth) {
            this.name = file.originalFilename;
            this.size = file.size;
            this.mime = file.mimetype;
            this.path = file.filepath;

            this.createFileName(targetDir, nameLen, dirDepth);
        }

        createFileName(targetDir, nameLen, dirDepth) {
            this.file = this.fileNameGen(nameLen);
            this.fileDir = this.fileNameDir(targetDir, dirDepth);

            // Cyclically check the existence of a file with the same name, until we find a unique
            while (fs.existsSync(targetDir + this.fileDir + this.file)) {
                this.file = this.fileNameGen(nameLen);
                this.fileDir = this.fileNameDir(targetDir, dirDepth);
            }
        }

        fileNameGen(len) {
            return Utils.randomString(len || 10, true) + this.name.substr(this.name.lastIndexOf('.')).toLowerCase();
        }

        fileNameDir(dir, depth) {
            const result = this.file.substr(0, depth || 1).replace(/(.)/gi, '$1/');

            makeDir.sync(path.join(dir, result)); // Directory creation

            return result;
        }
    }

    const setAccessControlHeaders = res => {
        res.setHeader('Access-Control-Allow-Origin', accessControl.allowOrigin);
        res.setHeader('Access-Control-Allow-Methods', accessControl.allowMethods);
        res.setHeader('Access-Control-Allow-Headers', accessControl.allowHeaders);
    };
    const setNoCacheHeaders = res => {
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Content-Disposition', 'inline; filename="files.json"');
    };

    function tooBigPostDestroy(req, isAvatar, bytesReceived, bytesExpected) {
        logger.warn(`Too big ${isAvatar ? 'avatar' : 'photo'}, dropping, ${bytesReceived} ${bytesExpected}`);
        req.connection.destroy();
    }

    async function validatePhoto(fileInfo) {
        if (!acceptFileTypes.test(fileInfo.name)) {
            fileInfo.error = 'ftype';

            return;
        }

        if (minPhotoSize && minPhotoSize > fileInfo.size) {
            fileInfo.error = 'fmin';

            return;
        }

        if (maxPhotoSize && maxPhotoSize < fileInfo.size) {
            fileInfo.error = 'fmax';

            return;
        }

        return new Promise(resolve => {
            gm(fileInfo.path).size((err, size) => {
                if (err || !size) {
                    logger.error('GM size error:', err);
                    fileInfo.error = 'fpx';

                    return resolve();
                }

                const w = Number(size.width);
                const h = Number(size.height);

                if (!w || !h || w < 350 || h < 350 || w < 700 && h < 700) {
                    fileInfo.error = 'fpx';
                }

                resolve();
            });
        });
    }

    async function validateAvatar(fileInfo) {
        if (!acceptFileTypes.test(fileInfo.name)) {
            fileInfo.error = 'ftype';

            return;
        }

        if (minAvaSize && minAvaSize > fileInfo.size) {
            fileInfo.error = 'fmin';

            return;
        }

        if (maxAvaSize && maxAvaSize < fileInfo.size) {
            fileInfo.error = 'fmax';

            return;
        }

        return new Promise(resolve => {
            gm(fileInfo.path).size((err, size) => {
                if (err || !size) {
                    logger.error('GM avatar size error:', err);
                    fileInfo.error = 'fpx';

                    return resolve();
                }

                const w = Number(size.width);
                const h = Number(size.height);
                const min = Math.min(w, h);

                if (!w || !h || w < 100 || h < 100) {
                    fileInfo.error = 'fpx';

                    return resolve();
                }

                if (w > 100 || h > 100) {
                    // Cut from center by smaller size and resize to 100px
                    gm(fileInfo.path)
                        .gravity('Center')
                        .quality(90)
                        .filter('Sinc')
                        .noProfile() // Drop EXIF
                        .crop(min, min)
                        .resize(100, 100)
                        .write(fileInfo.path, err => {
                            if (err) {
                                logger.warn('GM avatar resize error', err);
                                fileInfo.error = 'fpx';
                            }

                            resolve();
                        });
                } else {
                    resolve();
                }
            });
        });
    }

    const postHandler = (req, res) => {
        const form = formidable({ uploadDir: incomeDir });
        const isAvatar = req.url === '/uploadava';
        const maxPostSize = isAvatar ? maxAvaPostSize : maxPhotoPostSize;
        const targetDir = isAvatar ? targetDirAvatar : targetDirPhoto;
        const validateFunc = isAvatar ? validateAvatar : validatePhoto;
        const contentLength = Number(_.get(req, "headers['content-length']"));

        const tmpFiles = [];
        const files = [];
        const map = {};
        let counter = 1;

        // Modern browsers send ашду size in header, so we right away able to reject ша exceeding of the maximum size
        if (contentLength && contentLength > maxPostSize) {
            tooBigPostDestroy(req, isAvatar, 0, contentLength);
        }

        form
            .on('fileBegin', (name, file) => {
                tmpFiles.push(file.filepath);

                const fileInfo = new FileInfo(file, targetDir, isAvatar ? 10 : 18, isAvatar ? 2 : 3);

                map[path.basename(file.filepath)] = fileInfo;
                files.push(fileInfo);
            })
            .on('file', (name, file) => {
                const fileInfo = map[path.basename(file.filepath)];

                fileInfo.size = file.size;
                fileInfo.path = path.join(incomeDir, fileInfo.file);
                mv(file.filepath, fileInfo.path, { clobber: false }, err => {
                    if (err) {
                        logger.error('MV error:', err);
                    }
                });
            })
            .on('aborted', () => {
                tmpFiles.forEach(file => {
                    fs.unlinkSync(file);
                });
            })
            .on('error', e => {
                logger.warn(e && e.message || e);
            })
            .on('progress', (bytesReceived, bytesExpected) => {
                if (bytesReceived > maxPostSize) {
                    tooBigPostDestroy(req, isAvatar, bytesReceived, bytesExpected);
                }
            })
            .on('end', async () => {
                counter -= 1;

                if (counter) {
                    return;
                }

                for (const fileInfo of files) {
                    await validateFunc(fileInfo);

                    if (fileInfo.error) {
                        await fsAsync.unlink(fileInfo.path);
                    }
                }

                res.writeHead(200, {
                    'Content-Type': req.headers.accept.indexOf('application/json') !== -1 ? 'application/json' : 'text/plain',
                });
                res.end(JSON.stringify({ files }));
            })
            .parse(req);
    };

    const handleRequest = (req, res) => {
        if (req.url === '/healthz') {
            res.setHeader('Cache-Control', 'no-store');
            res.statusCode = 200;
            res.end('OK');

            return;
        }

        if (req.url !== '/upload' && req.url !== '/uploadava') {
            res.statusCode = 403;
            res.end();

            return;
        }

        setAccessControlHeaders(res);

        switch (req.method) {
            case 'OPTIONS':
                res.end();
                break;
            case 'POST':
                setNoCacheHeaders(res);
                postHandler(req, res);
                break;
            default:
                logger.warn(405, req.method, req.url);
                res.statusCode = 405;
                res.end();
        }
    };

    const server = http.createServer(handleRequest).listen(listenport, '0.0.0.0', () => {
        logger.info(
            `Uploader server started up in ${(Date.now() - startStamp) / 1000}s`,
            `and listening [*:${listenport}]\n`
        );
    });

    exitHook(cb => {
        logger.info('Uploader server is shutting down');
        server.close(cb);
    });
}
