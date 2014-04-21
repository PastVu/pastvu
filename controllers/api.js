'use strict';

var photoController = require('./photo.js'),
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
		var noselect = {frags: 0, album: 0, adate: 0, sdate: 0};
		return function (req, res) {
			var zoom = Number(req.params.zoom);
			if (!zoom) {
				return res.send(400, 'Bad request');
			}
			photoController.core.givePhoto(null, {cid: 1, noselect: noselect}, function (err, photo) {
				if (err) {
					return res.send(500, 'Error ocured');
				}
				if (photo.ldate) {
					photo.ldate = photo.ldate.getTime();
				}
				res.json(200, photo);
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
		'comments.getByObj': getObjCommentsRequest
	};

function apiRouter(req, res) {
	if (!req._parsedUrl.query) {
		return res.set({'Cache-Control': 'no-cache'}).status(200).render('api/help');
	}

	var start = Date.now(),
		rid = req.query.rid,
		stamp = req.query.stamp,
		method = req.query.method,
		methodHandler = methodMap[method],
		data;

	if (!rid || !stamp || methodHandler === undefined) {
		return req.send(400, 'Bad request');
	}

	try {
		data = req.query.data ? JSON.parse(req.query.data) : {};
	} catch (e) {
		return req.send(400, 'Bad request. Error while parsing data parameter: ' + e);
	}

	methodHandler(data, function (err, result) {
		if (err) {
			if (typeof err === 'number') {
				return req.send(err, codesMessage[err]);
			}
			return req.send(err.code, err.message);
		}

		res.json(200, {rid: rid, stamp: stamp, result: result});
		console.log(method, Date.now() - start);
	});
}

module.exports.apiRouter = apiRouter;
module.exports.getPhotoRequest = getPhotoRequest;
module.exports.getPhotoBoundsRequest = getPhotoBoundsRequest;
module.exports.getObjCommentsRequest = getObjCommentsRequest;