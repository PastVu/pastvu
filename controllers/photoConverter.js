var path = require('path'),
    auth = require('./auth.js'),
    async = require('async'),
    imageMagick = require('imagemagick'),
    Settings,
    User,
    Photo,
    PhotoConveyer,
    Utils = require('../commons/Utils.js'),
    step = require('step'),
    log4js = require('log4js'),
    appEnv = {};

module.exports.loadController = function (app, db, io) {
    'use strict';
    appEnv = app.get('appEnv');
    Photo = db.model('Photo');
    PhotoConveyer = db.model('PhotoConveyer');
    Settings = db.model('Settings');
    User = db.model('User');

    var logger = log4js.getLogger("PhotoConverter.js"),
        uploadDir = __dirname + '/../publicContent/photos',
        maxWorking = 3, // Возможно параллельно конвертировать
        goingToWork = 0, // Происходит выборка для дальнейшей конвертации
        working = 0, //Сейчас конвертируется
        imageSequence = [
            {
                version: 'standard',
                width: 1050,
                height: 700,
                filter: 'Sinc',
                postfix: '>'
            },
            {
                version: 'thumb',
                width: 246,
                height: 164,
                filter: 'Sinc',
                gravity: 'center',
                postfix: '^'
            },
            {
                version: 'micro',
                width: 60,
                height: 40,
                filter: 'Sinc',
                gravity: 'center',
                postfix: '^'
            }
        ];

    /**
     * Контроллер конвейера. Выбирает очередное фото из очереди и вызывает шаг конвейера
     * @param andConverting  Флаг, указывающий, что выбрать надо даже файлы у которых уже проставлен флаг конвертирования (например, если сервер был остановлен во время конвертирования и после запуска их надо опять сконвертировать)
     */
    function conveyerControl(andConverting) {
        var toWork = maxWorking - goingToWork - working,
            query;
        if (toWork < 1) {
            return;
        }
        query = [false];
        if (andConverting) {
            query.push(true);
        }
        goingToWork += toWork;
        PhotoConveyer.find({converting: {$in: query}}).sort('added').limit(toWork).exec(function (err, files) {
            goingToWork -= toWork - files.length;
            if (err || files.length === 0) {
                return;
            }

            files.forEach(function (item, index) {
                goingToWork -= 1;
                working += 1;
                item.converting = true; //Ставим флаг, что конвертация файла началась
                item.save(function (err) {
                    conveyerStep(item.file, function () {
                        item.remove(function () {
                            working -= 1;
                            conveyerControl();
                        });

                    });
                });
            });
        });
    }

    function conveyerStep(file, cb) {
        var sequence = [],
            start = Date.now();
        imageSequence.forEach(function (item, index, array) {
            var o = {
                srcPath: path.normalize(uploadDir + '/' + (index > 0 ? array[index - 1].version : 'origin') + '/' + file),
                dstPath: path.normalize(uploadDir + '/' + item.version + '/' + file),
                strip: true,
                width: item.width,
                height: item.height + (item.postfix || '') // Only Shrink Larger Images
            };
            if (item.filter) {
                o.filter = item.filter;
            }
            if (item.gravity) { // Превью генерируем путем вырезания аспекта из центра
                // Example http://www.jeff.wilcox.name/2011/10/node-express-imagemagick-square-resizing/
                o.customArgs = [
                    "-gravity", item.gravity,
                    "-extent", item.width + "x" + item.height
                ];
            }

            sequence.push(function (callback) {
                imageMagick.resize(o, function () {
                    callback(null);
                });
            });

        });
        async.waterfall(sequence, function () {
            logger.info('%s converted in %dms', file, (Date.now() - start));
            cb();
        });
    }

    setTimeout(function () { conveyerControl(true); }, 2000); // Запускаем комвейер после рестарта сервера

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        socket.on('convertPhoto', function (data) {
            var result = function (data) {
                    socket.emit('convertPhotoResult', data);
                },
                toConvert;
            if (!hs.session.user) {
                result({message: 'Not authorized', error: true});
            }
            if (!Utils.isObjectType('array', data) || data.length === 0) {
                result({message: 'Bad params', error: true});
            }
            step(
                function () {
                    Photo.find({user: hs.session.user._id, file: {$in: data}}).select('file').exec(this.parallel());
                    PhotoConveyer.find({file: {$in: data}}).select('file').exec(this.parallel());
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
                    var a = {};
                    alreadyInConveyer.forEach(function (item, index) {
                        a[item.file] = 1;
                    });
                    toConvert = [];
                    photos.forEach(function (item, index) {
                        if (!a.hasOwnProperty(item.file)) {
                            toConvert.push({file: item.file, added: Date.now(), converting: false});
                        }
                    });
                    PhotoConveyer.collection.insert(toConvert, this);
                },

                function () {
                    result({message: toConvert.length + ' photos added to convert conveyer'});
                    conveyerControl();
                }

            );
        });
    });


};