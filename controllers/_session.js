var Session,
	User,
	Utils = require('../commons/Utils.js'),
	_ = require('lodash'),
	ms = require('ms'), // Tiny milisecond conversion utility
	app,
	cookieMaxAgeRegisteredRemember = ms('14d') / 1000,
	cookieMaxAgeAnonimouse = ms('14d') / 1000;

function generate(data, cb) {
	'use strict';

	var session = new Session({
		key: Utils.randomString(12),
		stamp: new Date(),
		data: data || {}
	});

	session.save(function (err, session) {
		if (cb) {
			cb(err, session);
		}
	});

	return session;
}

function regen(session, data, keyRegen, cb) {
	'use strict';

	if (keyRegen) {
		session.key = Utils.randomString(12); // При каждом заходе регенерируем ключ (пока только при логине)
	}
	session.stamp = new Date(); // При каждом заходе продлеваем действие ключа
	if (data) {
		_.assign(session.data, data);
		session.markModified('data');
	}
	session.save(function (err, session) {
		//FIXME: Fix when fix https://github.com/LearnBoost/mongoose/issues/1530
		if (session.user) {
			session.populate('user', function () {
				if (cb) {
					cb(err, session);
				}
			});
		} else {
			if (cb) {
				cb(err, session);
			}
		}
	});

	return session;
}

function destroy(session, cb) {
	'use strict';

	if (session) {
		session.remove(cb);
	} else {
		cb();
	}
}

function emitCookie(socket) {
	'use strict';

	var newCoockie = {name: 'pastvu.sid', key: socket.handshake.session.key, path: '/'};

	if (socket.handshake.session.user) {
		if (socket.handshake.session.data && socket.handshake.session.data.remember) {
			newCoockie['max-age'] = cookieMaxAgeRegisteredRemember;
		}
	} else {
		newCoockie['max-age'] = cookieMaxAgeAnonimouse;
	}

	socket.emit('newCookie', newCoockie);
}

module.exports.create = generate;
module.exports.regen = regen;
module.exports.destroy = destroy;
module.exports.emitCookie = emitCookie;
module.exports.loadController = function (a, db, io) {
	app = a;
	Session = db.model('Session');
	User = db.model('User');

	//io.sockets.on('connection', function (socket) {});
};