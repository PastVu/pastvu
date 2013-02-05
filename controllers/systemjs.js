'use strict';

var step = require('step'),
    log4js = require('log4js'),
    mongoose = require('mongoose'),
    logger;

module.exports.loadController = function (app, db) {
    logger = log4js.getLogger("systemjs.js");

    saveSystemJSFunc(function clusterPhoto(cid, newGeo) {
        if (!cid || !newGeo || newGeo.length !== 2) {
            return {message: 'Bad geo params to set cluster', error: true};
        }

        var query = cid ? {'cid': cid} : {},
            clusters = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
            photos = db.photos.find(query, {geo: 1, file: 1}).toArray();

        photos.forEach(function (photo, index, arr) {
            var geo = photo.geo,
                photoExistingClusters = [];

            clusters.forEach(function (item) {
                db.clusters.update({p: photo._id, z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * ((geo[1] / item.h >> 0) + 1)])}, { $inc: {c: -1}, $pull: { p: photo._id } }, {multi: false, upsert: false});
                //photoExistingClusters.push(db.clusters.find({p: photo._id, z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, {_id: 1}).toArray()[0]);
            });
            //printjson(photoExistingClusters);
            clusters.forEach(function (item) {
                db.clusters.update({z: item.z, geo: geoToPrecisionRound([item.w * (newGeo[0] / item.w >> 0), item.h * ((newGeo[1] / item.h >> 0) + 1)])}, { $inc: {c: 1}, $push: { p: photo._id }, $set: {file: photo.file} }, {multi: false, upsert: true});
            });
            return {message: 'Ok', error: false};
        });
    });

    saveSystemJSFunc(function clusterAll() {
        var clusters = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
            photoCounter = 0,
            photoCursor = db.photos.find({geo: {$size: 2}}, {geo: 1, file: 1});

        db.clusters.remove();

        // forEach в данном случае - это честный while по курсору: function (func) {while (this.hasNext()) {func(this.next());}}
        photoCursor.forEach(function (photo) {
            var geo = photo.geo;
            photoCounter++;
            clusters.forEach(function (item) {
                db.clusters.update({z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * ((geo[1] / item.h >> 0) + 1)])}, { $inc: {c: 1}, $push: { p: photo._id }, $set: {file: photo.file} }, {multi: false, upsert: true});
            });
        });

        return {message: 'Ok', photos: photoCounter, clusters: db.clusters.count()};
    });

    saveSystemJSFunc(function toPrecision(number, precision) {
        var divider = Math.pow(10, precision || 6);
        return ~~(number * divider) / divider;
    });

    saveSystemJSFunc(function toPrecisionRound(number, precision) {
        var divider = Math.pow(10, precision || 6);
        return Math.round(number * divider) / divider;
    });

    saveSystemJSFunc(function geoToPrecision(geo, precision) {
        geo.forEach(function (item, index, array) {
            array[index] = toPrecision(item, precision || 6);
        });
        return geo;
    });

    saveSystemJSFunc(function geoToPrecisionRound(geo, precision) {
        geo.forEach(function (item, index, array) {
            array[index] = toPrecisionRound(item, precision || 6);
        });
        return geo;
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
