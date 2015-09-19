'use strict';

var log4js = require('log4js');
var mongoose = require('mongoose');
var logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger('systemjs.js');

    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        db.user_settings.remove({ key: 'photo_watermark_let_download_pure' });
        db.user_settings.save({
            key: 'photo_disallow_download_origin',
            val: false,
            vars: [true, false],
            desc: 'Disallow others users to download photo without watermark'
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
