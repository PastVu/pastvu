'use strict';

var Utils = require('../commons/Utils.js'),
	logController = require('./apilog.js'),
	photoController = require('./photo.js'),
	commentController = require('./comment.js'),
	apps = {
		'mPsTm': true
	},
	errors = {
		'1': {status: 403, statusText: 'Not allowed application. Forbidden'},

		'10': {status: 400, errorText: 'Bad request. Not enough parameters'},
		'11': {status: 400, errorText: 'Bad request. Some parameter length not allowed'},
		'12': {status: 400, errorText: 'Request is the time machine'},
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
			photoController.core.givePhoto(null, {cid: cid, noselect: noselect}, function (err, photo) {
				if (err) {
					return cb(101);
				}
				if (photo.ldate) {
					photo.ldate = photo.ldate.getTime();
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
			photoController.core.getBounds(data, function (err, photos, clusters) {
				if (err) {
					return cb(101);
				}
				cb(null, {photos: photos, clusters: clusters});
			});
		};
	}()),
	getPhotoNearRequest = (function () {
		return function (data, cb) {
			if (!data || !Utils.geo.checkLatLng(data.geo)) {
				return cb(21);
			}
			data.limit = Number(data.limit);
			data.geo.reverse();

			photoController.core.giveNearestPhotos(data, function (err, photos) {
				if (err) {
					return cb(101);
				}
				cb(null, {photos: photos || []});
			});
		};
	}()),
	getObjCommentsRequest = (function () {
		return function (data, cb) {
			var cid = Number(data.cid);
			if (!cid || cid < 0) {
				return cb(21);
			}
			commentController.core.getCommentsObjAnonym({type: 'photo', cid: cid}, function (err, commentsTree) {
				if (err) {
					return cb(101);
				}
				cb(null, commentsTree);
			});
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
		stamp,
		data;

	//Хак, обходящий необходимость передачи свежего запроса
	if (query.stamp === '51') {
		query.stamp = start - 1;
	}

	stamp = query.stamp = Number(query.stamp);
	if (apps[query.app] === undefined) {
		return requestFinish(1, req, res, start);
	}
	if (!query.rid || !stamp || methodHandler === undefined) {
		return requestFinish(10, req, res, start);
	}

	if (query.rid.length > 32) {
		return requestFinish(11, req, res, start);
	}

	//Если запрос старше 10сек или в будущем, это не приемлемо
	if (stamp < start - 1e4) {
		return requestFinish(12, req, res, start);
	} else if (stamp > start) {
		return requestFinish(13, req, res, start);
	}

	try {
		data = query.data ? JSON.parse(query.data) : {};
	} catch (e) {
		return requestFinish(20, req, res, start);
	}

	methodHandler(data, function (err, result) {
		requestFinish(err, req, res, start, result);
	});
}

function requestFinish(err, req, res, start, result) {
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
		sendResult = JSON.stringify({rid: query.rid, stamp: query.stamp, result: result});
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

module.exports.apiRouter = apiRouter;