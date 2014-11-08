'use strict';

var ms = require('ms'),
    log4js = require('log4js'),
	logger = log4js.getLogger('api.js'),
	logController = require('./apilog.js'),
    Utils = require('../commons/Utils.js'),
    core,
    REQUEST_SELF_LIFE = ms('60s'),
	apps = {
		test: {limit: 2, interval: 1e3, lastCall: 0, count: 0},
		mPsTm: true
	},
	errors = {
		'1': {status: 403, statusText: 'Not allowed application. Forbidden'},
		'2': {status: 401, statusText: 'Service unavalible'},

		'10': {status: 400, errorText: 'Bad request. Not enough parameters'},
		'11': {status: 400, errorText: 'Bad request. Some parameter length not allowed'},
		'12': {status: 408, errorText: 'Request is too old'},
		'13': {status: 400, errorText: 'Roads... where we are going, we do not need roads'},

		'20': {status: 400, errorText: 'Error while parsing data parameter'},
		'21': {status: 400, errorText: 'Invalid method parameters'},

		'31': {status: 400, errorText: 'Requested area too large'},

		'99': {status: 500, errorText: 'Error occured'},

		'101': {errorText: "Photo doesn't exists"}
	};

var getPhotoRequest = (function () {
		var noselect = {frags: 0, album: 0, adate: 0, sdate: 0};
		return function (data, cb) {
			var cid = Number(data.cid);
			if (!cid || cid < 0) {
				return cb(21);
			}
			core.request('photo', 'givePhoto', [{}, {cid: cid, countView: true, noselect: noselect}], function (err, photo) {
				if (err) {
					return cb(101);
				}
				if (photo.ldate) {
					photo.ldate = new Date(photo.ldate).getTime();
				}
				cb(null, photo);
			});
		};
	}()),
	getPhotoBoundsRequest = (function () {
		var minZoom = 3,
			maxZoom = 20,
			areaLimit = [0, 0, 0, 34530, 8425, 2085, 519, 130, 33, 8.12, 2.02, 0.507, 0.127, 0.0317, 0.008, 0.00199, 0.000495, 0.000125, 0.000125, 0.000125, 0.000125];

		return function (data, cb) {
			var bounds = [],
				bound,
				zoom = Number(data.z),
				area = 0,
				i;

			if (!zoom || zoom < minZoom || zoom > maxZoom || !Array.isArray(data.bounds) || !data.bounds.length || data.bounds.length > 4) {
				return cb(21);
			}
			for (i = 0; i < data.bounds.length; i++) {
				bound = data.bounds[i];
				if (!Utils.geo.checkbbox(bound)) {
					return cb(21);
				}
				area += (bound[2] - bound[0]) * (bound[3] - bound[1]);
				bounds.push([
					[bound[0], bound[1]],
					[bound[2], bound[3]]
				]);
			}
			if (area > areaLimit[zoom]) {
				return cb(31);
			}

			data.bounds = bounds;
			core.request('photo', 'getBounds', [data], function (err, photos, clusters) {
				if (err) {
					return cb(101);
				}
				cb(null, '{"photos":' + photos + ',"clusters":' + clusters + '}', true);
			}, 2);
		};
	}()),
	getPhotoNearRequest = (function () {
		return function (data, cb) {
			if (!data || !Utils.geo.checkLatLng(data.geo)) {
				return cb(21);
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

			core.request('photo', 'giveNearestPhotos', [data], function (err, photos) {
				if (err) {
					return cb(101);
				}
				cb(null, photos, true);
			}, 1);
		};
	}()),
	getObjCommentsRequest = (function () {
		return function (data, cb) {
			var cid = Number(data.cid);
			if (!cid || cid < 0) {
				return cb(21);
			}
			core.request('comment', 'getCommentsObjAnonym', [
                {}, {type: 'photo', cid: cid}
			], function (err, commentsTree) {
				if (err) {
					return cb(101);
				}
				cb(null, commentsTree, true);
			}, 1);
		};
	}()),

	methodMap = {
		'photo.get': getPhotoRequest,
		'photos.near': getPhotoNearRequest,
		'map.getBounds': getPhotoBoundsRequest,
		'comments.getByObj': getObjCommentsRequest
	};

function apiRouter(req, res) {
	if (!req._parsedUrl.query) {
		return res.set({'Cache-Control': 'no-cache'}).status(200).render('api/help');
	}

	var start = Date.now(),
		query = req.query,
		methodHandler = methodMap[query.method],
		app,
		stamp,
		data;

	//Хак, обходящий необходимость передачи свежего запроса
	if (query.app === 'test') {
		query.stamp = start - 1;
	}
	stamp = query.stamp = Number(query.stamp);

	app = apps[query.app];
	if (app === undefined) {
		return requestFinish(1, req, res, start);
	}
	if (!query.rid || !stamp || methodHandler === undefined) {
		return requestFinish(10, req, res, start);
	}

	if (query.rid.length > 32) {
		return requestFinish(11, req, res, start);
	}

	//Если запрос старше 10сек или в будущем, это не приемлемо
	if (stamp < start - REQUEST_SELF_LIFE) {
		return requestFinish(12, req, res, start);
	} else if (stamp > start) {
		return requestFinish(13, req, res, start);
	}

	try {
		data = query.data ? JSON.parse(query.data) : {};
	} catch (e) {
		return requestFinish(20, req, res, start);
	}

	methodHandler(data, function (err, result, stringified) {
		requestFinish(err, req, res, start, result, stringified);
	});
}

function requestFinish(err, req, res, start, result, stringified) {
	var query = req.query,
		sendStatus, sendResult,
		error, errorCode, errorMessage;

	if (err) {
		if (typeof err === 'number') {
			error = errors[err];
			sendStatus = error.status || 200;
			errorCode = err;
			if (error.errorText) {
				res.setHeader('Content-Type', 'application/json; charset=utf-8');
				errorMessage = error.errorText;
				sendResult = JSON.stringify({rid: query.rid, stamp: query.stamp, error: {code: errorCode, text: errorMessage}});
			} else {
				sendResult = error.statusText || 'Error occurred';
			}
		} else {
			sendStatus = err.code || 500;
			sendResult = errorMessage = err.message || 'Error occurred';
		}
	} else {
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		sendStatus = 200;
		if (stringified === true) {
			sendResult = '{"rid":' + query.rid + ',"stamp":' + query.stamp + ',"result":' + result + '}';
		} else {
			sendResult = JSON.stringify({rid: query.rid, stamp: query.stamp, result: result});
		}

	}

	res.statusCode = sendStatus;
	res.send(sendResult);
	logIt(req, start, sendStatus, errorCode, errorMessage);
}

function logIt(req, start, status, errorCode, errorMessage) {
	var query = req.query,
		ms = Date.now() - start;

	logController.logIt(query.app, query.rid, query.stamp, query.method, query.data, start, ms, status, errorCode, errorMessage);
}

module.exports.loadController = function (app, db, c) {
	core = c;
	app.route(/^\/0\.2\.0\/?$/).get(apiRouter).post(apiRouter);
};