import _ from 'lodash';
import config from '../config';
import * as errors from './errors';
import Utils from '../commons/Utils';
import * as session from './_session';
import { clientParams } from './settings';
import { givePhotoForPage } from './photo';

export function loadController(app) {
    const origin = config.client.origin;
    const clientParamsJSON = JSON.stringify(clientParams);

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
    };

    // Check for disabled js in client's browser. In this case client send query parameter '_nojs=1'
    const checkNoJS = req => {
        const nojsShow = req.query._nojs === '1';
        let nojsUrl;

        // If page doesn't fo nojs clients yet, insert into 'noscript' reference for redirect
        if (!nojsShow) {
            const url = req._parsedUrl;
            nojsUrl = url.pathname + '?' + (url.query ? url.query + '&' : '') + '_nojs=1';
        }

        return { nojsUrl, nojsShow };
    };

    // For paths, which don't need session, parse browser directly
    const getReqBrowser = (req, res, next) => {
        const ua = req.headers['user-agent'];
        if (ua) {
            req.browser = session.checkUserAgent(ua);
        }
        next();
    };

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

    [
        '/', // Root
        /^\/(?:photoUpload)\/?$/, // Strict paths (/example with or without trailing slash)
        /^\/(?:ps|u|news)(?:\/.*)?$/, // Path with possible continuation (/example/*)
        /^\/(?:confirm)\/.+$/ // Path with mandatory continuation (/example/*)
    ]
        .forEach(function (route) {
            app.get(route, session.handleHTTPRequest, setStaticHeaders, appMainHandler);
        });

    app.get(/^\/p\/(\d{1,7})$/, session.handleHTTPRequest, setStaticHeaders, getPhotoForPage, appMainHandler);

    function appMainHandler(req, res) {
        const nojs = checkNoJS(req);
        const photo = req.photoData && req.photoData.photo;

        const meta = { og: {}, twitter: {} };

        if (photo) {
            meta.og.url = `${origin}/p/${photo.cid}`;

            if (photo.desc) {
                meta.desc = meta.og.desc = meta.twitter.desc = Utils.txtHtmlToPlain(photo.desc, true);
            } else if (!_.isEmpty(photo.regions)) {
                // If there in no description, create it as regions names
                meta.desc = meta.og.desc = meta.twitter.desc = photo.regions.reduceRight(
                    (result, region, index) => result + region.title_en + (index ? ', ' : ''), ''
                );
            } else {
                meta.desc = '';
            }

            meta.title = meta.og.title = meta.twitter.title = photo.title;

            // Include years in OpenGraph title, if they are not in title already
            if (!photo.title.includes(photo.year) && (!photo.year2 || !photo.title.includes(photo.year2)) &&
                !meta.desc.includes(photo.year) && (!photo.year2 || !meta.desc.includes(photo.year2))) {
                meta.og.title = meta.twitter.title = photo.y + ' ' + meta.title;
            }

            meta.og.img = {
                url: `${origin}/_p/a/${photo.file}`,
                w: photo.w,
                h: photo.h
            };
            meta.twitter.img = {
                url: `${origin}/_p/d/${photo.file}` // Twitter image must be less than 1MB in size, so use standard
            };
        }
        if (!meta.og.url) {
            meta.og.url = origin + req.url; // req.path if decide without params
        }
        if (!meta.title) {
            meta.title = meta.og.title = meta.twitter.title = `Retro photos of mankind's habitat.`;
        }
        if (!meta.desc) {
            meta.desc = meta.og.desc = meta.twitter.desc = `Archive of historical photos, generated by users`;
        }
        if (meta.twitter.desc.length > 200) {
            meta.twitter.desc = meta.twitter.desc.substr(0, 197) + '...';
        }

        res.statusCode = 200;
        res.render('app', {
            meta,
            appName: 'Main',
            initData: genInitDataString(req),
            nojsUrl: nojs.nojsUrl,
            nojsShow: nojs.nojsShow,
            agent: req.browser && req.browser.agent
        });
    }

    function getPhotoForPage(req, res, next) {
        const cid = Number(req.params[0]);

        givePhotoForPage(req.handshake.usObj, { cid })
            .then(function (result) {
                if (!result) {
                    throw { noPhoto: true };
                }

                req.photoData = result;
                next();
            })
            .catch(function (err) {
                if (err.noPhoto) {
                    next(new errors.neoError.e404('Photo ' + cid + ' does not exist'));
                } else {
                    next(err);
                }
            });
    }

    [/^\/(?:admin)(?:\/.*)?$/].forEach(route => {
        app.get(route, session.handleHTTPRequest, setStaticHeaders, appAdminHandler);
    });
    function appAdminHandler(req, res) {
        const nojs = checkNoJS(req);

        res.statusCode = 200;
        res.render('app', {
            appName: 'Admin',
            initData: genInitDataString(req),
            meta: {},
            nojsUrl: nojs.nojsUrl,
            nojsShow: nojs.nojsShow,
            agent: req.browser && req.browser.agent
        });
    }

    // Obsolete browser
    app.get('/badbrowser', getReqBrowser, setStaticHeaders, (req, res) => {
        res.statusCode = 200;
        res.render('status/badbrowser', {
            agent: req.browser && req.browser.agent,
            title: 'You are using outdated browser version'
        });
    });

    // My user-agent
    app.get('/myua', getReqBrowser, (req, res) => {
        res.setHeader('Cache-Control', 'no-cache,no-store,max-age=0,must-revalidate');
        res.statusCode = 200;
        res.render('status/myua', {
            agent: req.browser && req.browser.agent,
            accept: req.browser && req.browser.accept,
            title: req.browser && req.browser.agent && req.browser.agent.source
        });
    });

    // ping-pong to verify the server is working
    app.all('/ping', (req, res) => {
        res.status(200).send('pong');
    });
};