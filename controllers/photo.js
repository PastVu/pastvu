'use strict';

var Settings,
    User,
    Photo,
    Counter,
    PhotoConverter = require('./photoConverter.js'),
    _ = require('lodash'),
    fs = require('fs'),
    ms = require('ms'), // Tiny milisecond conversion utility
    step = require('step'),
    Utils = require('../commons/Utils.js'),
    log4js = require('log4js'),
    photoDir = process.cwd() + '/publicContent/photos',
    imageFolders = [photoDir + '/standard/', photoDir + '/thumb/', photoDir + '/micro/', photoDir + '/origin/'];

/**
 * Создает фотографии в базе данных
 * @param session Сессия польщователя
 * @param data Объект или массив фотографий
 * @param cb Коллбэк
 */
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

/**
 * Проставляет фотографиям в базе флаг удаления и удаляет из из конвейера конвертаций
 * @param session Сессия пользователя
 * @param data Массив имен фотографий
 * @param cb Коллбэк
 */
function removePhotos(session, data, cb) {
    if (!session.user || !session.user.login) {
        cb({message: 'You are not authorized for this action.', error: true});
        return;
    }

    if (!data || (!Array.isArray(data) && !Utils.isObjectType('string', data))) {
        cb({message: 'Bad params', error: true});
        return;
    }

    if (!Array.isArray(data) && Utils.isObjectType('string', data)) {
        data = [data];
    }

    step(
        function setDelFlag() {
            Photo.update({user: session.user._id, file: {$in: data}, del: {$ne: true}}, { $set: { del: true }}, { multi: true }, this);
        },
        function (err, photoQuantity) {
            if (err || photoQuantity === 0) {
                cb({message: 'No such photo for this user', error: true});
                return;
            }
            session.user.pcount = session.user.pcount - 1;
            session.user.save();
            PhotoConverter.removePhotos(data, this);
        },
        function (err) {
            cb({message: 'Photo removed'});
        }
    );
}

/**
 * Ококнчательно удаляет фотографии у которых проставлен флаг удаления из базы и с диска
 * @param cb Коллбэк
 */
function dropPhotos(cb) {
    Photo.where('del').equals(true).select('file -_id').find(function (err, photos) {
        var files = _.pluck(photos, 'file');
        if (files.length === 0) {
            return;
        }
        files.forEach(function (file, index) {
            imageFolders.forEach(function (folder) {
                fs.unlink(folder + file);
            });
        });
        Photo.where('file').in(files).remove(function (err, deleteQuantity) {
            if (cb) {
                cb('Removed ' + deleteQuantity + 'photos');
            }
        });
    });
}

module.exports.loadController = function (app, db, io) {
    var logger = log4js.getLogger("photo.js");

    Settings = db.model('Settings');
    User = db.model('User');
    Photo = db.model('Photo');
    Counter = db.model('Counter');

    PhotoConverter.loadController(app, db, io);

    //Регулярно проводим чистку удаленных файлов
    setInterval(dropPhotos, ms('5m'));
    dropPhotos();

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

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

        socket.on('removePhotos', function (data) {
            removePhotos(hs.session, data, function (resultData) {
                socket.emit('removePhotoCallback', resultData);
            });
        });
        socket.on('dropPhotos', function (data) {
            dropPhotos(function (msg) {
                socket.emit('dropPhotosResult', {message: msg});
            });
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
                    Photo.find({user: hs.session.user._id, file: {$in: data}, del: {$ne: true}}).select('file').exec(this);
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

        /**
         * Отдаем фотографии пользователя в компактном виде
         */
        function takeUserPhotos(data) {
            socket.emit('takeUserPhotos', data);
        }
        socket.on('giveUserPhotos', function (data) {
            User.getUserID(data.login, function (err, user) {
                if (err) {
                    takeUserPhotos({message: err && err.message, error: true});
                    return;
                }
                Photo.getPhotosCompact({user: user._id, del: {$ne: true}}, {skip: data.start, limit: data.limit}, function (err, photo) {
                    //console.dir(arguments);
                    if (err) {
                        takeUserPhotos({message: err && err.message, error: true});
                        return;
                    }
                    takeUserPhotos(photo);
                });
                Photo.getPhoto({cid: 736}, function (err, photo) {
                    if (err) {
                        takePhoto({message: err && err.message, error: true});
                        return;
                    }
                    console.dir(photo);
                    takePhoto(photo.toObject());
                });
            });
        });


        /**
         * Отдаем фотографию
         */
        function takePhoto(data) {
            socket.emit('takePhoto', data);
        }
        socket.on('givePhoto', function (data) {
            Photo.getPhoto({cid: data.cid}, function (err, photo) {
                if (err) {
                    takePhoto({message: err && err.message, error: true});
                    return;
                }
                console.dir(photo);
                takePhoto(photo.toObject());
            });
        });

    });
};