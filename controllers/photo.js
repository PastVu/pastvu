'use strict';

var Settings,
    User,
    Photo,
    Counter,
    PhotoConverter = require('./photoConverter.js'),
    step = require('step'),
    Utils = require('../commons/Utils.js'),
    log4js = require('log4js');

function createPhotos(session, data, cb) {
    if (!session.user || !session.user.login) {
        cb({message: 'You are not authorized for this action.', error: true});
        return;
    }

    if (!data || (!Array.isArray(data) && !Utils.isObjectType('object', data))) {
        cb({message: 'Bad params', error: true});
        return;
    }

    if (!Array.isArray(data) && Utils.isObjectType('object', data)) {
        data = [data];
    }

    step(
        function increment() {
            Counter.incrementBy('photo', data.length, this);
        },
        function savePhotos(err, count) {
            if (err || !count) {
                cb({message: 'Increment photo counter error', error: true});
                return;
            }
            data.forEach(function (item, index) {
                var photo = new Photo({
                    cid: count.next - index,
                    user: session.user._id
                }.extend(item));
                if (data.length > 1) {
                    photo.save(this.parallel());
                } else {
                    photo.save(this);
                }
            }.bind(this));

        },
        function (err) {
            if (err) {
                cb({message: err.message || '', error: true});
                return;
            }
            session.user.pcount = session.user.pcount + data.length;
            session.user.save();
            cb({message: data.length + ' photo successfully saved ' + data[0].file});
        }
    );

}

module.exports.loadController = function (app, db, io) {
    var logger = log4js.getLogger("photo.js");

    Settings = db.model('Settings');
    User = db.model('User');
    Photo = db.model('Photo');
    Counter = db.model('Counter');

    PhotoConverter.loadController(app, db, io);

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

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
            createPhotos(hs.session, data, function (createData) {
                if (!createData.error) {
                    if (!Array.isArray(data) && Utils.isObjectType('object', data)) {
                        data = [data];
                    }
                    var toConvert = [];
                    data.forEach(function (item, index) {
                        toConvert.push(item.file);
                    });
                    PhotoConverter.convertPhoto(toConvert);
                }
                socket.emit('createPhotoCallback', createData);
            });
        });

        socket.on('removePhoto', function (data) {
            var result = function (data) {
                socket.emit('removePhotoCallback', data);
            };
            if (!hs.session.user || !hs.session.user.login) {
                result({message: 'You are not authorized for this action.', error: true});
                return;
            }
            step(
                function increment() {
                    Photo.findOneAndRemove({user: hs.session.user._id, file: data.file}, this);
                },
                function (err, photo) {
                    if (err || !photo) {
                        result({message: 'No such photo for this user', error: true});
                        return;
                    }
                    hs.session.user.pcount = hs.session.user.pcount - 1;
                    hs.session.user.save();
                    PhotoConverter.removePhoto(data.file, this.parallel());
                    result({message: 'Photo removed'});
                }
            );
        });

        socket.on('convertPhoto', function (data) {
            var result = function (data) {
                    socket.emit('convertPhotoResult', data);
                };
            if (!hs.session.user) {
                result({message: 'You are not authorized for this action.', error: true});
                return;
            }
            if (!Array.isArray(data) || data.length === 0) {
                result({message: 'Bad params. Need to be array of file names', error: true});
                return;
            }
            step(
                function () {
                    Photo.find({user: hs.session.user._id, file: {$in: data}}).select('file').exec(this);
                },
                function (err, photos, alreadyInConveyer) {
                    if (err) {
                        result({message: err && err.message, error: true});
                        return;
                    }
                    if (!photos || photos.length === 0) {
                        result({message: 'No such photos in base', error: true});
                        return;
                    }
                    PhotoConverter.convertPhoto(data, this);
                },

                function (addResult) {
                    result(addResult);
                }

            );
        });

    });
};