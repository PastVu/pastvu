var auth = require('./auth.js'),
    _session = require('./_session.js'),
    Settings,
    User,
    Utils = require('../commons/Utils.js'),
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
        res.render('indexNew.jade', {pageTitle: login || 'Profile'});

        /*Step(
            function () {
                User.getUserPublic(login, this);
            },
            function (err, user) {
                userObject = user.toObject();
                if (err || !user) {
                    throw new errS.e404();
                } else {
                    res.render('indexNew.jade', {pageTitle: user.login});
                    //res.render('userProfile.jade', {pageTitle: user.login});
                }
            }
        );*/

    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        //socket.emit('initMessage', {init_message: '000'});

        socket.on('giveUser', function (data) {
            logger.info(data);
            User.getUserPublic(data.login, function (err, user) {
                socket.emit('takeUser', (user && user.toObject()) || {error: true, message: err && err.messagee});
            });
        });

        socket.on('saveUser', function (data) {
            var toDel = {};
            Object.keys(data).forEach(function (key) {
                if (data[key].length === 0) {
                    toDel[key] = 1;
                    delete data[key];
                    delete session.neoStore.user[key];
                }
            });
            //var updateData = {}.extend(data).extend({'$unset': toDel});

            User.update({login: data.login}, {}.extend(data).extend({'$unset': toDel}), {upsert: true}, function (err) {
                if (err) {
                    logger.error(err);
                } else {
                    //��������� ��������� ������ ������ � memcashed
                    session.neoStore.user.extend(data);
                    _session.cashedSession(session.id, session.neoStore);
                    logger.info('Saved story line for ' + data.login);
                }
            });
            socket.emit('saveUserResult', {ok: 1});
        });

        //socket.on('disconnect', function() {});
    });

};