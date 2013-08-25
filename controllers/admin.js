'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	Counter,
	News,
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	msg = {
		deny: 'You do not have permission for this action'
	};


function createNews(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function () {
			Counter.increment('news', this);
		},
		function (err, count) {
			if (err || !count) {
				return cb({message: err && err.message || 'Increment comment counter error', error: true});
			}

			var novel = new News({
				cid: count.next,
				user: iAm,
				pdate: data.pdate,
				tdate: data.tdate,
				title: data.title,
				notice: data.notice,
				txt: data.txt
			});
			novel.save(this);
		},
		function (err, novel) {
			if (err || !novel) {
				return cb({message: err && err.message || 'Save error', error: true});
			}
			cb({news: novel});
		}
	);
}
function saveNews(socket, data, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	if (!Utils.isType('object', data)) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function () {
			News.findOne({cid: data.cid}, this);
		},
		function (err, novel) {
			if (err || !novel) {
				return cb({message: err && err.message || 'No such news', error: true});
			}
			novel.pdate = data.pdate;
			novel.tdate = data.tdate;
			novel.title = data.title;
			novel.notice = data.notice;
			novel.txt = data.txt;
			novel.nocomments = data.nocomments ? true : undefined;
			novel.save(this);
		},
		function (err, novel) {
			if (err || !novel) {
				return cb({message: err && err.message || 'Save error', error: true});
			}
			cb({news: novel});
		}
	);
}

function getOnlineStat(socket, cb) {
	var iAm = socket.handshake.session.user;

	if (!iAm || !iAm.role || iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	var usersCount = Utils.getObjectPropertyLength(_session.us),
		sessions = _session.sess,

		sessUserCount = 0,
		sessUserZeroSockCount = 0,
		sessUserNoSockCount = 0,
		sessAnonymCount = 0,
		sessAnonymZeroSockCount = 0,
		sessAnonymNoSockCount = 0,
		sessNoSockHeaders = [],

		sessionsWaitingConnect = _session.sessWaitingConnect,
		sessWCUserCount = 0,
		sessWCAnonymCount = 0,

		socketUserCount = 0,
		socketAnonymCount = 0,

		sockets,
		isReg,
		count,
		i,
		j;

	for (i in sessions) {
		if (sessions[i] !== undefined) {
			isReg = !!sessions[i].user;
			if (isReg) {
				sessUserCount++;
			} else {
				sessAnonymCount++;
			}
			sockets = sessions[i].sockets;
			if (sockets) {
				count = Object.keys(sockets).length || 0;
				if (isReg) {
					if (count) {
						socketUserCount += count;
					} else {
						sessUserZeroSockCount++;
					}
				} else {
					if (count) {
						socketAnonymCount += count;
					} else {
						sessAnonymZeroSockCount++;
					}
				}
			} else {
				if (isReg) {
					sessUserNoSockCount++;
				} else {
					sessAnonymNoSockCount++;
				}
				sessNoSockHeaders.push({stamp: sessions[i].stamp, header: (sessions[i].data && sessions[i].data.headers) || {}});
			}
		}
	}

	for (i in sessionsWaitingConnect) {
		if (sessionsWaitingConnect[i] !== undefined) {
			isReg = !!sessions[i].user;
			if (isReg) {
				sessWCUserCount++;
			} else {
				sessWCAnonymCount++;
			}
		}
	}
	cb(null, {
		all: usersCount + sessAnonymCount,
		users: usersCount,

		sessUC: sessUserCount,
		sessUZC: sessUserZeroSockCount,
		sessUNC: sessUserNoSockCount,
		sessAC: sessAnonymCount,
		sessAZC: sessAnonymZeroSockCount,
		sessANC: sessAnonymNoSockCount,
		sessNCHeaders: sessNoSockHeaders,

		sessWCUC: sessWCUserCount,
		sessWCAC: sessWCAnonymCount,

		sockUC: socketUserCount,
		sockAC: socketAnonymCount
	});
}


module.exports.loadController = function (app, db, io) {

	Settings = db.model('Settings');
	Counter = db.model('Counter');
	User = db.model('User');
	News = db.model('News');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('saveNews', function (data) {
			if (data.cid) {
				saveNews(socket, data, function (resultData) {
					socket.emit('saveNewsResult', resultData);
				});
			} else {
				createNews(socket, data, function (resultData) {
					socket.emit('saveNewsResult', resultData);
				});
			}
		});

		socket.on('getOnlineStat', function () {
			getOnlineStat(socket, function (err, resultData) {
				socket.emit('takeOnlineStat', resultData);
			});
		});
	});

};