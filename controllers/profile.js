'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
	fs = require('fs'),
	Settings,
	User,
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	log4js = require('log4js'),
	_ = require('lodash'),
	logger,
	incomeDir = global.appVar.storePath + 'incoming/',
	privateDir = global.appVar.storePath + 'private/avatar/',
	publicDir = global.appVar.storePath + 'public/avatar/',
	msg = {
		deny: 'You do not have permission for this action'
	};

//Сохраняем изменения в профиле пользователя
function saveUser(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		login = data && data.login,
		itsMe,
		itsOnline,
		newValues;

	if (!iAm) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login) {
		return cb({message: 'Bad params', error: true});
	}
	itsMe = iAm.login === login;

	if (!itsMe && iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this(null, user);
			} else {
				User.findOne({login: login}, this);
			}
		},
		function (err, user) {
			if (err && !user) {
				return cb({message: err.message || 'Requested user does not exist', error: true});
			}

			//Новые значения действительно изменяемых свойств
			newValues = Utils.diff(_.pick(data, 'firstName', 'lastName', 'birthdate', 'sex', 'country', 'city', 'work', 'www', 'icq', 'skype', 'aim', 'lj', 'flickr', 'blogger', 'aboutme'), user.toObject());
			if (_.isEmpty(newValues)) {
				return cb({message: 'Nothing to save'});
			}
			if (user.disp && user.disp !== user.login && (newValues.firstName || newValues.lastName)) {
				var f = newValues.firstName || user.firstName || '',
					l = newValues.lastName || user.lastName || '';

				user.disp = f + (f && l ? ' ' : '') + l;
			}

			_.assign(user, newValues);
			user.save(this);
		},
		function (err, user) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (itsOnline) {
				_session.emitUser(user.login);
			}

			cb({message: 'ok', saved: 1});
		}
	);
}

//Меняем отображаемое имя
function changeDispName(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		login = data && data.login,
		itsMe = (iAm && iAm.login) === login,
		itsOnline;

	if (!iAm || !itsMe && iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login) {
		return cb({message: 'Bad params', error: true});
	}

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this(null, user);
			} else {
				User.findOne({login: login}, this);
			}
		},
		function (err, user) {
			if (err && !user) {
				return cb({message: err.message || 'Requested user does not exist', error: true});
			}

			if (!!data.showName) {
				var f = user.firstName || '',
					l = user.lastName || '';
				user.disp = (f + (f && l ? ' ' : '') + l) || user.login;
			} else {
				user.disp = user.login;
			}

			user.save(this);
		},
		function (err, user) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (itsOnline) {
				_session.emitUser(user.login);
			}
			cb({message: 'ok', saved: 1, disp: user.disp});
		}
	);
}

//Меняем email
function changeEmail(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		user,
		login = data && data.login,
		itsMe = (iAm && iAm.login) === login,
		itsOnline;

	if (!iAm || !itsMe && iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login || !data.email) {
		return cb({message: 'Bad params', error: true});
	}
	data.email = data.email.toLowerCase();
	if (!data.email.match(/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)) {
		return cb({message: 'Недействительный email. Проверьте корректность ввода.', error: true});
	}

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this(null, user);
			} else {
				User.findOne({login: login}, this);
			}
		},
		function (err, u) {
			if (err && !u) {
				return cb({message: err.message || 'Requested user does not exist', error: true});
			}
			user = u;
			User.findOne({email: data.email}, {_id: 0, login: 1}, this);
		},
		function (err, u) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (u && u.login !== user.login) {
				return cb({message: 'Такой email уже используется другим пользователем', error: true});
			}

			if (data.pass) {
				iAm.checkPass(data.pass, function (err, isMatch) {
					if (err) {
						return cb({message: err.message, error: true});
					}
					if (isMatch) {
						saveEmail();
					} else {
						cb({message: 'Неверный пароль', error: true});
					}
				});
			} else {
				cb({confirm: 'pass'});
			}
		}
	);

	function saveEmail() {
		user.email = data.email;
		user.save(function (err, savedUser) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (itsOnline) {
				_session.emitUser(user.login);
			}
			cb({message: 'ok', email: savedUser.email});
		});
	}
}

//Меняем аватар
function changeAvatar(socket, data, cb) {
	var iAm = socket.handshake.session.user,
		user,
		login = data && data.login,
		itsMe = (iAm && iAm.login) === login,
		itsOnline,
		file,
		fullfile;

	if (!iAm || !itsMe && iAm.role < 10) {
		return cb({message: msg.deny, error: true});
	}
	if (!Utils.isType('object', data) || !login || data.file) {
		return cb({message: 'Bad params', error: true});
	}

	file = data.file;
	fullfile = file.replace(/((.)(.))/, "$2/$3/$1");

	step(
		function () {
			var user = _session.getOnline(login);
			if (user) {
				itsOnline = true;
				this(null, user);
			} else {
				User.findOne({login: login}, this);
			}
		},
		function (err, u) {
			if (err && !u) {
				return cb({message: err.message || 'Requested user does not exist', error: true});
			}
			user = u;
			fs.rename(incomeDir + file, privateDir + fullfile, this); //Из incoming в private
		},
		function filesToPiblicFolder(err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			copyFile(privateDir + fullfile, publicDir + fullfile, this.parallel());
			//TODO: Конвертация в 50х50
		},
		function (err, user) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			if (itsOnline) {
				_session.emitUser(user.login);
			}
			cb({message: 'ok', saved: 1, disp: user.disp});
		}
	);
}

function copyFile(source, target, cb) {
	var cbCalled = false;

	var rd = fs.createReadStream(source);
	rd.on("error", function (err) {
		done(err);
	});

	var wr = fs.createWriteStream(target);
	wr.on("error", function (err) {
		done(err);
	});
	wr.on("close", function (ex) {
		done();
	});

	rd.pipe(wr);

	function done(err) {
		if (!cbCalled) {
			cb(err);
			cbCalled = true;
		}
	}
}


module.exports.loadController = function (app, db, io) {
	logger = log4js.getLogger("profile.js");

	Settings = db.model('Settings');
	User = db.model('User');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveUser', function (data) {
			User.getUserPublic(data.login, function (err, user) {
				socket.emit('takeUser', (user && user.toObject()) || {error: true, message: err && err.messagee});
			});
		});

		socket.on('saveUser', function (data) {
			saveUser(socket, data, function (resultData) {
				socket.emit('saveUserResult', resultData);
			});
		});

		socket.on('changeDispName', function (data) {
			changeDispName(socket, data, function (resultData) {
				socket.emit('changeDispNameResult', resultData);
			});
		});
		socket.on('changeEmail', function (data) {
			changeEmail(socket, data, function (resultData) {
				socket.emit('changeEmailResult', resultData);
			});
		});

		socket.on('changeAvatar', function (data) {
			changeAvatar(socket, data, function (resultData) {
				socket.emit('changeAvatarResult', resultData);
			});
		});
	});

};