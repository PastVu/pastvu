'use strict';

var fs = require('fs'),
	path = require('path'),
	jade = require('jade'),
	_session = require('./_session.js'),
	Session,
	User,
	Counter,
	UserConfirm,
	Step = require('step'),
	Mail = require('./mail.js'),
	mailController = require('./mail.js'),
	Utils = require('../commons/Utils.js'),
	log4js = require('log4js'),
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	subdl = global.appVar.serverAddr.subdomains.length,
	preaddrs = global.appVar.serverAddr.subdomains.map(function (sub) {
		return 'http://' + sub + '.' + global.appVar.serverAddr.host;
	}),
	appEnv = {},
	app,
	io,

	regTpl,

	msg = {
		deny: 'You do not have permission for this action'
	};

var logger = log4js.getLogger("auth.js");
moment.lang('ru');

//Вход в систему
function login(socket, data, cb) {
	var error = '',
		session = socket.handshake.session;

	if (!data.login) {
		error += 'Fill in the login field. ';
	}
	if (!data.pass) {
		error += 'Fill in the password field.';
	}
	if (error) {
		return cb(null, {message: error, error: true});
	}

	User.getAuthenticated(data.login, data.pass, function (err, user, reason) {
		if (err) {
			return cb(null, {message: err && err.message, error: true});
		}

		//Если есть пользователь, значит проверка успешна
		if (user) {
			//Передаем пользователя в сессию
			_session.authUser(socket, user, data, function (err, session) {
				//Важно взять юзера из сессии, так как, во-первых, в сессии он будет спопулирован при присвоении заново,
				//а, во-вторых, его объект мог взяться из существующего в хеше, если пользователь уже залогинен в другом браузере
				cb(session, {message: "Success login", youAre: session.user.toObject()});
			});
		} else {
			switch (reason) {
			case User.failedLogin.NOT_FOUND:
			case User.failedLogin.PASSWORD_INCORRECT:
				// note: these cases are usually treated the same - don't tell the user *why* the login failed, only that it did
				cb(null, {message: 'Неправильная пара логин-пароль', error: true});
				break;
			case User.failedLogin.MAX_ATTEMPTS:
				// send email or otherwise notify user that account is temporarily locked
				cb(null, {message: 'Your account has been temporarily locked due to exceeding the number of wrong login attempts', error: true});
				break;
			}
		}
	});
}

//Регистрация
function register(session, data, cb) {
	var error = '',
		success = 'Учетная запись создана успешно. Для завершения регистрации следуйте инструкциям, отправленным на указанный вами e-mail', //'Account has been successfully created. To confirm registration, follow the instructions sent to Your e-mail',
		confirmKey = '';
	data.email = data.email.toLowerCase();

	if (!data.login) {
		error += 'Заполните имя пользователя. '; //'Fill in the login field. '
	} else {
		if (!data.login.match(/^[\.\w-]{3,15}$/i) || !data.login.match(/^[A-za-z].*$/i) || !data.login.match(/^.*\w$/i)) {
			error += 'Имя пользователя должно содержать от 3 до 15 латинских символов и начинаться с буквы. В состав слова могут входить цифры, точка, подчеркивание и тире. ';
		}
	}
	if (!data.email) {
		error += 'Fill in the e-mail field. ';
	}
	if (!data.pass) {
		error += 'Fill in the password field. ';
	}
	if (data.pass !== data.pass2) {
		error += 'Пароли не совпадают.';
	}
	if (error) {
		return cb({message: error, error: true});
	}

	Step(
		function checkUserExists() {
			User.findOne({$or: [
				{login: new RegExp('^' + data.login + '$', 'i')},
				{email: data.email}
			]}, this);
		},
		function incrementCounter(err, user) {
			if (user) {
				if (user.login.toLowerCase() === data.login.toLowerCase()) {
					error += 'Пользователь с таким именем уже зарегистрирован. '; //'User with such login already exists. '
				}
				if (user.email === data.email) {
					error += 'Пользователь с таким email уже зарегистрирован.'; //'User with such email already exists.'
				}
				return cb({message: error, error: true});
			}
			Counter.increment('user', this.parallel());
		},
		function createUser(err, count) {
			if (err) {
				return cb({message: err, error: true});
			}
			if (!count) {
				return cb({message: 'Increment user counter error', error: true});
			}
			confirmKey = Utils.randomString(7);

			var newUser = new User({
				login: data.login,
				cid: count.next,
				email: data.email,
				pass: data.pass,
				disp: data.login
			});

			newUser.save(this.parallel());
			UserConfirm.remove({user: newUser._id}, this.parallel());
		},
		function sendMail(err, user) {
			if (err) {
				return cb({message: err.message, error: true});
			}

			new UserConfirm({key: confirmKey, user: user._id}).save(this.parallel());

			var expireOn = moment().lang('ru');
			expireOn.add(ms('2d'));

			mailController.send2(
				{
					sender: 'noreply',
					receiver: {alias: data.login, email: data.email},
					subject: 'Подтверждение регистрации',
					body: regTpl({
						username: data.login,
						greeting: 'Спасибо за регистрацию на проекте PastVu!',
						addr: appEnv.serverAddr,
						data: data,
						confirmKey: confirmKey,
						linkvalid: moment.duration(ms('2d')).humanize() + ' (до ' + expireOn.format("LLL") + ')'
					}),
					attachments: [
						{
							fileName: 'logo.png',
							contents: new Buffer('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', 'base64'),
							cid: 'pastvulogo' // should be as unique as possible
						}
					]
				},
				this.parallel()
			);
		},

		function finish(err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb({message: success});
		}
	);
}

//Отправка на почту запроса на восстановление пароля
function recall(session, data, cb) {
	var success = 'Запрос успешно отправлен. Для продолжения процедуры следуйте инструкциям, высланным на Ваш e-mail', //success = 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail',
		confirmKey = '';

	if (!Utils.isType('object', data) || !data.login) {
		return cb({message: 'Bad params', error: true});
	}

	Step(
		function checkUserExists() {
			User.findOne({$or: [
				{ login: new RegExp('^' + data.login + '$', 'i') },
				{ email: data.login.toLowerCase() }
			]}).exec(this);
		},
		function (err, user) {
			if (err || !user) {
				return cb({message: err && err.message || 'Пользователя с таким логином или e-mail не существует', error: true}); //'User with such login or e-mail does not exist'
			}
			var iAm = session.user;

			//Если залогинен и пытается восстановить не свой аккаунт, то проверяем что это админ
			if (iAm && iAm.login !== data.login && (!iAm.role || iAm.role < 10)) {
				return cb({message: msg.deny, error: true});
			}

			data._id = user._id;
			data.login = user.login;
			data.email = user.email;
			confirmKey = Utils.randomString(8);
			UserConfirm.remove({user: user._id}, this);
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			new UserConfirm({key: confirmKey, user: data._id}).save(this);
		},
		function sendMail(err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			var expireOn = moment().lang('ru');
			expireOn.add(ms('2d'));
			Mail.send({
				from: 'PastVu ★<noreply@pastvu.com>',
				to: data.login + ' <' + data.email + '>',
				subject: 'Запрос на восстановление пароля', //'Request for password recovery',
				headers: {
					'X-Laziness-level': 1000
				},
				generateTextFromHTML: true,
				html: 'Здравствуйте, <b>' + data.login + '</b>!<br/><br/>' +
					'Для Вашей учетной записи был создан запрос на восстановление пароля на проекте PastVu. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.<br/><br/>' +
					'Для ввода нового пароля перейдите по следующей ссылке:<br/>' +
					'<a href="' + appEnv.serverAddr.protocol + '://' + appEnv.serverAddr.host + '/confirm/' + confirmKey + '" target="_blank">' + appEnv.serverAddr.host + '/confirm/' + confirmKey + '</a><br/>' +
					'<small>Ссылка действительна ' + moment.duration(ms('2d')).humanize() + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо запрашивать смену пароля повторно</small>'
			}, this);
		},
		function finish(err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb({message: success});
		}
	);
}

//Смена пароля по запросу восстановлния из почты
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
		return cb({message: error, error: true});
	}

	UserConfirm.findOne({key: key}).populate('user').exec(function (err, confirm) {
		if (err || !confirm || !confirm.user) {
			return cb({message: err && err.message || 'Get confirm error', error: true});
		}
		Step(
			function () {
				// Если залогиненный пользователь запрашивает восстановление, то пароль надо поменять в модели пользователя сессии
				// Если аноним - то в модели пользователи конфирма
				// (Это один и тот же пользователь, просто разные объекты)
				var user = session.user && session.user.login === confirm.user.login ? session.user : confirm.user;
				user.pass = data.pass;

				//Если неактивный пользователь восстанавливает пароль - активируем его
				if (!user.active) {
					user.active = true;
					user.activatedate = new Date();
				}

				user.save(this.parallel());
				confirm.remove(this.parallel());
			},
			function (err) {
				if (err) {
					return cb({message: err.message, error: true});
				}

				cb({message: 'Новый пароль сохранен успешно'});
			}
		);
	});
}

//Смена пароля в настройках пользователя с указанием текущего пароля
function passChange(session, data, cb) {
	var error = '';

	if (!session.user || !data || session.user.login !== data.login) {
		return cb({message: 'Вы не авторизованны для этой операции', error: true}); //'You are not authorized for this action'
	}
	if (!data.pass || !data.passNew || !data.passNew2) {
		error += 'Заполните все поля. '; //'Fill in all password fields. ';
	}
	if (data.passNew !== data.passNew2) {
		error += 'Новые пароли не совпадают. '; //'New passwords do not match each other.';
	}
	if (error) {
		return cb({message: error, error: true});
	}

	session.user.checkPass(data.pass, function (err, isMatch) {
		if (err) {
			return cb({message: err.message, error: true});
		}

		if (isMatch) {
			session.user.pass = data.passNew;
			session.user.save(function (err) {
				if (err) {
					return cb({message: err && err.message || 'Save error', error: true});
				}
				cb({message: 'Новый пароль установлен успешно'}); //'Password was changed successfully!'
			});
		} else {
			cb({message: 'Текущий пароль не верен', error: true}); //'Current password incorrect'
		}
	});
}

//Проверка ключа confirm
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
		var user = confirm.user,
			avatar;

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
			if (user.avatar) {
				if (subdl) {
					avatar = preaddrs[0] + '/_a/h/' + user.avatar;
				} else {
					avatar = '/_a/h/' + user.avatar;
				}
			} else {
				avatar = '/img/caps/avatarth.png';
			}
			cb({message: 'Pass change', type: 'authPassChange', login: user.login, disp: user.disp, avatar: avatar});
		}

	});
}

module.exports.loadController = function (a, db, io) {
	app = a;
	appEnv = app.get('appEnv');
	Session = db.model('Session');
	User = db.model('User');
	Counter = db.model('Counter');
	UserConfirm = db.model('UserConfirm');

	fs.readFile(path.normalize('./views/mail/registration.jade'), 'utf-8', function (err, data) {
		if (err) {
			return logger.error('Notice jade read error: ' + err.message);
		}
		regTpl = jade.compile(data, {filename: path.normalize('./views/mail/registration.jade'), pretty: false});
	});

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

		socket.on('logoutRequest', function () {
			_session.destroy(socket, function (err) {
				socket.emit('logoutCommand', {message: (err && err.message) || '', error: !!err});
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
			passChange(hs.session, data, function (data) {
				socket.emit('passChangeResult', data);
			});
		});

		socket.on('whoAmI', function (data) {
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