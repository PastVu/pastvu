'use strict';

var _ = require('lodash');
var Utils = require('../commons/Utils');
var settings = require('./settings');
var _session = require('./_session');
var photo = require('./photo');
var errors = require('./errors');

module.exports.loadController = function (app) {
    var clientParams = settings.getClientParams();
    var fullhost = clientParams.server.protocol + '://' + clientParams.server.host;

    var genInitDataString = (function () {
        var clientParamsJSON = JSON.stringify(clientParams);

        return function (req) {
            var usObj = req.handshake.usObj;
            var resultString = 'var init={settings:' + clientParamsJSON + ', user:' + JSON.stringify(_session.getPlainUser(usObj.user));

            if (usObj.registered) {
                resultString += ',registered:true';
            }

            if (req.photoData) {
                resultString += ',photo:' + JSON.stringify(req.photoData);
            }

            resultString += '};';

            return resultString;
        };
    }());

    // Проверка на выключенный у клиенты js. В этом случае клиент передаст параметр _nojs=1 в url
    var checkNoJS = function (req) {
        var nojsShow = req.query._nojs === '1';
        var nojsUrl;

        //Если страница уже не для "отсутствует javascript", вставляем в noscript ссылку на редирект в случае отсутствия javascript
        if (!nojsShow) {
            nojsUrl = req._parsedUrl.pathname + '?' + (req._parsedUrl.query ? req._parsedUrl.query + '&' : '') + '_nojs=1';
        }
        return { nojsUrl: nojsUrl, nojsShow: nojsShow };
    };

    // Для путей, которым не нужна установка сессии напрямую парсим браузер
    var getReqBrowser = function (req, res, next) {
        var ua = req.headers['user-agent'];
        if (ua) {
            req.browser = _session.checkUserAgent(ua);
        }
        next();
    };

    // Заполняем некоторые заголовки для полностью генерируемых страниц
    var setStaticHeaders = (function () {
        var cacheControl = 'no-cache',
            xFramePolicy = 'SAMEORIGIN',
            xPoweredBy = 'Paul Klimashkin | klimashkin@gmail.com',
            xUA = 'IE=edge';

        return function (req, res, next) {
            // Директива ответа для указания браузеру правила кеширования
            // no-cache - браузеру и прокси разрешено кешировать, с обязательным запросом актуальности
            // (в случае с наличием etag в первом ответе, в следующем запросе клиент для проверки актуальности передаст этот etag в заголовке If-None-Match)
            res.setHeader('Cache-Control', cacheControl);

            // The page can only be displayed in a frame on the same origin as the page itself https://developer.mozilla.org/en-US/docs/Web/HTTP/X-Frame-Options
            res.setHeader('X-Frame-Options', xFramePolicy);

            if (req.browser && req.browser.agent.family === 'IE') {
                // X-UA-Compatible header has greater precedence than Compatibility View http://msdn.microsoft.com/en-us/library/ff955275(v=vs.85).aspx
                res.setHeader('X-UA-Compatible', xUA);
            }

            res.setHeader('X-Powered-By', xPoweredBy);
            if (typeof next === 'function') {
                next();
            }
        };
    }());

    [
        '/', // Корень
        /^\/(?:photoUpload)\/?$/, // Пути строгие (/example без или с завершающим слешом)
        /^\/(?:ps|u|news)(?:\/.*)?$/, // Пути с возможным продолжением (/example/*)
        /^\/(?:confirm)\/.+$/ // Пути обязательным продолжением (/example/*)
    ]
        .forEach(function (route) {
            app.get(route, _session.handleHTTPRequest, setStaticHeaders, appMainHandler);
        });

    app.get(/^\/p\/(\d{1,7})$/, _session.handleHTTPRequest, setStaticHeaders, getPhotoForPage, appMainHandler);

    function appMainHandler(req, res) {
        var nojs = checkNoJS(req);
        var photo = req.photoData && req.photoData.photo;

        var meta = { og: {} };

        if (photo) {
            meta.og.url = fullhost + '/p/' + photo.cid;
            meta.title = meta.og.title = photo.title;

            // Include years in OpenGraph title, if they are not in title already
            if (!photo.title.includes(photo.year) && (!photo.year2 || !photo.title.includes(photo.year2))) {
                meta.og.title = photo.y + ' ' + meta.og.title;
            }

            if (photo.desc) {
                meta.desc = meta.og.desc = Utils.txtHtmlToPlain(photo.desc, true);
            } else if (!_.isEmpty(photo.regions)) {
                // If there in no description, create it as regions names
                meta.desc = meta.og.desc = photo.regions.reduceRight(function (result, region, index) {
                    result += region.title_local + (index ? ', ' : '');
                    return result;
                }, '');
            }
            meta.og.img = {
                url: fullhost + '/_p/a/' + photo.file,
                w: photo.w,
                h: photo.h
            };
        }
        if (!meta.og.url) {
            meta.og.url = fullhost + req.url; // req.path if decide without params
        }
        if (!meta.title) {
            meta.title = meta.og.title = 'Retro photos of mankind\'s habitat.';
        }
        if (!meta.desc) {
            meta.desc = meta.og.desc = 'Archive of historical photos, generated by users';
        }

        res.statusCode = 200;
        res.render('app', {
            appName: 'Main',
            initData: genInitDataString(req),
            meta: meta,
            nojsUrl: nojs.nojsUrl,
            nojsShow: nojs.nojsShow,
            agent: req.browser && req.browser.agent
        });
    }

    function getPhotoForPage(req, res, next) {
        var cid = Number(req.params[0]);

        photo.givePhotoForPage(req.handshake.usObj, { cid: cid })
            .then(function (result) {
                if (!result) {
                    throw { noPhoto: true };
                }

                req.photoData = result;
                next();
            })
            .catch(function (err) {
                if (err.noPhoto) {
                    next(new errors.err.e404('Photo ' + cid + ' does not exist'));
                } else {
                    next(err);
                }
            });
    }

    [/^\/(?:admin)(?:\/.*)?$/].forEach(function (route) {
        app.get(route, _session.handleHTTPRequest, setStaticHeaders, appAdminHandler);
    });
    function appAdminHandler(req, res) {
        var nojs = checkNoJS(req);

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

    // Устаревший браузер
    app.get('/badbrowser', getReqBrowser, setStaticHeaders, function (req, res) {
        res.statusCode = 200;
        res.render('status/badbrowser', {
            agent: req.browser && req.browser.agent,
            title: 'Вы используете устаревшую версию браузера'
        });
    });

    // Мой user-agent
    app.get('/myua', getReqBrowser, function (req, res) {
        res.setHeader('Cache-Control', 'no-cache,no-store,max-age=0,must-revalidate');
        res.statusCode = 200;
        res.render('status/myua', {
            agent: req.browser && req.browser.agent,
            accept: req.browser && req.browser.accept,
            title: req.browser && req.browser.agent && req.browser.agent.source
        });
    });

    // ping-pong для проверки работы сервера
    app.all('/ping', function (req, res) {
        res.status(200).send('pong');
    });
};