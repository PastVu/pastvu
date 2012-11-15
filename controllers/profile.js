var auth = require('./auth.js'),
    _session = require('./_session.js'),
    Settings,
    User,
    Utils = require('../commons/Utils.js'),
    step = require('step'),
    log4js = require('log4js');

module.exports.loadController = function (app, db, io) {
    var logger = log4js.getLogger("profile.js");

    Settings = db.model('Settings');
    User = db.model('User');

    app.get('/u/:login?/*', function (req, res) {
        var login = req.params.login,
            userObject;
        if (!login) {
            //throw new errS.e404();
        }
        res.statusCode = 200;
        res.render('appUser.jade', {pageTitle: login || 'Profile'});

        /*Step(
            function () {
                User.getUserPublic(login, this);
            },
            function (err, user) {
                userObject = user.toObject();
                if (err || !user) {
                    throw new errS.e404();
                } else {
                    res.render('appUser.jade', {pageTitle: user.login});
                    //res.render('profile.jade', {pageTitle: user.login});
                }
            }
        );*/

    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        //socket.emit('initMessage', {init_message: '000'});

        socket.on('giveUser', function (data) {
            User.getUserPublic(data.login, function (err, user) {
                socket.emit('takeUser', (user && user.toObject()) || {error: true, message: err && err.messagee});
            });
        });

        socket.on('saveUser', function (data) {
            //var updateData = {}.extend(data).extend({'$unset': toDel});
            var itsMe = hs.session.user && hs.session.user.login === data.login,
                result = function (data) {
                    socket.emit('saveUserResult', data);
                };
            step(
                function () {
                    if (itsMe) {
                        this(null, hs.session.user);
                    } else {
                        User.findOne({login: data.login}, this);
                    }
                },
                function (err, user) {
                    Object.keys(data).forEach(function (key) {
                        if (user[key] && data[key].length === 0) {
                            user[key] = undefined;
                        } else {
                            user[key] = data[key];
                        }
                    });
                    user.save(this);
                },
                function (err, user) {
                    if (err) {
                        result({message: err && err.message, error: true});
                        return;
                    }
                    result({ok: 1});
                    if (itsMe) {
                        socket.emit('youAre', user);
                    }
                    logger.info('Saved story line for ' + user.login);
                }
            );
        });
    });

};