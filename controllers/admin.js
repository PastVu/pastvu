var auth = require('./auth.js'),
    _session = require('./_session.js'),
    Settings,
    User,
    Utils = require('../commons/Utils.js');

module.exports.loadController = function (app, db, io) {

    Settings = db.model('Settings');
    User = db.model('User');

    app.get('/admin', auth.restrictToRoleLevel(50), function (req, res) {
        res.statusCode = 200;
        res.render('adminUser.jade', {pageTitle: 'Admin Panel'});
    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        socket.on('giveUsers', function () {
            User.getAllPublicUsers(function (err, users) {
                socket.emit('takeUsers', users);
            });
        });
    });

};