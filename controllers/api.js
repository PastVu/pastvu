'use strict';

var	Utils = require('../commons/Utils.js'),
	photoController = require('./photo.js'),
	commentController = require('./comment.js'),
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
			var bounds =  [],
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
				bounds.push([[bound[0], bound[1]], [bound[2], bound[3]]]);
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
		'map.getBounds': getPhotoBoundsRequest,
		'comments.getByObj': getObjCommentsRequest
	};

function apiRouter(req, res) {
	if (!req._parsedUrl.query) {
		return res.set({'Cache-Control': 'no-cache'}).status(200).render('api/help');
	}

	var start = Date.now(),
		app  = req.query.rid,
		rid = req.query.rid,
		method = req.query.method,
		methodHandler = methodMap[method],
		stamp,
		data;

	stamp = req.query.stamp = Number(req.query.stamp);
	if (!rid || !stamp || methodHandler === undefined) {
		res.result = {status: 400, error: 'Bad request'};
		requestFinish(400, req, res);
		return res.send(400, 'Bad request');
	}

	try {
		data = req.query.data ? JSON.parse(req.query.data) : {};
	} catch (e) {
		return res.send(400, 'Bad request. Error while parsing data parameter: ' + e);
	}

	methodHandler(data, function (err, result) {
		if (err) {
			if (typeof err === 'number') {
				return res.send(err, codesMessage[err]);
			}
			return res.send(err.code, err.message);
		}

		res.json(200, {rid: rid, stamp: stamp, result: result});
		console.log(method, Date.now() - start);
	});
}

function requestFinish(err, req, res, appid) {
	if (err) {
		if (typeof err === 'number') {
			return res.send(err, codesMessage[err]);
		}
		return res.send(err.code, err.message);
	}
}

module.exports.apiRouter = apiRouter;