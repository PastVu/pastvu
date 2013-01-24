'use strict';

var Settings,
    User,
    Photo,
    Cluster,
    Counter,
    PhotoConverter = require('./photoConverter.js'),
    _ = require('lodash'),
    fs = require('fs'),
    ms = require('ms'), // Tiny milisecond conversion utility
    moment = require('moment'),
    step = require('step'),
    Utils = require('../commons/Utils.js'),
    log4js = require('log4js'),
    logger,
    photoDir = process.cwd() + '/publicContent/photos',
    imageFolders = [photoDir + '/micro/', photoDir + '/mini/', photoDir + '/thumb/', photoDir + '/standard/', photoDir + '/origin/'];

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

    if (!data || (!Array.isArray(data) && !Utils.isType('object', data))) {
        cb({message: 'Bad params', error: true});
        return;
    }

    if (!Array.isArray(data) && Utils.isType('object', data)) {
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
                    user: session.user._id,
                    fresh: true
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

    if (!data || (!Array.isArray(data) && !Utils.isType('string', data))) {
        cb({message: 'Bad params', error: true});
        return;
    }

    if (!Array.isArray(data) && Utils.isType('string', data)) {
        data = [data];
    }

    step(
        function setDelFlag() {
            Photo.update({user: session.user._id, file: {$in: data}, del: {$exists: false}}, { $set: { del: true }}, { multi: true }, this);
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

/**
 * Ежедневно обнуляет статистику дневных просмотров
 */
function resetStatDay() {
    Photo.resetStatDay(function (err, updatedCount) {
        logger.info('Reset day display statistics for ' + updatedCount + ' photos');
        if (err) {
            logger.error(err);
            return;
        }
        planResetStatDay();
    });
}
function planResetStatDay() {
    setTimeout(resetStatDay, moment().add('d', 1).sod().diff(moment()) + 1000);
}
/**
 * Еженедельно обнуляет статистику недельных просмотров
 */
function resetStatWeek() {
    Photo.resetStatWeek(function (err, updatedCount) {
        logger.info('Reset week display statistics for ' + updatedCount + ' photos');
        if (err) {
            logger.error(err);
            return;
        }
        planResetStatWeek();
    });
}
function planResetStatWeek() {
    setTimeout(resetStatWeek, moment().add('w', 1).day(1).sod().diff(moment()) + 1000);
}

module.exports.loadController = function (app, db, io) {
    logger = log4js.getLogger("photo.js");

    Settings = db.model('Settings');
    User = db.model('User');
    Photo = db.model('Photo');
    Cluster = db.model('Cluster');
    Counter = db.model('Counter');

    PhotoConverter.loadController(app, db, io);

    planResetStatDay(); //Планируем очистку статистики за ltym
    planResetStatWeek(); //Планируем очистку статистики за неделю


    app.get('/p/:cid?/*', function (req, res) {
        var cid = req.params.cid,
            userObject;
        res.statusCode = 200;
        res.render('appPhoto.jade', {pageTitle: 'Photo'});
    });

    //Регулярно проводим чистку удаленных файлов
    setInterval(dropPhotos, ms('5m'));
    dropPhotos();

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        socket.on('createPhoto', function (data) {
            createPhotos(hs.session, data, function (createData) {
                if (!createData.error) {
                    if (!Array.isArray(data) && Utils.isType('object', data)) {
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
                    Photo.find({user: hs.session.user._id, file: {$in: data}, del: {$exists: false}}).select('file').exec(this);
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
                var filters = {user: user._id, del: {$exists: false}};
                if (!hs.session.user || !user._id.equals(hs.session.user._id)) {
                    filters.fresh = {$exists: false};
                    filters.disabled = {$exists: false};
                }
                Photo.getPhotosCompact(filters, {skip: data.start, limit: data.limit}, function (err, photo) {
                    if (err) {
                        takeUserPhotos({message: err && err.message, error: true});
                        return;
                    }
                    takeUserPhotos(photo);
                });
                filters = null;
            });
        });

        /**
         * Отдаем фотографии с ограниченным доступом
         */
        function takeUserPhotosPrivate(data) {
            socket.emit('takeUserPhotosPrivate', data);
        }

        socket.on('giveUserPhotosPrivate', function (data) {
            User.getUserID(data.login, function (err, user) {
                if (err) {
                    takeUserPhotosPrivate({message: err && err.message, error: true});
                    return;
                }
                if (!hs.session.user || !user._id.equals(hs.session.user._id)) {
                    takeUserPhotosPrivate({message: 'Not authorized', error: true});
                    return;
                }
                var filters = {user: user._id, loaded: {}, $or: [], del: {$exists: false}};
                if (hs.session.user && user._id.equals(hs.session.user._id)) {
                    filters.$or.push({fresh: {$exists: true}});
                    filters.$or.push({disabled: {$exists: true}});
                }

                if (data.startTime) {
                    filters.loaded.$gte = data.startTime;
                }
                if (data.endTime) {
                    filters.loaded.$lte = data.endTime;
                }
                Photo.getPhotosCompact(filters, {}, function (err, photo) {
                    if (err) {
                        takeUserPhotosPrivate({message: err && err.message, error: true});
                        return;
                    }
                    takeUserPhotosPrivate(photo);
                });
                filters = null;
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
                //console.dir(photo);
                takePhoto(photo.toObject());
            });
        });

        /**
         * Подтверждаем фотографию
         */
        function approvePhotoResult(data) {
            socket.emit('approvePhotoResult', data);
        }
        socket.on('approvePhoto', function (cid) {
            if (!hs.session.user) {
                approvePhotoResult({message: 'Not authorized', error: true});
                return;
            }
            Photo.update({cid: cid, fresh: true, del: {$exists: false}}, { $unset: { fresh: 1 }}, {}, function (err, numberAffected) {
                if (err) {
                    approvePhotoResult({message: err.message || '', error: true});
                    return;
                }
                if (!numberAffected) {
                    approvePhotoResult({message: 'No photo affected', error: true});
                    return;
                }
                approvePhotoResult({message: 'Photo appreved successfully'});
            });
        });

        /**
         * Берем массив до и после указанной фотографии указанной длины
         */
        function takeUserPhotosAround(data) {
            socket.emit('takeUserPhotosAround', data);
        }
        socket.on('giveUserPhotosAround', function (data) {
            if (!data.cid || (!data.limitL && !data.limitR)) {
                takeUserPhotosAround({message: 'Bad params', error: true});
                return;
            }

            step(
                function findUserId() {
                    Photo.findOne({cid: data.cid}).select('-_id user').exec(this);
                },
                function findAroundPhotos(err, photo) {
                    if (err || !photo || !photo.user) {
                        takeUserPhotosAround({message: 'No such photo', error: true});
                        return;
                    }
                    var filters = {user: photo.user, del: {$exists: false}};
                    if (!hs.session.user || !photo.user.equals(hs.session.user._id)) {
                        filters.fresh = {$exists: false};
                        filters.disabled = {$exists: false};
                    }
                    if (data.limitL > 0) {
                        Photo.find(filters).gt('cid', data.cid).sort('loaded').limit(data.limitL).select('-_id cid file title year').exec(this.parallel());
                    }
                    if (data.limitR > 0) {
                        Photo.find(filters).lt('cid', data.cid).sort('-loaded').limit(data.limitR).select('-_id cid file title year').exec(this.parallel());
                    }
                    filters = null;
                },
                function (err, photosL, photosR) {
                    if (err) {
                        takeUserPhotosAround({message: err.message || '', error: true});
                        return;
                    }
                    takeUserPhotosAround({left: photosL, right: photosR});
                }
            );
        });


        /**
         * Активация/деактивация фото
         */
        function disablePhotoResult(data) {
            socket.emit('disablePhotoResult', data);
        }
        socket.on('disablePhoto', function (cid) {
            if (!hs.session.user) {
                disablePhotoResult({message: 'Not authorized', error: true});
                return;
            }
            if (!cid) {
                disablePhotoResult({message: 'cid is not defined', error: true});
                return;
            }
            Photo.findOne({cid: cid, fresh: {$exists: false}, del: {$exists: false}}).select('disabled').exec(function (err, photo) {
                if (err) {
                    disablePhotoResult({message: err && err.message, error: true});
                    return;
                }
                if (photo.disabled) {
                    photo.disabled = undefined;
                } else {
                    photo.disabled = true;
                }
                photo.save(function (err, result) {
                    if (err) {
                        disablePhotoResult({message: err.message || '', error: true});
                        return;
                    }
                    disablePhotoResult({message: 'Photo saved successfully', disabled: result.disabled});
                });
            });
        });

        /**
         * Устанавливаем новые параметры кластеров и отправляем их на пересчет
         */
        function setClustersParamsResult(data) {
            socket.emit('setClustersParamsResult', data);
        }
        socket.on('setClustersParams', function (data) {
            setClustersParamsResult({message: 'Not authorized', error: true});
        });

        /**
         * Сохраняем информацию о фотографии
         */
        function savePhotoResult(data) {
            socket.emit('savePhotoResult', data);
        }
        socket.on('savePhoto', function (data) {
            if (!hs.session.user) {
                savePhotoResult({message: 'Not authorized', error: true});
                return;
            }
            if (!data.cid) {
                savePhotoResult({message: 'cid is not defined', error: true});
                return;
            }
            Photo.findOne({cid: data.cid, del: {$exists: false}}).populate('user', 'login').exec(function (err, photo) {
                if (err) {
                    savePhotoResult({message: err && err.message, error: true});
                    return;
                }
                if (photo.user.login !== hs.session.user.login) {
                    savePhotoResult({message: 'Not authorized', error: true});
                    return;
                }
                var toSave = _.pick(data, 'geo', 'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author');
                if (Object.keys(toSave).length > 0) {

                    console.dir(photo.geo);
                    console.dir(toSave.geo);
                    if (toSave.geo && toSave.geo.length === 2 && toSave.geo[0] >= -180 && toSave.geo[0] <= 180 /*Latitude*/ && toSave.geo[1] > -90 && toSave.geo[1] < 90 /*Latitude*/ && !_.isEqual(toSave.geo, photo.geo)) {
                        console.dir('Geo changed');

                    }

                    _.assign(photo, toSave);
                    photo.save(function (err) {
                        if (err) {
                            savePhotoResult({message: err.message || '', error: true});
                            return;
                        }
                        savePhotoResult({message: 'Photo saved successfully'});
                    });
                } else {
                    savePhotoResult({message: 'Nothing to save', error: true});
                    return;
                }
            });
        });

    });
};