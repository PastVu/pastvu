'use strict';

const log4js = require('log4js');
const mongoose = require('mongoose');
const logger = log4js.getLogger('systemjs.js');
const waitDb = require('../controllers/connection').waitDb;

waitDb.then(db => {
    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        // Remove hidden property in favour of s status
        db.comments.update({ hidden: true }, { $unset: { hidden: 1 } }, { multi: true });
        print('Comments propery hidden was removed');
        print('Adding path propert to photos');

        // Add path property to photo
        db.photos.find({}, { _id: 0, cid: 1, file: 1 }).forEach(function (photo) {
            db.photos.update({ cid: photo.cid }, { $set: { path: photo.file } });
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
