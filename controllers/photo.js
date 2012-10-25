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
                    Photo.find({user: user._id}).select('-_id -user').sort('-loaded').skip(data.start).limit(data.limit).exec(function (err, photo) {
                        socket.emit('takeUserPhoto', photo);
                    });
                }
            });
        });

        socket.on('createPhoto', function (data) {
            var result = function (data) {
                socket.emit('createPhotoCallback', data);
            };
            if (data.login) {
                User.getUserAll(data.login, function (err, user) {
                    if (err || !user) {
                        result({message: 'User with such login does not exist', error: true});
                        return;
                    }
                    Counter.increment('photo', function (err, result) {
                        if (err || !result) {
                            result({message: 'Increment error', error: true});
                            return;
                        } else {
                            var photo = new Photo({
                                cid: result.next,
                                user: user._id,
                                file: data.file
                            }.extend(data));
                            user.pcount = user.pcount + 1;
                            user.save();
                            photo.save(function (err, doc) {
                                if (err) {
                                    result({message: err.message || '', error: true});
                                    return;
                                }
                                result({message: 'success', data: doc});
                            });
                        }
                    });
                });
            }
        });

        socket.on('removePhoto', function (data) {
            var result = function (data) {
                socket.emit('removePhotoCallback', data);
            };
            if (!data.login || !data.file) {
                result({message: 'Need login and file name to remove photo', error: true});
                return;
            }
            User.getUserAll(data.login, function (err, user) {
                if (err || !user) {
                    result({message: 'User with such login does not exist', error: true});
                    return;
                }
                user.pcount = user.pcount - 1;
                user.save();
                Photo.findOneAndRemove({user: user._id, file: data.file}, result);
            });
        });

    });
};