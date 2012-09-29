var auth = require('./auth.js'),
    _session = require('./_session.js'),
    Settings = require('mongoose').model('Settings'),
    User = require('mongoose').model('User'),
    Step = require('step'),
    Utils = require('../commons/Utils.js');

module.exports.loadController = function (app, io) {

    app.get('/admin', auth.restrictToRoleLevel(50), function (req, res) {
        res.render('adminUser.jade', {pretty: false, pageTitle: 'Admin Panel', appHash: app.hash, appVersion: app.version});
    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        socket.on('giveUsers', function () {
            User.getAllUserPublic(function (err, users) {
                socket.emit('takeUsers', users);
            });
        });
    });

};