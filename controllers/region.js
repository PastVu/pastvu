'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	Counter,
	Region,
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	msg = {
		deny: 'You do not have permission for this action'
	};

function saveRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.geo || !data.title_en) {
		return cb({message: 'Bad params', error: true});
	}

	if (typeof data.geo === 'string') {
		try {
			data.geo = JSON.parse(data.geo);
		} catch (err) {
			return cb({message: err && err.message || 'GeoJSON parse error!', error: true});
		}
	}

	if (!data.cid) {
		Counter.increment('region', function (err, count) {
			if (err || !count) {
				return cb({message: err && err.message || 'Increment comment counter error', error: true});
			}
			fill(new Region({cid: count.next}));
		});
	} else {
		Region.findOne({cid: data.cid}, function (err, region) {
			if (err || !region) {
				return cb({message: err && err.message || 'Such region doesn\'t exists', error: true});
			}
			fill(region);
		});
	}

	function fill(region) {
		region.geo = data.geo;
		region.markModified('geo');

		if (data.level) {
			region.level = data.level;
			region.parent = data.parent;
		} else if (region.parent) {
			region.parent = undefined;
		}
		region.title_en = String(data.title_en);
		region.title_local = data.title_local ? undefined : String(data.title_local);

		region.save(function (err, region) {
			if (err || !region) {
				return cb({message: err && err.message || 'Save error', error: true});
			}
			cb({region: region});
		});
	}
}

function getRegion(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data) || !data.cid) {
		return cb({message: 'Bad params', error: true});
	}

	Region.findOne({cid: data.cid}, {_id: 0}, function (err, region) {
		if (err || !region) {
			return cb({message: err && err.message || 'Such region doesn\'t exists', error: true});
		}
		cb({region: region});
	});
}

module.exports.loadController = function (app, db, io) {

	Settings = db.model('Settings');
	Counter = db.model('Counter');
	User = db.model('User');
	Region = db.model('Region');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('saveRegion', function (data) {
			saveRegion(socket, data, function (resultData) {
				socket.emit('saveRegionResult', resultData);
			});
		});
		socket.on('getRegion', function (data) {
			getRegion(socket, data, function (resultData) {
				socket.emit('takeRegion', resultData);
			});
		});
	});

};