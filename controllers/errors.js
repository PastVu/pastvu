import http from 'http';
import util from 'util';
import log4js from 'log4js';

const logger = log4js.getLogger('error.js');
const logger404 = log4js.getLogger('404.js');
export const neoError = {
    e404: function e404(message) {
        this.message = message;
        Error.captureStackTrace(this, e404);
    },
    e500: function e500(message) {
        this.message = message;
        Error.captureStackTrace(this, e500);
    }
};

util.inherits(neoError.e404, Error);
util.inherits(neoError.e500, Error);
neoError.e404.prototype.name = 'HTTP404Error';
neoError.e500.prototype.name = '500Error';

const send404 = (function () {
    const json404 = JSON.stringify({ error: 'Not found' });
    let html404;

    return function (req, res, err) {
        logger404.error(JSON.stringify({
            url: req.url,
            method: req.method,
            ua: req.headers && req.headers['user-agent'],
            referer: req.headers && req.headers.referer
        }));
        res.statusCode = 404;

        if (req.xhr) {
            res.end(json404);
        } else {
            if (html404) {
                res.end(html404);
            } else {
                res.render('status/404', function (err, html) {
                    if (err) {
                        logger.error('Cannot render 404 page', err);
                        html404 = http.STATUS_CODES[404];
                    } else {
                        html404 = html;
                    }
                    res.end(html404);
                })
            }
        }
    };
}());

var send500 = (function () {
    var html500;

    return function (req, res, err) {
        logger.error(err);
        res.statusCode = 500;

        if (req.xhr) {
            res.end(JSON.stringify({ error: err.message }));
        } else {
            if (html500) {
                res.end(html500);
            } else {
                res.render('status/500', function (err, html) {
                    if (err) {
                        logger.error('Cannot render 500 page', err);
                        html500 = http.STATUS_CODES[500];
                    } else {
                        html500 = html;
                    }
                    res.end(html500);
                });
            }
        }
    };
}());

export function registerErrorHandling(app) {

    // Последний. Если дошли сюда, значит на запрос нет обработчика
    app.all('*', function (req, res) {
        throw new neoError.e404(http.STATUS_CODES['404']);
    });

    // Обработчик выброшенных ошибок
    app.use(function (err, req, res, next) { //аргумент next убирать нельзя - не выстрелит
        if (err instanceof neoError.e404 || err.code === 'ENOENT' || err.code === 'ENOTDIR') {
            send404(req, res, err);
        } else if (err instanceof neoError.e500) {
            send500(req, res, err);
        } else {
            send500(req, res, err);
        }
    });

};