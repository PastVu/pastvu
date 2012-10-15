var auth = require('./auth.js'),
    Settings = require('mongoose').model('Settings'),
    User = require('mongoose').model('User'),
    Photo = require('mongoose').model('Photo'),
    Step = require('step');

module.exports.loadController = function (app, io) {

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        socket.on('giveUserPhoto', function (data) {
            User.getUserID(data.login, function (err, user) {
                if (!err) {
                    console.dir('userID', user._id);
                    Photo.find({user_id: user._id}).exec(function (err, photo) {
                        socket.emit('takeUserPhoto', photo);
                    });
                }
            });
        });
    });

};