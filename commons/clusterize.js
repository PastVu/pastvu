db.system.js.save(
    {
        _id: "setPhotoGeoCluster",
        value: function (cid, newGeo) {
            if (!cid || !newGeo || newGeo.length !== 2) {
                return {message: 'Bad params', error: true};
            }
            var query = cid ? {'cid': cid} : {},
                clusters = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
                photos = db.photos.find(query, {cid: 1, geo: 1, file: 1}).toArray();
            photos.forEach(function (photo, index, arr) {
                print('~~~~~~~~ ' + photo._id + ' ~~~~~~~~');
                var geo = photo.geo,
                    photoExistingClusters = [];
                printjson(geo);
                clusters.forEach(function (item) {
                    db.clusters.update({p: photo._id, z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, { $inc: {c: -1}, $pull: { p: photo._id } }, {multi: false, upsert: false});
                    photoExistingClusters.push(db.clusters.find({p: photo._id, z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, {_id: 1}).toArray()[0]);
                });
                printjson(photoExistingClusters);
                photoExistingClusters = [];
                if (newGeo) {
                    clusters.forEach(function (item) {
                        db.clusters.update({z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, { $inc: {c: 1}, $push: { p: photo._id } }, {multi: false, upsert: true});
                        photoExistingClusters.push(db.clusters.find({p: photo._id, z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, {_id: 1}).toArray()[0]);
                    });
                }
                printjson(photoExistingClusters);
            });
        }
    }
);
db.system.js.save(
    {
        _id: "recalcCluster",
        value: function () {
            var clusters = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
                photos = db.photos.find({geo: {$size: 2}}, {cid: 1, geo: 1, file: 1}).toArray();
            db.clusters.drop();
            print('~~~~~~~~ ' + photos.length + ' ~~~~~~~~');
            photos.forEach(function (photo, index, arr) {
                var geo = photo.geo;
                clusters.forEach(function (item) {
                    db.clusters.update({z: item.z, geo: geoToPrecisionRound([item.w * (geo[0] / item.w >> 0), item.h * (geo[1] / item.h >> 0)])}, { $inc: {c: 1}, $push: { p: photo._id } }, {multi: false, upsert: true});
                });
            });
        }
    }
);
db.system.js.save(
    {
        _id: "geoToPrecision",
        value: function geoToPrecision(geo, precision) {
            geo.forEach(function (item, index, array) {
                array[index] = toPrecision(item, precision || 6);
            });
            return geo;
        }
    }
);
db.system.js.save(
    {
        _id: "geoToPrecisionRound",
        value: function geoToPrecisionRound(geo, precision) {
            geo.forEach(function (item, index, array) {
                array[index] = toPrecisionRound(item, precision || 6);
            });
            return geo;
        }
    }
);
db.system.js.save(
    {
        _id: "toPrecision",
        value: function toPrecision(number, precision) {
            var divider = Math.pow(10, precision || 6);
            return ~~(number * divider) / divider;
        }
    }
);
db.system.js.save(
    {
        _id: "toPrecisionRound",
        value: function toPrecisionRound(number, precision) {
            var divider = Math.pow(10, precision || 6);
            return Math.round(number * divider) / divider;
        }
    }
);
