'use strict';

var log4js = require('log4js');
var mongoose = require('mongoose');
var logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger('systemjs.js');

    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        // Показывать по умолчанию удаленные комментарии
        db.user_settings.save({ key: 'comment_show_deleted', val: false, vars: [true, false], desc: 'Показывать удаленные комментарии' });

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
