'use strict';

var log4js = require('log4js');
var mongoose = require('mongoose');
var logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger('systemjs.js');

    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        //db.user_settings.save({ key: 'photo_watermark_let_download_pure', val: true, vars: [true, false], desc: 'Let other users download photo without watermark' });
        //db.user_settings.save({ key: 'photo_watermark_add_sign', val: true, vars: [true, false, 'custom'], desc: 'Add sign to watermark' });

        db.photos.find({}).forEach(function (photo) {
            var user = db.users.findOne({ _id: photo.user }, { _id: 0, login: 1 });
            if (user) {
                db.photos.update({ cid: photo.cid }, {
                    $set: {
                        watersignText: 'uploaded by ' + user.login,
                        watersignTextApplied: photo.ldate
                    }
                });
            }
        });

        return { message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's' };
    });

    /**
     * Save function to db.system.js
     * @param func
     */
    function saveSystemJSFunc(func) {
        if (!func || !func.name) {
            logger.error('saveSystemJSFunc: function name is not defined');
        }
        db.db.collection('system.js').save(
            {
                _id: func.name,
                value: new mongoose.mongo.Code(func.toString())
            },
            function saveCallback(err) {
                if (err) {
                    logger.error(err);
                }
            }
        );
    }
};
