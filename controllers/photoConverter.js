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
        PhotoConveyer.find().exec(function (err, files) {
            console.dir(arguments);
        });

    }

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake;

        socket.on('convertPhoto', function (data) {
            var result = function (data) {
                socket.emit('convertPhotoResult', data);
            };
            if (!hs.session.user) {
                result({message: 'Not authorized', error: true});
            }
            if (!Utils.isObjectType('array', data) || data.length === 0) {
                result({message: 'Bad params', error: true});
            }

            Photo.find({user: hs.session.user._id, file: {$in: data}}, function (err, photos) {
                if (err) {
                    result({message: err && err.message, error: true});
                    return;
                }
                if (!photos || photos.length === 0) {
                    result({message: 'No such photos in base', error: true});
                    return;
                }
                step(
                    function () {
                        photos.forEach(function (item, index) {
                            conveyerStack.push(item.file);
                            new PhotoConveyer({
                                file: item.file+""
                            }).save(this.parallel());
                        });
                        //PhotoConveyer.update({_id: 'photo'}, {$inc: { next: 1 }}, {upsert: true}, function (err) { if (err) { console.log('Counter photo' + err); } });
                    },
                    function () {
                        conveyerStep();
                        result({message: photos.length + ' photos added to convert conveyer'});

                    }
                );
            });

        });
    });


};