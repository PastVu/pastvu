var auth = require('./auth.js'),
    _session = require('./_session.js'),
    Settings = require('mongoose').model('Settings'),
    User = require('mongoose').model('User'),
    Step = require('step'),
    Utils = require('../commons/Utils.js'),
    log4js = require('log4js');

module.exports.loadController = function (app, io) {
    var logger = log4js.getLogger("profile.js");

    app.get('/u/:login?', function (req, res) {
        var login = req.params.login,
            userObject;
        if (!login) {
            //throw new errS.e404();
        }
        res.render('indexNew.jade', {pretty: false, pageTitle: login || 'Profile', appHash: app.hash});

        /*Step(
            function () {
                User.getUserPublic(login, this);
            },
            function (err, user) {
                userObject = user.toObject();
                if (err || !user) {
                    throw new errS.e404();
                } else {
                    res.render('indexNew.jade', {pretty: false, pageTitle: user.login, appHash: app.hash});
                    //res.render('profile.jade', {pretty: false, pageTitle: user.login, appHash: app.hash});
                }
            }
        );*/

    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        //socket.emit('initMessage', {init_message: '000'});

        socket.on('giveUser', function (data) {
            User.getUserPublic(data.login, function (err, user) {
                socket.emit('takeUser', user.toObject());
            });
        });

        socket.on('saveUser', function (data) {
            var toDel = {};
            Object.keys(data).forEach(function (key) {
                if (data[key].length == 0) {
                    toDel[key] = 1;
                    delete data[key];
                    delete session.neoStore.user[key];
                }
            });
            //var updateData = {}.extend(data).extend({'$unset': toDel});

            User.update({login: data.login}, {}.extend(data).extend({'$unset': toDel}), {upsert: true}, function (err) {
                if (err) {
                    logger.error(err)
                }
                else {
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