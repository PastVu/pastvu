var _session = require('./_session.js'),
    Session,
    User,
    Role,
    UserConfirm,
    Step = require('step'),
    Mail = require('./mail.js'),
    errS = require('./errors.js').err,
    Utils = require('../commons/Utils.js'),
    log4js = require('log4js'),
    ms =  require('ms'), // Tiny milisecond conversion utility
    moment = require('moment'),
    app,
    io;

var logger = log4js.getLogger("auth.js");
moment.lang('ru');

function login(socket, data, cb) {
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
            socket.handshake.session.key = Utils.randomString(50);
            socket.handshake.session.user = user;
            socket.handshake.session.data = {remember: data.remember};
            socket.handshake.session.stamp = new Date();
            socket.handshake.session.save(function (err, session) {
                Session.findOne({key: session.key}).populate('user').exec(function (err, session) {
                    socket.handshake.session = session;
                    _session.emitCookie(socket);
                    cb(session, {message: "Success login"});
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
    var error = '',
        success = 'Account has been successfully created. To confirm registration, follow the instructions sent to Your e-mail',
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
            ] }, this.parallel());
            Role.findOne({name: 'registered'}, this.parallel());
        },
        function createUser(err, user, role) {
            if (user) {
                if (user.login.toLowerCase() === data.login.toLowerCase()) error += 'User with such login already exists. ';
                if (user.email === data.email) error += 'User with such email already exists.';

                cb({message: error, error: true});
                return;
            }

            confirmKey = Utils.randomString(80);

            logger.info(data.email);

            var newUser = new User({
                login: data.login,
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
                from: 'Oldmos2 <confirm@oldmos2.ru>',
                to: data.login + ' <' + data.email + '>',
                subject: 'Registration confirm', //
                headers: {
                    'X-Laziness-level': 1000
                },
                text: 'Привет, ' + data.login + '!' +
                    'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.' +
                    'При регистрации вы указали логин и пароль:' +
                    'Логин: ' + data.login +
                    'Пароль: ' + data.pass +
                    'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.' +
                    'Для активации Вашего аккаунта, пройдите по следующей ссылке:' +
                    'http://oldmos2.ru:3000/confirm/' + confirmKey + ' ' +
                    'Ссылка действительна ' + moment.humanizeDuration(ms('2d')) + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо зарегистрироваться повторно',
                html: 'Привет, <b>' + data.login + '</b>!<br/><br/>' +
                    'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.<br/><br/>' +
                    'При регистрации вы указали логин и пароль:<br/>' +
                    'Логин: <b>' + data.login + '</b><br/>' +
                    'Пароль: <b>' + data.pass + '</b><br/><br/>' +
                    'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.<br/><br/>' +
                    'Для активации Вашего аккаунта, пройдите по следующей ссылке:<br/>' +
                    '<a href="http://oldmos2.ru:3000/confirm/' + confirmKey + '" target="_blank">http://oldmos2.ru/confirm/' + confirmKey + '</a><br/>' +
                    'Ссылка действительна ' + moment.humanizeDuration(ms('2d')) + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо зарегистрироваться повторно'
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
    var error = '',
        success = 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail',
        confirmKey = '';

    if (!data.login) error += 'Fill in login or e-mail.';
    if (error) {
        cb({message: error, error: true});
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
                error += 'User with such login or e-mail does not exist';
                cb({message: error, error: true});
                return;
            } else {
                data._id = user._id;
                data.login = user.login;
                data.email = user.email;
                confirmKey = Utils.randomString(79);
                UserConfirm.remove({user: user._id}, this);
            }
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
                from: 'Oldmos2 <confirm@oldmos2.ru>',
                to: data.login + ' <' + data.email + '>',
                subject: 'Request for password recovery',
                headers: {
                    'X-Laziness-level': 1000
                },

                text: 'Привет, ' + data.login + '!' +
                    'Вы получили это письмо, так как для Вашей учетной записи был создан запрос на восстановление пароля на проекте oldmos2.ru. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.' +
                    'Для получения нового пароля перейдите по следующей ссылке:' +
                    'http://oldmos2.ru:3000/confirm/' + confirmKey + ' ' +
                    'Ссылка действительна ' + moment.humanizeDuration(ms('2d')) + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо запрашивать смену пароля повторно',
                html: 'Привет, <b>' + data.login + '</b>!<br/><br/>' +
                    'Вы получили это письмо, так как для Вашей учетной записи был создан запрос на восстановление пароля на проекте oldmos2.ru. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.<br/><br/>' +
                    'Для получения нового пароля перейдите по следующей ссылке:<br/>' +
                    '<a href="http://oldmos2.ru:3000/confirm/' + confirmKey + '" target="_blank">http://oldmos2.ru/confirm/' + confirmKey + '</a><br/>' +
                    'Ссылка действительна ' + moment.humanizeDuration(ms('2d')) + ' (до ' + expireOn.format("LLL") + '), по истечении которых Вам будет необходимо запрашивать смену пароля повторно'
            }, this);
        },
        function finish(err) {
            if (err) {
                cb({message: err.message, error: true});
                return;
            }
            cb({message: success});
        }
    )
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

module.exports.loadController = function (a, db, io) {
    app = a;
    Session = db.model('Sessionz');
    User = db.model('User');
    Role = db.model('Role');
    UserConfirm = db.model('UserConfirm');

    io.sockets.on('connection', function (socket) {
        var session = socket.handshake.session;

        socket.on('loginRequest', function (json) {
            login(socket, json, function (newSession, data) {
                if (newSession) {
                    session = newSession;
                }
                socket.emit('loginResult', data);
            });
        });

        socket.on('logoutRequest', function (data) {
            _session.destroy(session, function (err) {
                socket.emit('logoutResult', {message: (err && err.message) || '', error: !!err, logoutPath: '/'});
            });
        });

        socket.on('registerRequest', function (data) {
            register(session, data, function (data) {
                socket.emit('registerResult', data);
            });
        });

        socket.on('recallRequest', function (data) {
            recall(session, data, function (data) {
                socket.emit('recallResult', data);
            });
        });

        socket.on('whoAmI', function (data) {
            if (session.user && session.roles) {
                session.user.role_level = session.roles[0]['level'];
                session.user.role_name = session.roles[0]['name'];
            }
            socket.emit('youAre', (session.user && session.user.toObject ? session.user.toObject() : null));
        });
    });

    app.get('/confirm/:key', function (req, res) {
        var key = req.params.key;
        if (!key || key.length < 79 || key.length > 80) throw new errS.e404();

        UserConfirm.findOneAndRemove({'key': key}).populate('user').exec(function (err, confirm) {
            if (err || !confirm || !confirm.user) {
                errS.e404Virgin(req, res);
            } else {
                if (key.length === 80) { //Confirm registration
                    Step(
                        function () {
                            confirm.user.active = true;
                            confirm.user.save(this);
                        },
                        function (err) {
                            if (err) {
                                errS.e500Virgin(req, res);
                            } else {
                                req.session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
                                res.redirect('/');
                            }
                        }
                    );
                } else if (key.length === 79) { //Confirm pass change
                    var newPass = Utils.randomString(6);

                    Step(
                        function () {
                            confirm.user.pass = newPass;
                            confirm.user.save(this);
                        },
                        function sendMail(err) {
                            if (err) {
                                errS.e500Virgin(req, res);
                            }
                            Mail.send({
                                // sender info
                                from: 'Oldmos2 <confirm@oldmos2.ru>',

                                // Comma separated list of recipients
                                to: confirm.user.login + ' <' + confirm.user.email + '>',

                                // Subject of the message
                                subject: 'Your new password',

                                headers: {
                                    'X-Laziness-level': 1000
                                },

                                text: 'Привет, ' + confirm.user.login + '!' +
                                    'Ваш пароль успешно заменен на новый.' +
                                    'Логин: ' + confirm.user.login +
                                    'Пароль: ' + newPass +
                                    'Теперь Вы можете зайти на проект oldmos2.ru, используя новые реквизиты',

                                html: 'Привет, <b>' + confirm.user.login + '</b>!<br/><br/>' +
                                    'Ваш пароль успешно заменен на новый.<br/>' +
                                    'Логин: <b>' + confirm.user.login + '</b><br/>' +
                                    'Пароль: <b>' + newPass + '</b><br/><br/>' +
                                    'Теперь Вы можете зайти на проект oldmos2.ru, используя новые реквизиты'
                            }, this);
                        },
                        function finish(err) {
                            if (err) {
                                errS.e500Virgin(req, res);
                            } else {
                                req.session.message = 'Thank you! Information with new password sent to your e-mail. You can use it right now!';
                                res.redirect('/');
                            }
                        }
                    );
                }
            }
        });
    });
};