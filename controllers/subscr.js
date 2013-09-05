'use strict';

var fs = require('fs'),
	path = require('path'),
	auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	UserSubscr,
	UserSubscrNoty,
	News,
	Photo,
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	log4js = require('log4js'),
	_ = require('lodash'),
	logger,
	photoController = require('./photo.js'),

	msg = {
		deny: 'У вас нет разрешения на это действие', //'You do not have permission for this action'
		noObject: 'Комментируемого объекта не существует, или модераторы перевели его в недоступный вам режим',
		nouser: 'Requested user does not exist'
	};

function subscribeUser(user, data, cb) {
	if (!user) {
		return cb({message: msg.deny, error: true});
	}
	if (!data || !Utils.isType('object', data) || !Number(data.cid)) {
		return cb({message: 'Bad params', error: true});
	}

	var cid = Number(data.cid);

	step(
		function findObj() {
			if (data.type === 'news') {
				News.findOne({cid: cid}, {_id: 1}, this);
			} else {
				photoController.findPhoto({cid: cid}, {_id: 1, user: 1}, user, true, this);
			}
		},
		function (err, obj) {
			if (err || !obj) {
				return cb({message: err && err.message || msg.noObject, error: true});
			}
			if (data.do) {
				UserSubscr.update({obj: obj._id}, {$set: {user: user._id}}, {upsert: true, multi: false}, this);
			} else {
				UserSubscr.remove({obj: obj._id, user: user._id}, this);
			}
		},
		function (err) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({subscr: data.do});
		}
	);
}

module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("profile.js");

	Settings = db.model('Settings');
	User = db.model('User');
	UserSubscr = db.model('UserSubscr');
	UserSubscrNoty = db.model('UserSubscrNoty');
	News = db.model('News');
	Photo = db.model('Photo');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('subscr', function (data) {
			subscribeUser(hs.session.user, data, function (createData) {
				socket.emit('subscrResult', createData);
			});
		});
	});
};