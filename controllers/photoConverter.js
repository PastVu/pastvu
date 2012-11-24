var auth = require('./auth.js'),
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
        conveyerStack = [],
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

    function conveyerStep() {
        console.log(9999);
        PhotoConveyer.find().sort('-added').limit(3).exec(function (err, files) {
            console.dir(arguments);
        });

    }

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
                    conveyerStep();
                    result({message: toConvert.length + ' photos added to convert conveyer'});

                }

            );
        });
    });


};