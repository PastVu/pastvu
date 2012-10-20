var auth = require('./auth.js'),
    Settings,
    User,
    Photo,
    Counter,
    log4js = require('log4js');

module.exports.loadController = function (app, db, io) {
    var logger = log4js.getLogger("photo.js");

    Settings = db.model('Settings');
    User = db.model('User');
    Photo = db.model('Photo');
    Counter = db.model('Counter');

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;

        socket.on('giveUserPhoto', function (data) {
            User.getUserID(data.login, function (err, user) {
                if (!err) {
                    Photo.find({user_id: user._id}, {_id: 0}).sort('loaded', -1).skip(data.start).limit(data.limit).exec(function (err, photo) {
                        socket.emit('takeUserPhoto', photo);
                    });
                }
            });
        });

        socket.on('savePhoto', function (data) {
            if (data.login) {
                User.getUserID(data.login, function (err, user) {
                    if (!err) {
                        delete data.login;
                        Counter.increment('photo', function (err, result) {
                            if (err) {
                                logger.error('Counter on foto save error: ' + err);
                            } else {
                                Photo.update({cid: result.next, user_id: user._id, file: data.file}, {}.extend(data), {upsert: true}, function (err) {
                                    if (err) {
                                        logger.error(err);
                                    } else {
                                        socket.emit('savePhotoCallback', {ok: 1});
                                    }
                                });
                            }
                        });
                    } else {
                        socket.emit('savePhotoCallback', err);
                    }
                });
            }
        });

        socket.on('removePhoto', function (data) {
            if (data.login && data.file) {
                User.getUserID(data.login, function (err, user) {
                    if (!err) {
                        console.dir(data);
                        Photo.find({user_id: user._id, file: data.file}).remove();
                    } else {
                        socket.emit('removePhotoCallback', err);
                    }
                });
            }
        });
    });

};