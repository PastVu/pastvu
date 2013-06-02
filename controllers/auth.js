var _session = require('./_session.js'),
	Session,
	User,
	Role,
	Counter,
	UserConfirm,
	Step = require('step'),
	Mail = require('./mail.js'),
	errS = require('./errors.js').err,
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	appEnv = {},
	app,
	io;

var logger = log4js.getLogger("auth.js");
moment.lang('ru');

function login(socket, data, cb) {
	'use strict';
	var error = '';

	if (!data.login) error += 'Fill in the login field. ';
	if (!data.pass) error += 'Fill in the password field.';
	if (error) {
		cb(null, {message: error, error: true});
		return;
	}

	User.getAuthenticated(data.login, data.pass, function (err, user, reason) {
		if (err) {
			cb(null, {message: err && err.message, error: true});
			return;
		}

		// login was successful if we have a user
		if (user) {
			socket.handshake.session.key = Utils.randomString(12);
			socket.handshake.session.user = user;
			socket.handshake.session.data = {remember: data.remember};
			socket.handshake.session.stamp = new Date();
			socket.handshake.session.save(function (err, session) {
				Session.findOne({key: session.key}).populate('user').exec(function (err, session) {
					socket.handshake.session = session;
					_session.emitCookie(socket);
					cb(session, {message: "Success login", youAre: session.user});
				});
			});
			return;
		}

		switch (reason) {
		case User.failedLogin.NOT_FOUND:
		case User.failedLogin.PASSWORD_INCORRECT:
			// note: these cases are usually treated the same - don't tell the user *why* the login failed, only that it did
			cb(null, {message: 'Login or password incorrect', error: true});
			break;
		case User.failedLogin.MAX_ATTEMPTS:
			// send email or otherwise notify user that account is temporarily locked
			cb(null, {message: 'Your account has been temporarily locked due to exceeding the number of wrong login attempts', error: true});
			break;
		}
	});
}

function register(session, data, cb) {
	'use strict';
	var error = '',
		success = 'Учетная запись создана успешно. Для завершения регистрации следуйте инструкциям, отправленным на указанный вами e-mail',
	//success = 'Account has been successfully created. To confirm registration, follow the instructions sent to Your e-mail',
		confirmKey = '';
	data.email = data.email.toLowerCase();

	if (!data.login) error += 'Fill in the login field. ';
	if (!data.email) error += 'Fill in the e-mail field. ';
	if (!data.pass) error += 'Fill in the password field. ';
	if (data.pass !== data.pass2) error += 'Passwords do not match.';
	if (error) {
		cb({message: error, error: true});
		return;
	}

	Step(
		function checkUserExists() {
			User.findOne({ $or: [
				{ login: new RegExp('^' + data.login + '$', 'i') },
				{ email: data.email }
			] }, this);
		},
		function incrementCounter(err, user) {
			if (user) {
				if (user.login.toLowerCase() === data.login.toLowerCase()) {
					error += 'User with such login already exists. ';
				}
				if (user.email === data.email) {
					error += 'User with such email already exists.';
				}
				cb({message: error, error: true});
				return;
			}
			Counter.increment('user', this.parallel());
			Role.findOne({name: 'registered'}, this.parallel());
		},
		function createUser(err, count, role) {
			if (err) {
				cb({message: err, error: true});
				return;
			}
			if (!count) {
				cb({message: 'Increment user counter error', error: true});
				return;
			}
			confirmKey = Utils.randomString(7);

			var newUser = new User({
				login: data.login,
				cid: count.next,
				email: data.email,
				pass: data.pass,
				roles: [role._id]
			});

			newUser.save(this.parallel());
			UserConfirm.remove({user: newUser._id}, this.parallel());
		},
		function sendMail(err, user) {
			if (err) {
				cb({message: err.message, error: true});
				return;
			}

			new UserConfirm({key: confirmKey, user: user._id}).save(this.parallel());

			var expireOn = moment().lang('ru');
			expireOn.add(ms('2d'));

			Mail.send({
				from: 'OldMos ★<confirm@oldmos2.ru>',
				to: data.login + ' <' + data.email + '>',
				subject: 'Registration confirm', //
				headers: {
					'X-Laziness-level': 1000
				},
				generateTextFromHTML: true,
				html: 'Здравствуйте, ' + data.login + '!<br/><br/>' +
					'Спасибо за регистрацию на проекте OldMos! ' +
					'Вы указали следующие реквизиты:<br/>' +
					'Логин: <b>' + data.login + '</b><br/>' +
					'E-mail: <b>' + data.email + '</b><br/><br/>' +
					'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.<br/><br/>' +
					'Для активации Вашего аккаунта, пройдите по следующей ссылке:<br/>' +
					'<a href="http://' + appEnv.serverAddr.host + '/confirm/' + confirmKey + '" target="_blank">http://' + appEnv.serverAddr.host + '/confirm/' + confirmKey + '</a><br/>' +
					'<small>Ссылка действительна ' + moment.duration(ms('2d')).humanize() + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо зарегистрироваться повторно</small><br/>' +
					'<br/><small>Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.</small>'
			}, this.parallel());
		},

		function finish(err) {
			if (err) {
				cb({message: err.message, error: true});
				return;
			}
			cb({message: success});
		}
	);
}

function recall(session, data, cb) {
	var success = 'Запрос успешно отправлен. Для продолжения процедуры следуйте инструкциям, высланным на Ваш e-mail',
	//success = 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail',
		confirmKey = '';

	if (!data.login) {
		cb({message: 'Введите логин или e-mail', error: true});
		//cb({message: 'Fill in login or e-mail', error: true});
		return;
	}

	Step(
		function checkUserExists() {
			User.findOne().or([
				{login: new RegExp('^' + data.login + '$', 'i')},
				{email: data.login.toLowerCase()}
			]).where('active', true).exec(this);
		},
		function (err, user) {
			if (err || !user) {
				cb({message: err && err.message || 'Пользователя с таким логином или e-mail не существует', error: true});
				//cb({message: err && err.message || 'User with such login or e-mail does not exist', error: true});
				return;
			}

			data._id = user._id;
			data.login = user.login;
			data.email = user.email;
			confirmKey = Utils.randomString(8);
			UserConfirm.remove({user: user._id}, this);
		},
		function (err) {
			if (err) {
				cb({message: (err && err.message) || '', error: true});
				return;
			}
			new UserConfirm({key: confirmKey, user: data._id}).save(this);
		},
		function sendMail(err) {
			if (err) {
				cb({message: (err && err.message) || '', error: true});
				return;
			}
			var expireOn = moment().lang('ru');
			expireOn.add(ms('2d'));
			Mail.send({
				from: 'OldMos ★<confirm@oldmos2.ru>',
				to: data.login + ' <' + data.email + '>',
				subject: 'Запрос на восстановление пароля',
				//subject: 'Request for password recovery',
				headers: {
					'X-Laziness-level': 1000
				},
				generateTextFromHTML: true,
				html: 'Здравствуйте, <b>' + data.login + '</b>!<br/><br/>' +
					'Для Вашей учетной записи был создан запрос на восстановление пароля на проекте OldMos. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.<br/><br/>' +
					'Для ввода нового пароля перейдите по следующей ссылке:<br/>' +
					'<a href="http://' + appEnv.serverAddr.host + '/confirm/' + confirmKey + '" target="_blank">http://' + appEnv.serverAddr.host + '/confirm/' + confirmKey + '</a><br/>' +
					'<small>Ссылка действительна ' + moment.duration(ms('2d')).humanize() + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо запрашивать смену пароля повторно</small>'
			}, this);
		},
		function finish(err) {
			if (err) {
				cb({message: err.message, error: true});
				return;
			}
			cb({message: success});
		}
	);
}

function passChangeRecall(session, data, cb) {
	var error = '',
		key = data.key;
	if (!data || !Utils.isType('string', key) || key.length !== 8) {
		error = 'Bad params. ';
	}
	if (!data.pass) {
		error += 'Fill in the password field. ';
	}
	if (data.pass !== data.pass2) {
		error += 'Passwords do not match.';
	}
	if (error) {
		cb({message: error, error: true});
		return;
	}

	UserConfirm.findOne({key: key}).populate('user').exec(function (err, confirm) {
		if (err || !confirm || !confirm.user) {
			cb({message: err && err.message || 'Get confirm error', error: true});
			return;
		}
		Step(
			function () {
				// Если залогиненный пользователь запрашивает восстановление, то пароль надо поменять в модели пользователя сессии
				// Если аноним - то в модели пользователи конфирма
				// (Это один и тот же пользователь, просто разные объекты)
				var user = session.user && session.user.login === confirm.user.login ? session.user : confirm.user;
				user.pass = data.pass;
				user.save(this.parallel());
				confirm.remove(this.parallel());
			},
			function (err) {
				if (err) {
					cb({message: err.message, error: true});
					return;
				}

				cb({message: 'Новый пароль сохранен успешно'});
			}
		);
	});
}

function passchange(session, data, cb) {
	'use strict';
	var error = '';

	if (!session.user || !data || session.user.login !== data.login) {
		cb({message: 'Вы не авторизованны для этой операции', error: true}); //'You are not authorized for this action'
		return;
	}
	if (!data.pass || !data.passNew || !data.passNew2) error += 'Заполните все поля. '; //'Fill in all password fields. ';
	if (data.passNew !== data.passNew2) error += 'Новые пароли не совпадают. '; //'New passwords do not match each other.';
	if (error) {
		cb({message: error, error: true});
		return;
	}

	session.user.checkPass(data.pass, function (err, isMatch) {
		if (err) {
			cb({message: err.message, error: true});
			return;
		}

		if (isMatch) {
			session.user.pass = data.passNew;
			session.user.save(function (err) {
				if (err) {
					cb({message: err && err.message || 'Save error', error: true});
					return;
				}
				cb({message: 'Новый пароль установлен успешно'}); //'Password was changed successfully!'
			});
		} else {
			cb({message: 'Текущий пароль не верен', error: true}); //'Current password incorrect'
		}
	});
}

function checkConfirm(session, data, cb) {
	if (!data || !Utils.isType('string', data.key) || data.key.length < 7 || data.key.length > 8) {
		cb({message: 'Bad params', error: true});
		return;
	}

	var key = data.key;
	UserConfirm.findOne({key: key}).populate('user').exec(function (err, confirm) {
		if (err || !confirm || !confirm.user) {
			cb({message: err && err.message || 'Get confirm error', error: true});
			return;
		}
		var user = confirm.user;

		if (key.length === 7) { //Confirm registration
			Step(
				function () {
					user.active = true;
					user.activatedate = new Date();
					user.save(this.parallel());
					confirm.remove(this.parallel());
				},
				function (err) {
					if (err) {
						cb({message: err.message, error: true});
						return;
					}

					cb({message: 'Спасибо, регистрация подтверждена! Теперь вы можете войти в систему, используя ваш логин и пароль', type: 'noty'});
					//cb({message: 'Thank you! Your registration is confirmed. Now you can enter using your username and password', type: 'noty'});
				}
			);
		} else if (key.length === 8) { //Confirm pass change
			cb({message: 'Pass change', type: 'authPassChange', login: user.login, name: ((user.firstName && (user.firstName + ' ') || '') + (user.lastName || '')) || '', avatar: user.avatar ? '/_avatar/h/' + user.avatar : '/img/caps/avatarth.png'});
		}

	});
}

/**
 * redirect to /login if user has insufficient rights
 * @param role_level
 */
function restrictToRoleLevel(role_level) {
	return function (req, res, next) {
		var user = req.session.neoStore.user;
		if (req.session.login &&
			req.session.neoStore && req.session.neoStore.roles &&
			req.session.neoStore.roles[0]['level'] >= role_level) {
			next();
		} else {
			throw new errS.e404();

			/*var url = '/login';
			 if (req.xhr) {
			 url = {redirect: url};
			 res.send(url, 403);
			 } else {
			 req.sessionStore.cameFrom = req.url;
			 res.redirect(url);
			 }*/
		}
	}
}
module.exports.restrictToRoleLevel = restrictToRoleLevel;
module.exports.sendMe = function (socket) {
	var user = socket && socket.handshake && socket.handshake.session && socket.handshake.session.user;
	if (user) {
		socket.emit('youAre', user);
	}
};

module.exports.loadController = function (a, db, io) {
	app = a;
	appEnv = app.get('appEnv');
	Session = db.model('Session');
	User = db.model('User');
	Role = db.model('Role');
	Counter = db.model('Counter');
	UserConfirm = db.model('UserConfirm');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('loginRequest', function (json) {
			login(socket, json, function (newSession, data) {
				if (newSession) {
					hs.session = newSession;
				}
				socket.emit('loginResult', data);
			});
		});

		socket.on('logoutRequest', function (data) {
			_session.destroy(hs.session, function (err) {
				socket.emit('logoutResult', {message: (err && err.message) || '', error: !!err, logoutPath: '/'});
			});
		});

		socket.on('registerRequest', function (data) {
			register(hs.session, data, function (data) {
				socket.emit('registerResult', data);
			});
		});

		socket.on('recallRequest', function (data) {
			recall(hs.session, data, function (data) {
				socket.emit('recallResult', data);
			});
		});

		socket.on('passChangeRequest', function (data) {
			passchange(hs.session, data, function (data) {
				socket.emit('passChangeResult', data);
			});
		});

		socket.on('whoAmI', function (data) {
			if (hs.session.user && hs.session.roles) {
				//hs.session.user.role_level = hs.session.roles[0]['level'];
				//hs.session.user.role_name = hs.session.roles[0]['name'];
			}
			socket.emit('youAre', (hs.session.user && hs.session.user.toObject ? hs.session.user.toObject() : null));
		});

		socket.on('checkConfirm', function (data) {
			checkConfirm(hs.session, data, function (data) {
				socket.emit('checkConfirmResult', data);
			});
		});
		socket.on('passChangeRecall', function (data) {
			passChangeRecall(hs.session, data, function (data) {
				socket.emit('passChangeRecallResult', data);
			});
		});
	});
};