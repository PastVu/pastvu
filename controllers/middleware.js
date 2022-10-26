/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import fs, { promises as fsAsync } from 'fs';
import path from 'path';

// Middleware for checking requested html, usually for development.
// If such pug exists - compile it, if not - pass request to the next handler
export function pugToHtml(seekPath) {
    const htmlRegExp = /\.html$/;

    return (req, res, next) => {
        if (req.method.toUpperCase() !== 'GET' && req.method.toUpperCase() !== 'HEAD') {
            return next();
        }

        const pathname = req.path; // Getter for url.parse(req.url).pathname,

        // Only handle the matching files
        if (htmlRegExp.test(pathname)) {
            const pugPath = path.normalize(seekPath + pathname.replace('.html', '.pug'));

            res.render(pugPath, {}, (err, renderedHTML) => {
                if (err || !renderedHTML) {
                    next();
                } else {
                    console.log(`${req.url} compiled from pug`);
                    res.status(200).send(renderedHTML);
                }
            });
        } else {
            return next();
        }
    };
}

// Middleware for cors switching-on for a particular domain with wildcard
export function cors(originRoot) {
    const originRegExp = new RegExp(originRoot + '$', '');

    return (req, res, next) => {
        const origin = req.headers.origin || req.headers.Origin;

        if (origin && originRegExp.test(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }

        next();
    };
}

// Add X-Response-Time header
export function responseHeaderHook() {
    return (req, res, next) => {
        const start = Date.now();
        const writeHeadOriginal = res.writeHead;

        if (!next) {
            next = _.noop;
        }

        res.writeHead = function (...args) {
            res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
            writeHeadOriginal.apply(res, args);
        };
        next();
    };
}

// Serve static images with check for webp support
export function serveImages(storePath, { maxAge = 0 }) {
    const cacheControl = `public, max-age=${Math.ceil(maxAge / 1000)}`;

    return async function (req, res, next) {
        const {
            headers: {
                accept = '',
            } = {},
        } = req;

        let acceptWebp = accept.includes('image/webp');
        let filePath = path.join(storePath, req.path);
        let stat;

        try {
            stat = await fsAsync.stat(filePath + (acceptWebp ? '.webp' : ''));

            if (!stat.size) {
                stat = null;
            } else if (acceptWebp) {
                filePath += '.webp';
            }
        } catch (err) {
            if (acceptWebp) {
                // Wanted webp, but it does not exist
                acceptWebp = false;
            } else {
                return next();
            }
        }

        if (!stat) {
            try {
                stat = await fsAsync.stat(filePath);
            } catch (err) {
                return next();
            }
        }

        res.setHeader('Cache-Control', cacheControl);
        res.setHeader('Content-Type', acceptWebp ? 'image/webp' : 'image/jpeg');

        if (stat.size) {
            res.setHeader('Content-Length', stat.size);
        }

        const file = new fs.ReadStream(filePath);

        file.pipe(res);

        file.on('error', err => next(err));

        // Handle unexpected client disconnection to close file read stream and release memory
        res.on('close', () => file.destroy());
    };
}
