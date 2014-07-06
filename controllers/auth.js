'use strict';

var fs = require('fs'),
	path = require('path'),
	jade = require('jade'),
	_session = require('./_session.js'),
	User,
	Counter,
	UserConfirm,
	step = require('step'),
	mailController = require('./mail.js'),
	settings = require('./settings.js'),
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
	recallTpl,

	msg = {
		deny: 'You do not have permission for this action'
	},
	regionController = require('./region.js');

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
			_session.authUser(socket, user, data, function (err, session, userPlain) {
				if (err) {
					cb(session, {message: err.message, error: true});
				} else {
					cb(session, {message: "Success login", youAre: userPlain});
				}
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

	User.findOne({$or: [
		{login: new RegExp('^' + data.login + '$', 'i')},
		{email: data.email}
	]}, function (err, user) {
		if (err) {
			return cb({message: err, error: true});
		}
		if (user) {
			if (user.login.toLowerCase() === data.login.toLowerCase()) {
				error += 'Пользователь с таким именем уже зарегистрирован. '; //'User with such login already exists. '
			}
			if (user.email === data.email) {
				error += 'Пользователь с таким email уже зарегистрирован.'; //'User with such email already exists.'
			}
			return cb({message: error, error: true});
		}

		step(
			function () {
				Counter.increment('user', this);
			},
			function createUser(err, count) {
				if (err || !count) {
					return cb({message: err && err.message || 'Increment user counter error', error: true});
				}
				var regionHome = regionController.getRegionsArrFromCache([3]);
				if (regionHome.length) {
					regionHome = regionHome[0]._id;
				}

				new User({
					login: data.login,
					cid: count.next,
					email: data.email,
					pass: data.pass,
					disp: data.login,
					regionHome: regionHome || undefined, //Домашним регионом пока делаем всем Москву
					settings: {
						//Пустой объект settings не сохранится, заполняем его одной из настроек
						subscr_auto_reply: settings.getUserSettingsDef().subscr_auto_reply || true
					}
				}).save(this);
			},
			function (err, user) {
				if (err || !user) {
					return cb({message: err && err.message || 'User save error', error: true});
				}
				confirmKey = Utils.randomString(7);
				new UserConfirm({key: confirmKey, user: user._id}).save(this);
			},

			function finish(err) {
				if (err) {
					User.remove({login: data.login});
					return cb({message: err.message, error: true});
				}
				cb({message: success});

				mailController.send(
					{
						sender: 'noreply',
						receiver: {alias: data.login, email: data.email},
						subject: 'Подтверждение регистрации',
						head: true,
						body: regTpl({
							username: data.login,
							greeting: 'Спасибо за регистрацию на проекте PastVu!',
							addr: appEnv.serverAddr,
							data: data,
							confirmKey: confirmKey,
							linkvalid: moment.duration(ms('2d')).humanize() + ' (до ' + moment().utc().lang('ru').add(ms('2d')).format("LLL") + ')'
						})
					}
				);
			}
		);
	});
}

//Отправка на почту запроса на восстановление пароля
function recall(session, data, cb) {
	var success = 'Запрос успешно отправлен. Для продолжения процедуры следуйте инструкциям, высланным на Ваш e-mail', //success = 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail',
		confirmKey = '';

	if (!Utils.isType('object', data) || !data.login) {
		return cb({message: 'Bad params', error: true});
	}

	step(
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
			data.disp = user.disp;
			confirmKey = Utils.randomString(8);
			UserConfirm.remove({user: user._id}, this);
		},
		function (err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			new UserConfirm({key: confirmKey, user: data._id}).save(this);
		},
		function finish(err) {
			if (err) {
				return cb({message: err.message, error: true});
			}
			cb({message: success});

			mailController.send(
				{
					sender: 'noreply',
					receiver: {alias: data.login, email: data.email},
					subject: 'Запрос на восстановление пароля',
					head: true,
					body: recallTpl({
						username: data.disp,
						addr: appEnv.serverAddr,
						data: data,
						confirmKey: confirmKey,
						linkvalid: moment.duration(ms('2d')).humanize() + ' (до ' + moment().utc().lang('ru').add(ms('2d')).format("LLL") + ')'
					})
				}
			);
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
		step(
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
			step(
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
	User = db.model('User');
	Counter = db.model('Counter');
	UserConfirm = db.model('UserConfirm');

	fs.readFile(path.normalize('./views/mail/registration.jade'), 'utf-8', function (err, data) {
		if (err) {
			return logger.error('Notice jade read error: ' + err.message);
		}
		regTpl = jade.compile(data, {filename: path.normalize('./views/mail/registration.jade'), pretty: false});
	});
	fs.readFile(path.normalize('./views/mail/recall.jade'), 'utf-8', function (err, data) {
		if (err) {
			return logger.error('Notice jade read error: ' + err.message);
		}
		recallTpl = jade.compile(data, {filename: path.normalize('./views/mail/recall.jade'), pretty: false});
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

		socket.on('whoAmI', function () {
			socket.emit('youAre', (hs.usObj.user && hs.usObj.user.toObject ? hs.usObj.user.toObject() : null));
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