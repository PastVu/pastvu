var _session = require('./_session.js'),
    User,
    Role,
    UserConfirm,
    Step = require('step'),
    Mail = require('./mail.js'),
    errS = require('./errors.js').err,
    Utils = require('../commons/Utils.js'),
    log4js = require('log4js'),
    app,
    io,
    mongo_store;

var logger = log4js.getLogger("auth.js");

function login(session, data, cb) {
    var error = '';

    if (!data.login) error += 'Fill in the login field. ';
    if (!data.pass) error += 'Fill in the password field.';
    if (error) {
        cb({message: error, error: true});
        return;
    }

    User.getAuthenticated(data.login, data.pass, function (err, user, reason) {
        if (err) {
            cb({message: err && err.message, error: true});
            return;
        }

        // login was successful if we have a user
        if (user) {
            session.login = user.login;
            session.remember = data.remember;
            if (data.remember) {
                session.cookie.expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            } else {
                session.cookie.expires = false;
            }
            session.save();

            //Удаляем предыдущие сохранившиеся сессии этого пользователя
            mongo_store.getCollection().remove({'session': new RegExp('^' + user.login + '$', 'i'), _id: { $ne: session.id }});

            _session.getNeoStore(session, user.login, function SaveSess(neoStore) {
                session.neoStore = neoStore;
                logger.info("Login success for %s", data.login);
                cb({message: "Success login"});
            });
            return;
        }

        switch (reason) {
        case User.failedLogin.NOT_FOUND:
        case User.failedLogin.PASSWORD_INCORRECT:
            // note: these cases are usually treated the same - don't tell
            // the user *why* the login failed, only that it did
            cb({message: 'Login or password incorrect', error: true});
            break;
        case User.failedLogin.MAX_ATTEMPTS:
            // send email or otherwise notify user that account is
            // temporarily locked
            cb({message: 'Your account has been temporarily locked due to exceeding the number of wrong login attempts', error: true});
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

            new User({
                login: data.login,
                email: data.email,
                pass: data.pass,
                roles: [role._id]
            }).save(this.parallel());

            UserConfirm.remove({login: new RegExp(data.login, 'i')}, this.parallel());
        },
        function sendMail(err) {
            if (err) {
                console.dir(err);
                cb({message: err.message, error: true});
                return;
            }
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
                    'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо зарегистрироваться повторно',
                html: 'Привет, <b>' + data.login + '</b>!<br/><br/>' +
                    'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.<br/><br/>' +
                    'При регистрации вы указали логин и пароль:<br/>' +
                    'Логин: <b>' + data.login + '</b><br/>' +
                    'Пароль: <b>' + data.pass + '</b><br/><br/>' +
                    'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.<br/><br/>' +
                    'Для активации Вашего аккаунта, пройдите по следующей ссылке:<br/>' +
                    '<a href="http://oldmos2.ru:3000/confirm/' + confirmKey + '" target="_blank">http://oldmos2.ru/confirm/' + confirmKey + '</a><br/>' +
                    'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо зарегистрироваться повторно'
            }, this.parallel());

            new UserConfirm({key: confirmKey, login: data.login}).save(this.parallel());
        },

        function finish(err) {
            if (err) {
                console.dir(err);
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
        cb.call({message: error, error: true});
        return;
    }

    Step(
        function checkUserExists() {
            User.findOne().or([
                {login: new RegExp('^' + data.login + '$', 'i')},
                {email: data.login.toLowerCase()}
            ]).where('active', true).exec(this);
            //User.findOne({ $and: [ { $or : [ { login : new RegExp('^'+data.login+'$', 'i') } , { email : data.login.toLowerCase() } ] }, { active: true } ] } , this);
        },
        function (err, user) {
            if (err || !user) {
                error += 'User with such login or e-mail does not exist';
                cb.call({message: error, error: true});
                return;
            } else {
                data.login = user.login;
                data.email = user.email;
                confirmKey = Utils.randomString(79);
                UserConfirm.remove({login: new RegExp('^' + data.login + '$', 'i')}, this);
            }
        },
        function (err) {
            new UserConfirm({key: confirmKey, login: data.login}).save(this);
        },
        function sendMail(err) {
            if (err) {
                cb.call({message: (err && err.message) || '', error: true});
                return;
            }
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
                    'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо запрашивать смену пароля повторно',
                html: 'Привет, <b>' + data.login + '</b>!<br/><br/>' +
                    'Вы получили это письмо, так как для Вашей учетной записи был создан запрос на восстановление пароля на проекте oldmos2.ru. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.<br/><br/>' +
                    'Для получения нового пароля перейдите по следующей ссылке:<br/>' +
                    '<a href="http://oldmos2.ru:3000/confirm/' + confirmKey + '" target="_blank">http://oldmos2.ru/confirm/' + confirmKey + '</a><br/>' +
                    'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо запрашивать смену пароля повторно'
            }, this);
        },
        function finish(err) {
            cb.call(null, err, (!err && success));
        }
    )
}

function clearUnconfirmedUsers() {
    var today = new Date(),
        todayminus2days = new Date(today);
    todayminus2days.setDate(today.getDate() - 3);
    UserConfirm.find({'created': { "$lte": todayminus2days}}).select({key: 1, login: 1, _id: 0}).exec(function (err, docs) {
        if (err || docs.length < 1) return;

        var users = [];
        for (var i = 0, dlen = docs.length; i < dlen; i++) {
            if (docs[i]['key'].length == 80) users.push(docs[i]['login']);
        }
        logger.info('Clear ' + users.length + ' unconfirmed users: ' + users.join(", "));
        if (users.length > 0) User.remove({'login': { $in: users }}, function (err) {
            logger.error('Fail to clear users: ' + err)
        });
        UserConfirm.remove({'created': { "$lte": todayminus2days }}, function (err) {
            logger.error('Fail to clear unconfirmed records: ' + err)
        });
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

module.exports.loadController = function (a, db, io, ms) {
    app = a;
    User = db.model('User');
    Role = db.model('Role');
    UserConfirm = db.model('UserConfirm');
    mongo_store = ms;

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        socket.on('loginRequest', function (json) {
            login(socket.handshake.session, json, function (data) {
                socket.emit('loginResult', data);
            });
        });

        socket.on('logoutRequest', function (data) {
            _session.cashedSessionDel(session.id);

            session.destroy(function (err) {
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
            if (session.neoStore.user && session.neoStore.roles) {
                session.neoStore.user.role_level = session.neoStore.roles[0]['level'];
                session.neoStore.user.role_name = session.neoStore.roles[0]['name'];
            }
            socket.emit('youAre', session.neoStore.user);
        });
    });

    app.get('/confirm/:key', function (req, res) {
        var key = req.params.key;
        if (!key || key.length < 79 || key.length > 80) throw new errS.e404();

        UserConfirm.findOne({'key': key}).select({login: 1, _id: 1}).exec(function (err, doc) {
            if (err || !doc) {
                errS.e404Virgin(req, res);
            } else {
                if (key.length === 80) { //Confirm registration
                    Step(
                        function () {
                            User.update({ login: doc.login }, {$set: {active: true}}, { multi: false }, this.parallel());
                            UserConfirm.remove({'_id': doc._id}, this.parallel());
                        },
                        function (err) {
                            if (err) errS.e500Virgin(req, res);
                            else {
                                req.session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
                                res.redirect('/');
                            }
                        }
                    );
                } else if (key.length === 79) { //Confirm pass change
                    var newPass = Utils.randomString(8),
                        email;

                    Step(
                        function findUser() {
                            User.findOne({ login: doc.login }, this);
                        },
                        function (err, user) {
                            if (user) {
                                email = user.email;
                                user.pass = newPass;
                                user.save(this);
                            } else {
                                errS.e404Virgin(req, res);
                            }
                        },
                        function sendMail(err) {
                            if (err) {
                                errS.e500Virgin(req, res);
                            }
                            Mail.send({
                                // sender info
                                from: 'Oldmos2 <confirm@oldmos2.ru>',

                                // Comma separated list of recipients
                                to: doc.login + ' <' + email + '>',

                                // Subject of the message
                                subject: 'Your new password', //

                                headers: {
                                    'X-Laziness-level': 1000
                                },

                                text: 'Привет, ' + doc.login + '!' +
                                    'Ваш пароль успешно заменен на новый.' +
                                    'Логин: ' + doc.login +
                                    'Пароль: ' + newPass +
                                    'Теперь Вы можете зайти на проект oldmos2.ru, используя новые реквизиты',

                                html: 'Привет, <b>' + doc.login + '</b>!<br/><br/>' +
                                    'Ваш пароль успешно заменен на новый.<br/>' +
                                    'Логин: <b>' + doc.login + '</b><br/>' +
                                    'Пароль: <b>' + newPass + '</b><br/><br/>' +
                                    'Теперь Вы можете зайти на проект oldmos2.ru, используя новые реквизиты'
                            }, this);
                        },
                        function finish(err) {
                            if (err) errS.e500Virgin(req, res);
                            else {
                                req.session.message = 'Thank you! Information with new password sent to your e-mail. You can use it right now!';
                                res.redirect('/');
                            }
                        }
                    );
                }
            }
        });
    });

    //Раз в день чистим пользователей, которые не подтвердили регистрацию или не сменили пароль
    //setInterval(clearUnconfirmedUsers, 24 * 60 * 60 * 1000);
    //clearUnconfirmedUsers();
};