'use strict';

var path = require('path'),
    async = require('async'),
    imageMagick = require('imagemagick'),
    Settings,
    User,
    Photo,
    PhotoConveyer,
    _ = require('lodash'),
    Utils = require('../commons/Utils.js'),
    step = require('step'),
    log4js = require('log4js'),
    appEnv = {},

    logger = log4js.getLogger("PhotoConverter.js"),
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

module.exports.loadController = function (app, db, io) {
    appEnv = app.get('appEnv');
    Photo = db.model('Photo');
    PhotoConveyer = db.model('PhotoConveyer');
    User = db.model('User');

    setTimeout(function () { conveyerControl(true); }, 2000); // Запускаем конвейер после рестарта сервера
};

module.exports.convertPhoto = function (data, cb) {
    var toConvert = [],
        toConvertObj = [];

    step(
        function () {
            PhotoConveyer.find({file: {$in: data}}).select('file').exec(this);
        },
        function (err, alreadyInConveyer) {
            if (err) {
                if (cb) {
                    cb({message: err && err.message, error: true});
                }
                return;
            }

            toConvert = _.difference(data, _.pluck(alreadyInConveyer, 'file'));
            toConvert.forEach(function (item, index) {
                toConvertObj.push({file: item, added: Date.now(), converting: false});
            });
            PhotoConveyer.collection.insert(toConvertObj, this.parallel());
            Photo.update({file: {$in: toConvert}}, { $set: { convqueue: true }}, { multi: true }, this.parallel());
        },
        function (err) {
            if (err) {
                if (cb) {
                    cb({message: err && err.message, error: true});
                }
                return;
            }
            if (cb) {
                cb({message: toConvertObj.length + ' photos added to convert conveyer'});
            }
            conveyerControl();
        }
    );
};

module.exports.removePhoto = function (data, cb) {
    PhotoConveyer.findOneAndRemove({file: data, converting: false}, function (err, doc) {
        if (cb) {
            cb();
        }
    });
};

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
            step(
                function () {
                    item.converting = true; //Ставим флаг, что конвертация файла началась
                    item.save(this.parallel());
                    Photo.findOneAndUpdate({file: item.file}, { $set: { conv: true }}, { new: true, upsert: false }, this.parallel());
                },
                function (err, photoConv, photo) {
                    conveyerStep(item.file, function () {
                        photo.conv = undefined;
                        photo.convqueue = undefined;
                        photo.save();
                        item.remove(function () {
                            working -= 1;
                            conveyerControl();
                        });

                    });
                }
            );

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
        //logger.info('%s converted in %dms', file, (Date.now() - start));
        cb();
    });
}