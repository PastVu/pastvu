'use strict';

var log4js = require('log4js'),
    mongoose = require('mongoose'),
    logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger("systemjs.js");

    //Подписываем всех пользователей на свои фотографии
    saveSystemJSFunc(function pastvuPatch() {
        var startTime = Date.now();

        print('Set "y" field for ' + db.photos.count() + ' photos');
        // Проставляем поле 'y' для всех фотографий
        db.photos.find({}, { year: 1, year2: 1 }).forEach(function (photo) {
            db.photos.update(
                { _id: photo._id },
                { $set: { y: photo.year === photo.year2 ? String(photo.year) : photo.year + '—' + photo.year2 }, $unset: { cdate: 1, ucdate: 1 } }
            );
        });
        print('Setted. ' + ((Date.now() - startTime) / 1000 + 's'));

        // Удаляем первую версию истории фотографий
        db.photos_history.drop();

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
