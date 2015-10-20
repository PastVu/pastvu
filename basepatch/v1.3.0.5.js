'use strict';

const log4js = require('log4js');
const mongoose = require('mongoose');
const logger = log4js.getLogger('systemjs.js');
const waitDb = require('../controllers/connection').waitDb;

waitDb.then(db => {
    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();
        var counter = 0;

        db.comments.find({}, { obj: 1 }).forEach(function (comment) {
            var photo = db.photos.findOne({ _id: comment.obj }, { _id: 0, s: 1 });

            if (photo && photo.s !== undefined) {
                db.comments.update({ _id: comment._id }, { $set: { s: photo.s } });
            } else {
                print('No photo ' + comment.obj + ' ' + photo);
            }

            if (++counter % 10000 === 0) {
                print('+' + ((Date.now() - startTime) / 1000) + 's  ' + counter);
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
});