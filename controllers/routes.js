import _ from 'lodash';
import http from 'http';
import log4js from 'log4js';
import config from '../config';
import Utils from '../commons/Utils';
import * as session from './_session';
import { clientParams, ready as settingsReady } from './settings';
import NotFoundError from '../app/errors/NotFound';
import { getRegionsArrPublicFromCache } from './region';
import { handleHTTPRequest, handleHTTPAPIRequest } from '../app/request';
import { parseFilter } from './photo';
import constants from './constants';

const {
    photo: { status },
} = constants;

const loggerError = log4js.getLogger('error.js');

const origin = config.client.origin;

let clientParamsJSON = JSON.stringify(clientParams);

settingsReady.then(() => clientParamsJSON = JSON.stringify(clientParams));

function genInitDataString(req) {
    const usObj = req.handshake.usObj;
    let resultString = `var init={settings:${clientParamsJSON},` +
        `user:${JSON.stringify(session.getPlainUser(usObj.user))}`;

    if (usObj.registered) {
        resultString += ',registered:true';
    }

    if (req.photoData) {
        resultString += ',photo:' + JSON.stringify(req.photoData);
    }

    resultString += '};';

    return resultString;
}

// Check for disabled js in client's browser. In this case client send query parameter '_nojs=1'
function checkNoJS(req) {
    const nojsShow = req.query._nojs === '1';
    let nojsUrl;

    // If client came without '_nojs' param, insert it into 'noscript' for possible redirect
    if (!nojsShow) {
        const { pathname, query } = req._parsedUrl;

        nojsUrl = `${pathname}?${query ? query + '&' : ''}_nojs=1`;
    }

    return { nojsUrl, nojsShow };
}

// For paths, which don't need session, parse browser directly
function getReqBrowser(req, res, next) {
    const ua = req.headers['user-agent'];

    if (ua) {
        req.browser = session.checkUserAgent(ua);
    }

    next();
}

// Fill some headers for fully generated pages
const setStaticHeaders = (function () {
    const cacheControl = 'no-cache';
    const xFramePolicy = 'SAMEORIGIN';
    const xPoweredBy = 'Paul Klimashkin | klimashkin@gmail.com';
    const xUA = 'IE=edge';

    return (req, res, next) => {
        // Directive to indicate the browser response caching rules
        // no-cahce - browsers and proxies can cache, with mandatory request for check actuality
        // In case of etag existens in first response,
        // in next request client will send that etag in 'If-None-Match' header for actuality check
        res.setHeader('Cache-Control', cacheControl);

        // The page can only be displayed in a frame on the same origin as the page itself
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/X-Frame-Options
        res.setHeader('X-Frame-Options', xFramePolicy);

        if (req.browser && req.browser.agent.family === 'IE') {
            // X-UA-Compatible header has greater precedence than Compatibility View
            // http://msdn.microsoft.com/en-us/library/ff955275(v=vs.85).aspx
            res.setHeader('X-UA-Compatible', xUA);
        }

        res.setHeader('X-Powered-By', xPoweredBy);

        if (typeof next === 'function') {
            next();
        }
    };
}());

function meta(req) {
    let title;
    let desc;
    const og = {};
    const rels = [];
    const twitter = {};
    const {
        pageTitle,
        photoRel = {},
        photoData: { photo } = {},
    } = req;

    if (photoRel.prev) {
        rels.push({ rel: 'prev', href: `${origin}/p/${photoRel.prev}` });
    }

    if (photoRel.next) {
        rels.push({ rel: 'next', href: `${origin}/p/${photoRel.next}` });
    }

    if (pageTitle) {
        title = og.title = twitter.title = pageTitle;
    }

    if (photo) {
        og.url = `${origin}/p/${photo.cid}`;

        if (photo.desc) {
            desc = og.desc = twitter.desc = Utils.txtHtmlToPlain(photo.desc, true);
        } else if (!_.isEmpty(photo.regions)) {
            // If there in no description, create it as regions names
            desc = og.desc = twitter.desc = photo.regions.reduceRight(

                (result, region, index) => result + region.title_en + (index ? ', ' : ''), ''
            );
        } else {
            desc = '';
        }

        title = og.title = twitter.title = photo.title || '';

        // Include years in OpenGraph title, if they are not in title already
        if (!title.includes(photo.year) && (!photo.year2 || !title.includes(photo.year2)) &&
            !desc.includes(photo.year) && (!photo.year2 || !desc.includes(photo.year2))) {
            og.title = twitter.title = photo.y + ' ' + title;
        }

        if (photo.s === status.PUBLIC) {
            og.img = {
                url: `${origin}/_p/a/${photo.file}`,
                w: photo.w,
                h: photo.h,
            };
            twitter.img = {
                url: `${origin}/_p/d/${photo.file}`, // Twitter image must be less than 1MB in size, so use standard
            };
        }
    }

    if (!og.url) {
        og.url = origin + req.url; // req.path if decide without params
    }

    if (!title) {
        title = og.title = twitter.title = 'Retro photos of mankind\'s habitat.';
    }

    if (!desc) {
        desc = og.desc = twitter.desc = 'Archive of historical photos, generated by users';
    }

    if (twitter.desc.length > 200) {
        twitter.desc = `${twitter.desc.substr(0, 197)}...`;
    }

    if (!og.img) {
        og.img = twitter.img = {
            url: `${origin}/img/loading/Loading1.jpg`,
            w: 758,
            h: 304,
        };
    }

    return { title, desc, og, twitter, rels };
}

function appMainHandler(req, res) {
    const { nojsUrl, nojsShow } = checkNoJS(req);
    const { browser = {}, photoData: { photo, can } = {} } = req;

    if (photo && photo.s !== status.PUBLIC && !can.protected) {
        res.statusCode = 403; // This is more for search engines
    } else {
        res.statusCode = 200;
    }

    res.render('app', {
        nojsUrl,
        nojsShow,
        appName: 'Main',
        meta: meta(req),
        agent: browser.agent,
        polyfills: browser.polyfills,
        initData: genInitDataString(req),
    });
}

function appAdminHandler(req, res) {
    const { nojsUrl, nojsShow } = checkNoJS(req);
    const { browser = {} } = req;

    res.statusCode = 200;
    res.render('app', {
        nojsUrl,
        nojsShow,
        meta: {},
        appName: 'Admin',
        agent: browser.agent,
        polyfills: browser.polyfills,
        initData: genInitDataString(req),
    });
}

async function getPhotoForPage(req, res, next) {
    try {
        const cid = Number(req.params[0]);
        const { handshake: { context } } = req;

        req.photoData = await context.call('photo.giveForPage', { cid });
        req.photoRel = await context.call('photo.givePrevNextCids', { cid });

        next();
    } catch (error) {
        next(error);
    }
}

function getRegionForGallery(req, res, next) {
    const filter = req.query.f;

    if (filter) {
        try {
            const regions = getRegionsArrPublicFromCache(parseFilter(filter).r);

            if (!_.isEmpty(regions)) {
                let hasRussianRegions = false;
                let title = regions.map(({ title_en: en, title_local: local, parents }) => {
                    if (parents[0] === 1) {
                        hasRussianRegions = true;

                        return local;
                    }

                    return en;
                }).join(', ');

                title = (hasRussianRegions ? 'Старые фотографии ' : 'Retro photos of ') + title;

                req.pageTitle = title;
            }
        } catch (err) {
            return next(err);
        }
    }

    next();
}

export function bindRoutes(app) {
    [
        '/', // Root
        /^\/(?:photoUpload|ps\/feed|ps\/coin|about)\/?$/, // Strict paths (/example with or without trailing slash)
        /^\/(?:u|news)(?:\/.*)?$/, // Path with possible continuation (/example/*)
        /^\/(?:confirm)\/.+$/, // Path with mandatory continuation (/example/*)
    ]
        .forEach(route => {
            app.get(route, handleHTTPRequest, setStaticHeaders, appMainHandler);
        });

    // Photo page
    app.get(/^\/p\/(\d{1,7})$/, handleHTTPRequest, setStaticHeaders, getPhotoForPage, appMainHandler);
    // Gallery page
    app.get(/^\/ps(?:\/(\d{1,6}))?\/?$/, handleHTTPRequest, setStaticHeaders, getRegionForGallery, appMainHandler);

    if (config.serveHTTPApi) {
        app.use('/api2', require('body-parser').json({ limit: '4mb' }), handleHTTPRequest, handleHTTPAPIRequest);
    }

    // Rules
    app.get('/rules', (req, res) => {
        // This used to be a modal popup, we have to keep redirect to documentation page.
        const template = _.template(config.docs.rulesUrl);

        res.redirect(301, template({ lang: config.lang }));
    });

    // Admin section
    app.get(/^\/(?:admin)(?:\/.*)?$/, handleHTTPRequest, setStaticHeaders, appAdminHandler);

    // Obsolete browser
    app.get('/badbrowser', getReqBrowser, setStaticHeaders, (req, res) => {
        res.statusCode = 200;
        res.render('status/badbrowser', {
            agent: req.browser && req.browser.agent,
            title: 'You are using outdated browser',
        });
    });

    // My user-agent
    app.get('/myua', getReqBrowser, (req, res) => {
        const { browser: { accept, agent, agent: { source: title } = {} } = {} } = req;

        res.statusCode = 200;
        res.setHeader('Cache-Control', 'no-cache,no-store,max-age=0,must-revalidate');
        res.render('status/myua', { agent, accept, title });
    });

    // Ping-pong to verify the server is working
    app.all('/ping', (req, res) => {
        res.status(200).send('pong');
    });

    // Last handler. If request reaches it, means that there is no handler for this request
    app.all('*', (req, res, next) => {
        const { url, method, headers: { 'user-agent': ua, referer } = {} } = req;

        next(new NotFoundError({ url, method, ua, referer }));
    });
}

export const send404 = (function () {
    const status404 = http.STATUS_CODES[404];
    const json404 = JSON.stringify({ error: status404 });
    let html404;

    return function (req, res, error) {
        res.statusCode = 404;

        if (req.xhr) {
            return res.end(error.toJSON ? error.toJSON() : json404);
        }

        if (html404) {
            return res.end(html404);
        }

        res.render('status/404', (err, html) => {
            if (err) {
                loggerError.error('Cannot render 404 page', err);
                html404 = status404;
            } else {
                html404 = html;
            }

            res.end(html404);
        });
    };
}());

export const send500 = (function () {
    const status500 = http.STATUS_CODES[500];
    const json500 = JSON.stringify({ error: status500 });

    return function (req, res, error) {
        res.statusCode = 500;

        if (req.xhr) {
            return res.end(error.toJSON ? error.toJSON() : json500);
        }

        res.render('status/500', { error }, (err, html) => {
            if (err) {
                loggerError.error('Cannot render 500 page', err);
            }

            res.end(html || '');
        });
    };
}());

export function bindErrorHandler(app) {
    // Error handler, must be after other middlewares and routes (next argument is mandatory)
    app.use((error, req, res, next) => {
        const { handshake: { context } = {} } = req;
        const is404 = error instanceof NotFoundError || error.code === 'ENOENT' || error.code === 'ENOTDIR';

        if (!error.logged && !is404) {
            if (context) {
                loggerError.error(context.ridMark, error);
            } else {
                loggerError.error(error);
            }
        }

        // If headers have already been sent to the client (we have started writing the response),
        // express default error handler closes the connection and fails the request
        if (res.headersSent) {
            return next(error);
        }

        if (is404) {
            return send404(req, res, error);
        }

        send500(req, res, error);
    });
}
