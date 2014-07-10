'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	Counter,
	News,
	_ = require('lodash'),
	step = require('step'),
	Utils = require('../commons/Utils.js'),
	regionController = require('./region.js'),
	msg = {
		deny: 'You do not have permission for this action'
	};


function createNews(iAm, data, cb) {
	if (!_.isObject(data)) {
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
function saveNews(iAm, data, cb) {
	if (!_.isObject(data)) {
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

function getOnlineStat(usObj, cb) {
	if (!usObj.isAdmin) {
		return cb({message: msg.deny, error: true});
	}

	var usersCount = Utils.getObjectPropertyLength(_session.usLogin),
		sessions = _session.sessConnected,

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
		sessWCNoSockHeaders = [],

		socketUserCount = 0,
		socketAnonymCount = 0,

		sockets,
		isReg,
		count,
		i;

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
			isReg = !!sessionsWaitingConnect[i].user;
			if (isReg) {
				sessWCUserCount++;
			} else {
				sessWCAnonymCount++;
			}
			sessWCNoSockHeaders.push({stamp: sessionsWaitingConnect[i].stamp, header: (sessionsWaitingConnect[i].data && sessionsWaitingConnect[i].data.headers) || {}});
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
		sessWCNCHeaders: sessWCNoSockHeaders,

		sockUC: socketUserCount,
		sockAC: socketAnonymCount
	});
}

//Сохраняем права пользователя
function saveUserCredentials(usObj, data, cb) {
	if (!usObj.isAdmin) {
		return cb({message: msg.deny, error: true});
	}

	var iAm = usObj.user,
		login = data && data.login,
		itsMe = iAm.login === login,
		itsOnline;

	if (!_.isObject(data) || !login || data.role < 0 || data.role > 11) {
		return cb({message: msg.badParams, error: true});
	}

	if (itsMe && iAm.role !== data.role) {
		return cb({message: 'Administrators can not change their role :)', error: true});
	}

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this(null, user);
			} else {
				User.findOne({login: login}).populate('mod_regions', {_id: 0, cid: 1}).exec(this);
			}
		},
		function (err, user) {
			if (err || !user) {
				return cb({message: err && err.message || msg.nouser, error: true});
			}

			if (!itsMe) {
				if (user.role < 11 && data.role === 11) {
					return cb({message: 'The role of the super admin can not be assigned through the user management interface', error: true});
				}
				if (iAm.role === 10 && user.role < 10 && data.role > 9) {
					return cb({message: 'Only super administrators can assign other administrators', error: true});
				}
			}
			var existsRegions;

			if (data.role === 5 && data.regions) {
				existsRegions = [];
				user.mod_regions.forEach(function (item) {
					existsRegions.push(item.cid);
				});
				if (!_.isEqual(data.regions, existsRegions)) {
					regionController.setUserRegions(login, data.regions, 'mod_regions', function (err) {
						if (err) {
							return cb({message: err.message, error: true});
						}
						if (itsOnline) {
							_session.regetUser(user, false, null, function (err) {
								if (err) {
									return cb({message: err.message, error: true});
								}
								further();
							});
						} else {
							further();
						}
					});
				} else {
					further();
				}
			} else {
				further();
			}

			function further() {
				if (user.role !== data.role) {
					user.role = data.role || undefined;
					if (data.role !== 5) {
						user.mod_regions = undefined;
					}
				}

				user.save(function (err, savedUser) {
					if (err) {
						return cb({message: err.message, error: true});
					}

					if (itsOnline) {
						_session.emitUser(login);
					}
					cb({message: 'ok', saved: true});
				});
			}
		}
	);
}


module.exports.loadController = function (app, db, io) {

	Settings = db.model('Settings');
	Counter = db.model('Counter');
	User = db.model('User');
	News = db.model('News');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('saveNews', function (data) {
			if (!hs.usObj.isAdmin) {
				return result ({message: msg.deny, error: true});
			}
			if (data.cid) {
				saveNews(hs.usObj.user, data, result);
			} else {
				createNews(hs.usObj.user, data, result);
			}
			function result (resultData) {
				socket.emit('saveNewsResult', resultData);
			}
		});

		socket.on('getOnlineStat', function () {
			getOnlineStat(hs.usObj, function (err, resultData) {
				socket.emit('takeOnlineStat', resultData);
			});
		});
		socket.on('saveUserCredentials', function (data) {
			saveUserCredentials(hs.usObj, data, function (resultData) {
				socket.emit('saveUserCredentialsResult', resultData);
			});
		});
	});

};