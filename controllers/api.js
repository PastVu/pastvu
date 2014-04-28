'use strict';

var Utils = require('../commons/Utils.js'),
	logController = require('./apilog.js'),
	photoController = require('./photo.js'),
	commentController = require('./comment.js'),
	apps = {
		'10': true
	},
	codesMessage = {
		'400': 'Bad request',
		'404': 'Not found',
		'500': 'Error occured'
	};

var getPhotoRequest = (function () {
		var noselect = {frags: 0, album: 0, adate: 0, sdate: 0};
		return function (data, cb) {
			var cid = Number(data.cid);
			if (!cid) {
				return cb(400);
			}
			photoController.core.givePhoto(null, {cid: cid, noselect: noselect}, function (err, photo) {
				if (err) {
					return cb(500);
				}
				if (photo.ldate) {
					photo.ldate = photo.ldate.getTime();
				}
				cb(null, photo);
			});
		};
	}()),
	getPhotoBoundsRequest = (function () {
		return function (data, cb) {
			var bounds = [],
				bound,
				i;

			if (!Number(data.z) || !Array.isArray(data.bounds) || !data.bounds.length) {
				return cb(400);
			}
			for (i = 0; i < data.bounds.length; i++) {
				bound = data.bounds[i];
				if (!Utils.geo.checkbbox(bound)) {
					return cb(400);
				}
				bounds.push([
					[bound[0], bound[1]],
					[bound[2], bound[3]]
				]);
			}
			data.bounds = bounds;
			photoController.core.getBounds(data, function (err, photos, clusters) {
				if (err) {
					return cb(500);
				}
				cb(null, {photos: photos, clusters: clusters});
			});
		};
	}()),
	getPhotoNearRequest = (function () {
		return function (data, cb) {
			if (!data || !Utils.geo.checkLatLng(data.geo)) {
				return cb({message: 'Bad params', error: true});
			}
			data.limit = Number(data.limit);
			data.geo.reverse();

			photoController.core.giveNearestPhotos(data, function (err, photos) {
				if (err) {
					return cb(500);
				}
				cb(null, {photos: photos || []});
			});
		};
	}()),
	getObjCommentsRequest = (function () {
		var noselect = {frags: 0, album: 0, adate: 0, sdate: 0};
		return function (data, cb) {
			var cid = Number(data.cid);
			if (!cid) {
				return cb(400);
			}
			commentController.core.getCommentsObjAnonym({type: 'photo', cid: cid}, function (err, commentsTree) {
				if (err) {
					return cb(500);
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
		methodHandler = methodMap[req.query.method],
		stamp,
		data;

	if (req.query.stamp === '51') {
		req.query.stamp = start - 1;
	}

	stamp = req.query.stamp = Number(req.query.stamp);
	if (apps[req.query.app] === undefined || !req.query.rid || !stamp || methodHandler === undefined) {
		return requestFinish(400, req, res, start);
	}

	//Если запрос старше 10сек или в будущем, это не приемлемо
	if (stamp < start - 1e4) {
		return requestFinish({code: 412, message: 'Request is the time machine'}, req, res, start);
	} else if (stamp > start) {
		return requestFinish({code: 412, message: 'Roads... where we are going, we don not need roads'}, req, res, start);
	}

	try {
		data = req.query.data ? JSON.parse(req.query.data) : {};
	} catch (e) {
		return requestFinish({code: 400, message: 'Bad request. Error while parsing data parameter: ' + e}, req, res, start);
	}

	methodHandler(data, function (err, result) {
		requestFinish(null, req, res, start, result);
	});
}

function requestFinish(err, req, res, start, result) {
	var query = req.query,
		code, sendResult, errorMessage;

	if (err) {
		if (typeof err === 'number') {
			code = err;
			errorMessage = codesMessage[err];
		} else {
			code = err.code;
			errorMessage = err.message;
		}
		sendResult = errorMessage;
	} else {
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		code = 200;
		sendResult = JSON.stringify({rid: query.rid, stamp: query.stamp, result: result});
	}

	res.statusCode = code;
	res.send(sendResult);
	logIt(req, start, code, errorMessage);
}

function logIt(req, start, code, errmessage) {
	var query = req.query,
		ms = Date.now() - start;

	logController.logIt(query.app, query.rid, query.stamp, query.method, query.data, start, ms, code, errmessage);
}

module.exports.apiRouter = apiRouter;