/* eslint-disable no-throw-literal, prefer-promise-reject-errors */

import ms from 'ms';
import { logIt as logAPI } from './apilog.js';
import Utils from '../commons/Utils';

let core;
const REQUEST_SELF_LIFE = ms('60s');
const apps = {
    test: { limit: 2, interval: 1e3, lastCall: 0, count: 0 },
    mPsTm: true,
};
const errors = {
    '1': { status: 403, statusText: 'Not allowed application. Forbidden' },
    '2': { status: 401, statusText: 'Service unavalible' },

    '10': { status: 400, errorText: 'Bad request. Not enough parameters' },
    '11': { status: 400, errorText: 'Bad request. Some parameter length not allowed' },
    '12': { status: 408, errorText: 'Request is too old' },
    '13': { status: 400, errorText: 'Roads... where we are going, we do not need roads' },

    '20': { status: 400, errorText: 'Error while parsing data parameter' },
    '21': { status: 400, errorText: 'Invalid method parameters' },

    '31': { status: 400, errorText: 'Requested area too large' },

    '99': { status: 500, errorText: 'Error occured' },

    '101': { errorText: "Photo doesn't exists" },
};

const getPhotoRequest = (function () {
    const noselect = { frags: 0, album: 0, adate: 0, stdate: 0, sdate: 0, ucdate: 0 };

    return data => new Promise((resolve, reject) => {
        const cid = Number(data.cid);

        if (!cid || cid < 0) {
            throw { code: 21 };
        }

        core.request('photo', 'givePhoto', [{}, { cid, countView: true, noselect }])
            .spread(photo => {
                if (photo.ldate) {
                    photo.ldate = new Date(photo.ldate).getTime();
                }

                resolve([photo]);
            })
            .catch(() => {
                reject({ code: 101 });
            });
    });
}());

const getPhotoBoundsRequest = (function () {
    const minZoom = 3;
    const maxZoom = 20;
    const areaLimit = [
        0, 0, 0, 34530, 8425, 2085, 519, 130, 33, 8.12,
        2.02, 0.507, 0.127, 0.0317, 0.008, 0.00199, 0.000495, 0.000125, 0.000125, 0.000125, 0.000125,
    ];

    return data => new Promise((resolve, reject) => {
        const zoom = Number(data.z);

        if (!zoom || zoom < minZoom || zoom > maxZoom || !Array.isArray(data.bounds) || !data.bounds.length || data.bounds.length > 4) {
            reject({ code: 21 });
        }

        const bounds = [];
        let bound;
        let area = 0;

        for (let i = 0; i < data.bounds.length; i++) {
            bound = data.bounds[i];

            if (!Utils.geo.checkbbox(bound)) {
                reject({ code: 21 });
            }

            area += (bound[2] - bound[0]) * (bound[3] - bound[1]);
            bounds.push([
                [bound[0], bound[1]],
                [bound[2], bound[3]],
            ]);
        }

        if (area > areaLimit[zoom]) {
            reject({ code: 31 });
        }

        data.bounds = bounds;
        core.request('photo', 'getBounds', [data], true, true)
            .spread((photos, clusters) => {
                resolve(['{"photos":' + (photos || '[]') + ',"clusters":' + (clusters || '[]') + '}', true]);
            });
    });
}());

const getPhotoNearRequest = (function () {
    return async data => {
        if (!data || !Utils.geo.checkLatLng(data.geo)) {
            throw { code: 21 };
        }

        data.geo.reverse();

        if (data.limit) {
            data.limit = Math.abs(Number(data.limit));
        }

        if (data.skip) {
            data.skip = Math.abs(Number(data.skip));
        }

        if (data.distance) {
            data.distance = Math.abs(Number(data.distance));
        }

        try {
            const photos = await core.request('photo', 'giveNearestPhotos', [data], true);

            return [photos, true];
        } catch (err) {
            throw { code: 101 };
        }
    };
}());

const getObjCommentsRequest = (function () {
    return async data => {
        const cid = Number(data.cid);

        if (!cid || cid < 0) {
            throw { code: 21 };
        }

        try {
            const commentsTree = await core.request('comment', 'getCommentsObjAnonym', [{}, { type: 'photo', cid }], true);

            return [commentsTree, true];
        } catch (err) {
            throw { code: 101 };
        }
    };
}());

const methodMap = {
    'photo.get': getPhotoRequest,
    'photos.near': getPhotoNearRequest,
    'map.getBounds': getPhotoBoundsRequest,
    'comments.getByObj': getObjCommentsRequest,
};

function requestHandler(req, res) {
    if (!req._parsedUrl.query) {
        return res.set({ 'Cache-Control': 'no-cache' }).status(200).render('api/help');
    }

    const start = Date.now();
    const query = req.query;
    const methodHandler = methodMap[query.method];
    let data;

    // Хак, обходящий необходимость передачи свежего запроса
    if (query.app === 'test') {
        query.stamp = start - 1;
    }

    const stamp = query.stamp = Number(query.stamp);
    const app = apps[query.app];

    if (app === undefined) {
        return requestFinish({ code: 1 }, req, res, start);
    }

    if (!query.rid || !stamp || methodHandler === undefined) {
        return requestFinish({ code: 10 }, req, res, start);
    }

    if (query.rid.length > 32) {
        return requestFinish({ code: 11 }, req, res, start);
    }

    // Если запрос старше 10сек или в будущем, это не приемлемо
    if (stamp < start - REQUEST_SELF_LIFE) {
        return requestFinish({ code: 12 }, req, res, start);
    }

    if (stamp > start) {
        return requestFinish({ code: 13 }, req, res, start);
    }

    try {
        data = query.data ? JSON.parse(query.data) : {};
    } catch (e) {
        return requestFinish({ code: 20 }, req, res, start);
    }

    methodHandler(data)
        .spread((result, stringified) => requestFinish(null, req, res, start, result, stringified))
        .catch(err => requestFinish(err, req, res, start));
}

function requestFinish(err, req, res, start, result, stringified) {
    const query = req.query;
    let sendStatus;
    let sendResult;
    let error;
    let errorCode;
    let errorMessage;

    if (err) {
        errorCode = err.code;
        error = errors[errorCode];

        if (error) {
            sendStatus = error.status || 200;

            if (error.errorText) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                errorMessage = error.errorText;
                sendResult = JSON.stringify({ rid: query.rid, stamp: query.stamp, error: { code: errorCode, message: errorMessage } });
            } else {
                sendResult = error.statusText || 'Error occurred';
            }
        } else {
            sendStatus = errorCode || 500;
            sendResult = errorMessage = err.message || 'Error occurred';
        }
    } else {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        sendStatus = 200;

        if (stringified === true) {
            sendResult = '{"rid":' + query.rid + ',"stamp":' + query.stamp + ',"result":' + result + '}';
        } else {
            sendResult = JSON.stringify({ rid: query.rid, stamp: query.stamp, result });
        }
    }

    res.statusCode = sendStatus;
    res.send(sendResult);
    logIt(req, start, sendStatus, errorCode, errorMessage);
}

function logIt(req, start, status, errorCode, errorMessage) {
    const query = req.query;
    const ms = Date.now() - start;

    logAPI(query.app, query.rid, query.stamp, query.method, query.data, start, ms, status, errorCode, errorMessage);
}

module.exports.loadController = function (app, c) {
    core = c;
    app.route(/^\/0\.2\.0\/?$/).get(requestHandler).post(requestHandler);
};
