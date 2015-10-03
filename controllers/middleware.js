'use strict';

import fs from 'fs';
import path from 'path';
import Utils from '../commons/Utils';

// Middleware для проверки запрашиваемого html, есть ли такой jade,
// если да - компиляция, нет - передаем следующему обработчику
export function jadeToHtml(seekPath) {
    const htmlRegExp = /\.html$/;

    return function (req, res, next) {
        if (req.method.toUpperCase() !== 'GET' && req.method.toUpperCase() !== 'HEAD') {
            return next();
        }

        const pathname = req.path; // Getter for url.parse(req.url).pathname,

        // Only handle the matching files
        if (htmlRegExp.test(pathname)) {
            const jadePath = path.normalize(seekPath + (pathname.replace('.html', '.jade')));

            res.render(jadePath, {}, function (err, renderedHTML) {
                if (err || !renderedHTML) {
                    next();
                } else {
                    console.log('%s compiled from jade', req.url);
                    res.status(200).send(renderedHTML);
                }
            });
        } else {
            return next();
        }
    };
};

// Middleware для включения cors для переданного домена и всех поддоменов
export function cors(originRoot) {
    const originRegExp = new RegExp(originRoot + '$', '');

    return function (req, res, next) {
        const origin = req.headers.origin || req.headers.Origin;

        if (origin && originRegExp.test(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }
        next();
    };
};

// Add X-Response-Time header
export function responseHeaderHook() {
    return function (req, res, next) {
        const start = Date.now();
        const writeHeadOriginal = res.writeHead;

        if (!next) {
            next = Utils.dummyFn;
        }
        res.writeHead = function () {
            res.setHeader('X-Response-Time', (Date.now() - start) + 'ms');
            writeHeadOriginal.apply(res, arguments);
        };
        next();
    };
};

// Serve static images with check for webp support
export function serveImages(storePath, { maxAge = 0 }) {
    maxAge = maxAge / 1000;

    return async function(req, res, next) {
        const {
            headers: {
                accept = ''
            } = {}
        } = req;

        let acceptWebp = accept.includes('image/webp');
        let filePath = path.join(storePath, req.path);
        let stat;

        try {
            stat = await fs.statAsync(filePath + (acceptWebp ? '.webp' : ''));
            if (acceptWebp) {
                filePath += '.webp';
            }
        } catch (err) {
            if (acceptWebp) {
                acceptWebp = false;
                // console.warn('Wanted webp, but it does not exists', filePath);
            } else {
                next();
            }
        }

        if (!stat) {
            try {
                stat = await fs.statAsync(filePath);
            } catch (err) {
                next();
            }
        }

        res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
        res.setHeader('Content-Type', acceptWebp ? 'image/webp' : 'image/jpeg');

        if (stat.size) {
            res.setHeader('Content-Length', stat.size);
        }

        const file = new fs.ReadStream(filePath);

        file.pipe(res);

        file.on('error', (err) => next(err));

        // Handle unexpected client disconnection to close file read stream and release memory
        res.on('close', function () {
            file.destroy();
        });
    };
};