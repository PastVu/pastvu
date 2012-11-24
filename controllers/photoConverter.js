var auth = require('./auth.js'),
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
        uploadDir = __dirname + '/publicContent/photos',
        maxWorking = 3,
        working = 0,
        conveyerTimeout = null,
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

    function conveyerControl() {
        console.log('conveyerControl');
        clearTimeout(conveyerTimeout);
        if (maxWorking - working < 1) {
            return;
        }
        PhotoConveyer.find().sort('-added').limit(maxWorking - working).exec(function (err, files) {
            if (err || files.length === 0) {
                conveyerTimeout = setTimeout(conveyerControl, 2000);
                return;
            }

            files.forEach(function (item, index) {
                working += 1;
                conveyerStep(item.file, function () {
                    working -= 1;
                    PhotoConveyer.remove({file: item.file});
                    conveyerControl();
                });
            });
        });
    }

    function conveyerStep(file, cb) {
        console.log('ConveyerStep');

        var sequence = [];
        imageSequence.forEach(function (item, index, array) {
            var o = {
                srcPath: uploadDir + '/' + (index > 0 ? array[index - 1].version : 'origin') + '/' + file,
                dstPath: uploadDir + '/' + item.version + '/' + file,
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
            console.log(file, 'converted');
            cb();
        });
    }

    conveyerControl(); // Запускаем комвейер после рестарта сервера

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
                function (err, photos, alreadyInConvert) {
                    console.dir(arguments);
                    if (err) {
                        result({message: err && err.message, error: true});
                        return;
                    }
                    if (!photos || photos.length === 0) {
                        result({message: 'No such photos in base', error: true});
                        return;
                    }
                    var a = {};
                    alreadyInConvert.forEach(function (item, index) {
                        a[item.file] = 1;
                    });
                    toConvert = [];
                    photos.forEach(function (item, index) {
                        if (!a.hasOwnProperty(item.file)) {
                            toConvert.push({file: item.file, added: Date.now()});
                        }
                    });
                    console.log('~~~~~');
                    console.dir(toConvert);
                    PhotoConveyer.collection.insert(toConvert, this);
                },

                function () {
                    console.log('wow');
                    conveyerControl();
                    result({message: toConvert.length + ' photos added to convert conveyer'});
                }

            );
        });
    });


};