'use strict';

const log4js = require('log4js');
const mongoose = require('mongoose');
const logger = log4js.getLogger('systemjs.js');
const waitDb = require('../controllers/connection').waitDb;

waitDb.then(db => {
    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        // What types of photos show by default in galleries
        db.user_settings.save({ key: 'photo_filter_type', val: [1, 2], vars: [1, 2], desc: 'Default filtering by photos type' });

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
});
