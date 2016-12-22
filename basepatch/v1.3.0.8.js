'use strict';

const log4js = require('log4js');
const mongoose = require('mongoose');
const logger = log4js.getLogger('systemjs.js');
const waitDb = require('../controllers/connection').waitDb;

waitDb.then(db => {
    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        db.user_settings.save({ key: 'subscr_email_send', val: true, vars: [true, false], desc: 'Send email to user' });

        db.user_settings.save({ key: 'subscr_email_interval', val: 'throttle', vars: [
            'throttle', 'day', 'week'
        ], desc: 'Email send interval variant' });
        db.user_settings.save({ key: 'subscr_email_day', val: 60 * 10, vars: [0, 60 * 24], desc: 'Email send day time in minutes. For instance, 10:30, 60 * 10 + 30' });
        db.user_settings.save({ key: 'subscr_email_week', val: 60 * 10, vars: [0, 60 * 24 * 7], desc: 'Email send week time in minutes. For instance, Monday 10:30, , 2 * (60 * 10 + 30)' });
        db.user_settings.save({ key: 'subscr_email_throttle', val: 180, vars: [
        /*minutes*/ 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
        /*hours*/  60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200, 1260, 1320, 1380,
        /*days*/ 1440, 2880, 4320, 5760, 7200, 8640, 10080
        ], desc: 'Email sending throttle in minutes. Default - 3h, possible range: 5m-7d' });

        db.users.find({'settings.subscr_throttle': { $exists: true }}, { _id: 1, settings: 1 }).forEach(function (user) {
            db.users.update(
                { _id: user._id },
                {
                    $set: {
                        'settings.subscr_email_interval': 'throttle',
                        'settings.subscr_email_throttle': user.settings.subscr_throttle / 60 / 1000
                    },
                    $unset: { 'settings.subscr_throttle': 1 }
                }
            );
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
});
