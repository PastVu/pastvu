/* eslint no-var: 0, object-shorthand: [2, 'never'] */
/*
 global linkifyUrlString: true, toPrecision: true, toPrecision6: true, toPrecisionRound:true,
 geoToPrecision:true, spinLng:true, regionClearPhotoTitle:true,
 regionsAssignPhotos:true, regionsAssignComments:true, calcPhotoStats:true,, calcUserStats:true, calcRegionStats:true
 */

/**
 * This file is not being transformed by babel
 * @type {*|exports|module.exports}
 */

const log4js = require('log4js');
const mongoose = require('mongoose');
const connection = require('./connection');

const waitDb = connection.waitDb;
const logger = log4js.getLogger('systemjs.js');

waitDb.then(db => {
    // Save function to db.system.js
    function saveSystemJSFunc(func) {
        if (!func || !func.name) {
            logger.error('saveSystemJSFunc: function name is not defined');
        }

        db.db.collection('system.js').save(
            {
                _id: func.name,
                value: new mongoose.mongo.Code(func.toString()),
            },
            function saveCallback(err) {
                if (err) {
                    logger.error(err);
                }
            }
        );
    }

    // Re-generate photo map.
    saveSystemJSFunc(function photosToMapAll() {
        var startTime = Date.now();

        print('Clearing photos map collection');
        db.photos_map.deleteMany({});

        print('Start to fill conveyer for ' + db.photos.countDocument({ s: 5, type: 1, geo: { $exists: true } }) + ' photos');
        db.photos
            .find({ s: 5, type: 1, geo: { $exists: true } }, {
                _id: 0,
                cid: 1,
                geo: 1,
                file: 1,
                dir: 1,
                title: 1,
                year: 1,
                year2: 1,
            })
            .sort({ cid: 1 })
            .forEach(photo => {
                db.photos_map.insertOne({
                    cid: photo.cid,
                    geo: photo.geo,
                    file: photo.file,
                    dir: photo.dir || '',
                    title: photo.title || '',
                    year: photo.year || 2000,
                    year2: photo.year2 || photo.year || 2000,
                });
            });

        print('Clearing paintings map collection');
        db.paintings_map.deleteMany({});
        print('Start to fill conveyer for ' + db.photos.countDocuments({ s: 5, type: 2, geo: { $exists: true } }) + ' paintings');
        db.photos
            .find({ s: 5, type: 2, geo: { $exists: true } }, {
                _id: 0,
                cid: 1,
                geo: 1,
                file: 1,
                dir: 1,
                title: 1,
                year: 1,
                year2: 1,
            })
            .sort({ cid: 1 })
            .forEach(photo => {
                db.paintings_map.insertOne({
                    cid: photo.cid,
                    geo: photo.geo,
                    file: photo.file,
                    dir: photo.dir || '',
                    title: photo.title || '',
                    year: photo.year || 1980,
                    year2: photo.year2 || photo.year || 1980,
                });
            });

        return { message: db.photos_map.estimatedDocumentCount() + db.paintings_map.estimatedDocumentCount() + ' photos to map added in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    saveSystemJSFunc(function calcUserPhotoCommentsRegionsStat() {
        var startTime = Date.now();

        calcPhotoStats();
        // calcUserStats(); Moved to session queue, see session.calcUserStats
        regionsAssignPhotos();
        regionsAssignComments();
        calcRegionStats();

        return { message: 'All finished in ' + (Date.now() - startTime) / 1000 + 's.' };
    });

    // Для фотографий с координатой заново расчитываем регионы
    saveSystemJSFunc(function regionsAssignPhotos(clearBefore) {
        var startTime = Date.now();
        var query = { cid: { $ne: 1000000 } };
        var parentRegionsSet = new Set();
        var maxRegionLevel = 5;
        var modifiedCounter = 0;

        if (clearBefore) {
            print('Clearing current regions assignment\n');
            db.photos.updateMany(
                { geo: { $exists: true } }, { $unset: { r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 } }
            );
        }

        // For each level starting from maximum
        for (var level = maxRegionLevel; level >= 0; level--) {
            var regionsCounter = 0;

            query.parents = { $size: level };

            print('Starting objects assignment to ' + db.regions.countDocuments(query) + ' regions at ' + level + 'th level...');
            db.regions.find(query, { _id: 0, cid: 1, parents: 1, geo: 1, title_en: 1 }).forEach(region => {
                var startTime = Date.now();
                var query = { geo: { $geoWithin: { $geometry: region.geo } } };
                var $update = { $set: { ['r' + level]: region.cid } };
                var hasChildren = parentRegionsSet.has(region.cid);
                var i;

                region.parents.forEach((cid, index) => {
                    $update.$set['r' + index] = cid;
                });

                if (hasChildren) {
                    // Region has children, so try to update only photos that are not assigned to any of its children,
                    // because such photos already have all regions assigned all the way up, inluding current region
                    for (i = level + 1; i <= maxRegionLevel; i++) {
                        query['r' + i] = null;
                    }
                } else {
                    // Final region, no children, so nullify all possible assignment to subregions
                    if (level < maxRegionLevel) {
                        $update.$unset = {};
                    }

                    for (i = level + 1; i <= maxRegionLevel; i++) {
                        $update.$unset['r' + i] = 1;
                    }

                    if (region.parents) {
                        region.parents.forEach(cid => {
                            parentRegionsSet.add(cid);
                        });
                    }
                }

                var updated = db.photos.updateMany(query, $update);

                modifiedCounter += updated.nModified;

                print('[r' + level + '.' + ++regionsCounter + '] Modified ' + updated.nModified + ' (matched ' + updated.nMatched + ') photos in ' + region.cid + ' ' + region.title_en + ' region ' + (hasChildren ? '(has children) ' : '') + 'in ' + (Date.now() - startTime) / 1000 + 's');
            });

            if (level) {
                print('Modified ' + modifiedCounter + ' photos so far\n');
            }
        }

        // Set Open sea to photos without top region
        db.photos.updateMany(
            { r0: null, geo: { $exists: true } },
            { $set: { r0: 1000000 }, $unset: { r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 } }
        );

        return { message: 'Assigning finished in ' + (Date.now() - startTime) / 1000 + 's. Modified ' + modifiedCounter + ' photos' };
    });

    // Для фотографий с координатой заново расчитываем регионы
    // TOO slow, use regionsAssignPhotos instead
    saveSystemJSFunc(function regionsAssignPhotosOld(cids) {
        if (!cids) {
            return;
        }

        var startTime = Date.now();
        var maxRegionLevel = 5;


        var query = { geo: { $exists: true } };
        var fields = { _id: 0, cid: 1, geo: 1 };
        var regionFields = { _id: 0, cid: 1, parents: 1 };

        if (cids && cids.length) {
            query.cid = { $in: cids };
        }

        for (var i = 0; i <= maxRegionLevel; i++) {
            fields['r' + i] = 1;
        }

        var counter = 0;
        var counterUpdated = 0;
        var count = db.photos.countDocuments(query);

        print('Starting iteration over ' + db.photos.countDocuments(query) + ' photos..');
        db.photos.find(query, fields).sort({ cid: 1 }).forEach(photo => {
            var regions = db.regions.find(
                { geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: photo.geo }, $maxDistance: 1 } } },
                regionFields
            ).sort({ parents: -1 }).limit(1).toArray();

            var region = regions[0];
            var regionCids = region ? (region.parents || []).concat(region.cid) : [1000000];

            var r;
            var regionCid;
            var $set = {};
            var $unset = {};
            var $update = {};
            var setCounter = 0;
            var unsetCounter = 0;

            for (var i = 0; i <= maxRegionLevel; i++) {
                r = 'r' + i;
                regionCid = regionCids[i];

                if (regionCid) {
                    if (photo[r] !== regionCid) {
                        $set[r] = regionCid;
                        setCounter++;
                    }
                } else if (photo[r]) {
                    $unset[r] = 1;
                    unsetCounter++;
                }
            }

            if (setCounter > 0) {
                $update.$set = $set;
            }

            if (unsetCounter > 0) {
                $update.$unset = $unset;
            }

            if (setCounter > 0 || unsetCounter > 0) {
                counterUpdated++;
                db.photos.updateOne({ cid: photo.cid }, $update);
            }

            counter++;

            if (counter && counter % 2000 === 0 || counter === count) {
                print((Date.now() - startTime) / 1000 + 's Calculated ' + counter + ' photos (' + counterUpdated + ' updated)');
            }
        });

        return { message: 'Photo assigning finished in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Присваиваем регионы и координаты комментариям фотографий
    saveSystemJSFunc(function regionsAssignComments() {
        var startTime = Date.now();
        var photoCounter = 0;
        var maxRegionLevel = 5;

        print('Assign regions to comments for ' + db.photos.countDocuments({ s: { $gte: 5 } }) + ' published photos');
        db.photos.find(
            { s: { $gte: 5 } }, { _id: 1, geo: 1, r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 }
        ).forEach(photo => {
            var r;
            var $set = {};
            var $unset = {};
            var $update = {};
            var setCounter = 0;
            var unsetCounter = 0;

            for (var i = 0; i <= maxRegionLevel; i++) {
                r = 'r' + i;

                if (photo[r]) {
                    $set[r] = photo[r];
                    setCounter++;
                } else {
                    $unset[r] = 1;
                    unsetCounter++;
                }
            }

            if (photo.geo) {
                $set.geo = photo.geo;
                setCounter++;
            } else {
                $unset.geo = 1;
                unsetCounter++;
            }

            if (setCounter > 0) {
                $update.$set = $set;
            }

            if (unsetCounter > 0) {
                $update.$unset = $unset;
            }

            if (setCounter > 0 || unsetCounter > 0) {
                db.comments.updateMany({ obj: photo._id }, $update);
            }

            photoCounter++;

            if (photoCounter % 1000 === 0) {
                print(
                    'Assigned comments for ' + photoCounter + ' published photos. ' +
                    'Cumulative time: ' + (Date.now() - startTime) / 1000 + 'ms'
                );
            }
        });

        return { message: 'All assigning finished in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Расчет центров регионов
    //withManual - Всех регионов, включая тех, у кого центр установлен вручную
    saveSystemJSFunc(function regionsCalcCenter(withManual) {
        var startTime = Date.now();
        var query = { cid: { $ne: 1000000 } };

        if (!withManual) {
            query.$or = [
                { centerAuto: true },
                { centerAuto: null },
            ];
        }

        print('Start to calc center for ' + db.regions.countDocuments(query) + ' regions..\n');
        db.regions.find(query, { _id: 0, cid: 1, geo: 1, bbox: 1 }).forEach(region => {
            if (region.geo && (region.geo.type === 'MultiPolygon' || region.geo.type === 'Polygon')) {
                db.regions.updateOne({ cid: region.cid }, {
                    $set: {
                        center: geoToPrecision(region.geo.type === 'MultiPolygon' ?
                            [(region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2] :
                            polyCentroid(region.geo.coordinates[0])),
                        centerAuto: true,
                    },
                });
            } else {
                print('Error with ' + region.cid + ' region');
            }
        });

        function polyCentroid(points) {
            var pointsLen = points.length;
            var i = 0;
            var j = pointsLen - 1;
            var f;
            var x = 0;
            var y = 0;
            var area = 0;
            var p1;
            var p2;

            for (i; i < pointsLen; j = i++) {
                p1 = points[i];
                p2 = points[j];
                f = p1[1] * p2[0] - p2[1] * p1[0];
                y += (p1[1] + p2[1]) * f;
                x += (p1[0] + p2[0]) * f;

                area += p1[1] * p2[0];
                area -= p1[0] * p2[1];
            }

            area /= 2;
            f = area * 6;

            return [x / f, y / f];
        }

        return { message: 'All finished in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Расчет bbox регионов
    saveSystemJSFunc(function regionsCalcBBOX() {
        var startTime = Date.now();
        var query = { cid: { $ne: 1000000 } };

        print('Start to calc bbox for ' + db.regions.countDocuments(query) + ' regions..\n');
        db.regions.find(query, { _id: 0, cid: 1, geo: 1 }).forEach(region => {
            if (region.geo && (region.geo.type === 'MultiPolygon' || region.geo.type === 'Polygon')) {
                db.regions.updateOne({ cid: region.cid }, { $set: { bbox: polyBBOX(region.geo).map(toPrecision6) } });
            } else {
                print('Error with ' + region.cid + ' region');
            }
        });

        function polyBBOX(geometry) {
            var polybbox;
            var resultbbox;
            var multipolycoords;
            var i;

            if (geometry.type === 'Polygon') {
                resultbbox = getbbox(geometry.coordinates[0]);
            } else if (geometry.type === 'MultiPolygon') {
                i = geometry.coordinates.length;
                multipolycoords = [];

                while (i--) {
                    polybbox = getbbox(geometry.coordinates[i][0]);

                    multipolycoords.push([polybbox[0], polybbox[1]]); //SouthWest
                    multipolycoords.push([polybbox[2], polybbox[1]]); //NorthWest
                    multipolycoords.push([polybbox[2], polybbox[3]]); //NorthEast
                    multipolycoords.push([polybbox[0], polybbox[3]]); //SouthEast
                }

                multipolycoords.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
                multipolycoords.push(multipolycoords[0]);
                resultbbox = getbbox(multipolycoords);
            }

            function getbbox(points) {
                var pointsLen = points.length;
                var j = pointsLen - 1;
                var x1 = points[j][0];
                var y1 = points[j][1];
                var x2;
                var y2;
                var p1;
                var p2;
                var bbox;

                if (x1 === -180) {
                    x1 = 180;
                }

                bbox = [x1, y1, x1, y1];

                for (var i = 0; i < pointsLen - 1; j = i++) {
                    p1 = points[j]; //prev
                    x1 = p1[0];
                    p2 = points[i]; //current
                    x2 = p2[0];
                    y2 = p2[1];

                    if (x1 === -180) {
                        x1 = 180;
                    }

                    if (x2 === -180) {
                        x2 = 180;
                    }

                    if (Math.abs(x2 - x1) <= 180) {
                        if (x2 > x1 && x2 > bbox[2] && Math.abs(x2 - bbox[2]) <= 180) {
                            bbox[2] = x2;
                        } else if (x2 < x1 && x2 < bbox[0] && Math.abs(x2 - bbox[0]) <= 180) {
                            bbox[0] = x2;
                        }
                    } else if (x2 < 0 && x1 > 0 && (x2 > bbox[2] || bbox[2] > 0)) {
                        bbox[2] = x2;
                    } else if (x2 > 0 && x1 < 0 && (x2 < bbox[0] || bbox[0] < 0)) {
                        bbox[0] = x2;
                    }

                    if (y2 < bbox[1]) {
                        bbox[1] = y2;
                    } else if (y2 > bbox[3]) {
                        bbox[3] = y2;
                    }
                }

                return bbox;
            }

            return resultbbox;
        }

        return { message: 'All bbox finished in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Расчет количества вершин полигонов
    saveSystemJSFunc(function regionsCalcPointsNum(cidArr) {
        var startTime = Date.now();
        var query = {};

        if (Array.isArray(cidArr) && cidArr.length) {
            query.cid = cidArr.length === 1 ? cidArr[0] : { $in: cidArr };
        }

        function calcGeoJSONPointsNumReduce(previousValue, currentValue) {
            return previousValue + (Array.isArray(currentValue[0]) ? currentValue.reduce(calcGeoJSONPointsNumReduce, 0) : 1);
        }

        print('Start to calculate points number for ' + db.regions.countDocuments(query) + ' regions..\n');
        db.regions.find(query, { cid: 1, geo: 1, title_en: 1 }).sort({ cid: 1 }).forEach(region => {
            var startTime = Date.now();
            var count;

            count = region.geo.type === 'Point' ? 1 : region.geo.coordinates.reduce(calcGeoJSONPointsNumReduce, 0);
            db.regions.updateOne({ cid: region.cid }, { $set: { pointsnum: count } });
            print(count + ': ' + region.cid + ' ' + region.title_en + ' in ' + (Date.now() - startTime) / 1000 + 's');
        });

        print('\n');

        return { message: 'All calculated in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Расчет количества полигонов в регионе {exterior: 0, interior: 0}
    saveSystemJSFunc(function regionsCalcPolygonsNum(cidArr) {
        var startTime = Date.now();
        var query = {};

        if (Array.isArray(cidArr) && cidArr.length) {
            query.cid = cidArr.length === 1 ? cidArr[0] : { $in: cidArr };
        }

        print('Start to calculate polynum for ' + db.regions.countDocuments(query) + ' regions..\n');
        db.regions.find(query, { cid: 1, geo: 1, title_en: 1 }).sort({ cid: 1 }).forEach(region => {
            var polynum;

            if (region.geo.type === 'Polygon' || region.geo.type === 'MultiPolygon') {
                polynum = calcGeoJSONPolygonsNum(region.geo);
            } else {
                polynum = { exterior: 0, interior: 0 };
            }

            db.regions.updateOne({ cid: region.cid }, { $set: { polynum: polynum } });
        });

        function calcGeoJSONPolygonsNum(geometry) {
            var result;
            var res;

            if (geometry.type === 'MultiPolygon') {
                result = { exterior: 0, interior: 0 };

                for (var i = 0, len = geometry.coordinates.length; i < len; i++) {
                    res = polyNum(geometry.coordinates[i]);
                    result.exterior += res.exterior;
                    result.interior += res.interior;
                }
            } else if (geometry.type === 'Polygon') {
                result = polyNum(geometry.coordinates);
            }

            function polyNum(polygons) {
                return { exterior: 1, interior: polygons.length - 1 };
            }

            return result;
        }

        print('\n');

        return { message: 'All calculated in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Убирает название(или массив названий) региона в начале названия фотографии
    saveSystemJSFunc(function regionClearPhotoTitle(regionString) {
        if (!regionString) {
            return { message: 'Error parameter required' };
        }

        var startTime = Date.now();
        var count = 0;
        var regRxp = new RegExp('^(\\s*(?:' + (Array.isArray(regionString) ? regionString.filter(item => !!item).join('|') : regionString) + ')\\s*[\\.,-:]\\s*)(.+)$', 'i');

        db.photos.find({ title: regRxp }, { title: 1 }).forEach(photo => {
            count++;
            db.photos.updateOne({ _id: photo._id }, { $set: { title: photo.title.replace(regRxp, '$2') } });
        });

        return { count: count, message: 'In ' + (Date.now() - startTime) / 1000 + 's' };
    });

    //Убирает названия всех регионов в начале названия всех фотографий
    saveSystemJSFunc(function regionsAllClearPhotoTitle() {
        var startTime = Date.now();
        var counter = 0;
        var renamedCounter = 0;

        print('Start for ' + db.regions.estimatedDocumentCount() + ' regions..\n');
        db.regions.find({}, { _id: 0, title_en: 1, title_local: 1 }).sort({ cid: 1 }).forEach(region => {
            renamedCounter += regionClearPhotoTitle([region.title_en, region.title_local]).count;

            counter++;

            if (counter % 100 === 0) {
                print(
                    'Done ' + counter + ' regions. Renamed ' + renamedCounter + ' photo titles. ' +
                    'Cumulative time: ' + (Date.now() - startTime) / 1000 + 's'
                );
            }
        });

        return { message: 'Renamed ' + renamedCounter + ' photo titles. All done in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    saveSystemJSFunc(function calcUsersObjectsRelStats(userId, objId) {
        var startTime = Date.now();
        var counter = 0;
        var counterUpdated = 0;
        var query = {};

        if (userId) {
            query.user = userId;
        }

        if (objId) {
            query.obj = objId;
        }

        print('0s Start to calc for ' + db.users_objects_rel.countDocuments(query) + ' rels');
        db.users_objects_rel.find(query).sort({ user: 1 }).forEach(rel => {
            counter += 1;

            var commentCollection = rel.type === 'news' ? db.commentsn : db.comments;
            var $update = { $set: {}, $unset: {} };
            var ccountNew;

            if (rel.comments) {
                if (!rel.ccount_new) {
                    rel.ccount_new = 0;
                }

                ccountNew = commentCollection.countDocuments({
                    obj: rel.obj,
                    del: null,
                    stamp: { $gt: rel.comments },
                    user: { $ne: rel.user },
                });

                if (ccountNew !== rel.ccount_new) {
                    if (ccountNew) {
                        $update.$set.ccount_new = ccountNew;
                    } else {
                        $update.$unset.ccount_new = 1;
                    }
                }
            }

            if (!Object.keys($update.$set).length) {
                delete $update.$set;
            }

            if (!Object.keys($update.$unset).length) {
                delete $update.$unset;
            }

            if (Object.keys($update).length) {
                counterUpdated++;
                db.users_objects_rel.updateOne({ _id: rel._id }, $update);
            }

            if (counter % 50000 === 0 && counter) {
                print((Date.now() - startTime) / 1000 + 's Calculated ' + counter + ' rels. Updated: ' + counterUpdated);
            }
        });

        return {
            message: (Date.now() - startTime) / 1000 + 's ' + counter + ' rels statistics were calculated. Updated: ' + counterUpdated,
        };
    });

    saveSystemJSFunc(function calcPhotoStats() {
        var startTime = Date.now();
        var photos = db.photos.find({}, { _id: 1 }).sort({ cid: -1 }).toArray();
        var photo;
        var counter = photos.length;
        var photoCounter = 0;
        var $set;
        var $unset;
        var $update;
        var ccount;
        var cdcount;

        print('Start to calc for ' + counter + ' photos');

        while (counter--) {
            photo = photos[counter];
            $set = {};
            $unset = {};
            $update = {};
            ccount = db.comments.countDocuments({ obj: photo._id, del: null });

            if (ccount > 0) {
                $set.ccount = ccount;
            } else {
                $unset.ccount = 1;
            }

            cdcount = db.comments.countDocuments({ obj: photo._id, del: { $exists: true } });

            if (cdcount > 0) {
                $set.cdcount = cdcount;
            } else {
                $unset.cdcount = 1;
            }

            if (Object.keys($set).length) {
                $update.$set = $set;
            }

            if (Object.keys($unset).length) {
                $update.$unset = $unset;
            }

            db.photos.updateOne({ _id: photo._id }, $update, { upsert: false });

            photoCounter++;

            if (photoCounter % 1000 === 0) {
                print('Calculated stats for ' + photoCounter + ' photos. Cumulative time: ' + (Date.now() - startTime) / 1000 + 'ms');
            }
        }

        return { message: 'Photos statistics were calculated in ' + (Date.now() - startTime) / 1000 + 's' };
    });

    saveSystemJSFunc(function calcRegionStats(cids) {
        var startTime = Date.now();
        var doneCounter = 0;
        var query = {};
        var fields = { _id: 0, cid: 1, parents: 1, photostat: 1, paintstat: 1, cstat: 1 };

        if (cids && cids.length) {
            query.cid = { $in: cids };
        }

        const queueLength = db.region_stat_queue.estimatedDocumentCount();

        if (queueLength) {
            print('Heads up, removing ' + queueLength + ' queue items');

            // Delete photos stat queue first
            db.region_stat_queue.deleteMany({});
        }

        var changeCounter = 0;
        var changeRegionCounter = 0;

        function countChangingValues(current, upcoming) {
            var changedSomething = false;

            if (!current) {
                current = {};
            }

            for (var key in upcoming) {
                if (upcoming[key] !== current[key]) {
                    changeCounter++;
                    changedSomething = true;
                }
            }

            return changedSomething;
        }

        var count = db.regions.countDocuments(query);

        print('Starting stat calculation for ' + count + ' regions');
        db.regions.find(query, fields).sort({ cid: 1 }).forEach(region => {
            var level = region.parents && region.parents.length || 0;
            var regionHasChildren = db.regions.countDocuments({ parents: region.cid }) > 0;

            var queryC = { del: null };
            var queryImage = {};
            var queryPhoto = { type: 1 };
            var queryPaint = { type: 2 };
            var $update = {
                photostat: {
                    all: 0, geo: 0, own: 0, owngeo: 0,
                    s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s7: 0, s9: 0,
                },
                paintstat: {
                    all: 0, geo: 0, own: 0, owngeo: 0,
                    s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s7: 0, s9: 0,
                },
                cstat: {
                    all: 0, del: 0,
                    s5: 0, s7: 0, s9: 0,
                },
            };

            queryC['r' + level] = region.cid;
            queryImage['r' + level] = region.cid;
            queryPhoto['r' + level] = region.cid;
            queryPaint['r' + level] = region.cid;

            // Returns array of objects with count for each image type and status value
            // [{type: 1, count: 9, statuses: {s: 0, count: 7, s: 1, count: 2...}},...]
            var statusesForTypes = db.photos.aggregate([
                { $match: queryImage },
                { $project: { _id: 0, type: 1, s: 1 } },
                { $group: { _id: { type: '$type', status: '$s' }, scount: { $sum: 1 } } },
                { $group: {
                    _id: '$_id.type',
                    statuses: { $push: { s: '$_id.status', count: '$scount' } },
                    count: { $sum: '$scount' },
                } },
                { $project: { type: '$_id', statuses: 1, count: 1 } },
                { $sort: { type: 1 } },
            ]).toArray();

            var photos;
            var paintings;

            if (statusesForTypes) {
                photos = statusesForTypes.find(stat => stat.type === 1);

                paintings = statusesForTypes.find(stat => stat.type === 2);
            }

            if (photos) {
                $update.photostat.all = photos.count;
                photos.statuses.forEach(status => {
                    $update.photostat['s' + status.s] = status.count;
                });
                $update.photostat.geo = db.photos.countDocuments((queryPhoto.geo = { $exists: true }, queryPhoto));

                if (regionHasChildren) {
                    $update.photostat.owngeo = db.photos.countDocuments((queryPhoto['r' + (level + 1)] = null, queryPhoto));
                    $update.photostat.own = db.photos.countDocuments((delete queryPhoto.geo, queryPhoto));
                } else {
                    $update.photostat.owngeo = $update.photostat.geo;
                    $update.photostat.own = $update.photostat.all;
                }
            }

            if (paintings) {
                $update.paintstat.all = paintings.count;
                paintings.statuses.forEach(status => {
                    $update.paintstat['s' + status.s] = status.count;
                });
                $update.paintstat.geo = db.photos.countDocuments((queryPaint.geo = { $exists: true }, queryPaint));

                if (regionHasChildren) {
                    $update.paintstat.owngeo = db.photos.countDocuments((queryPaint['r' + (level + 1)] = null, queryPaint));
                    $update.paintstat.own = db.photos.countDocuments((delete queryPaint.geo, queryPaint));
                } else {
                    $update.paintstat.owngeo = $update.paintstat.geo;
                    $update.paintstat.own = $update.paintstat.all;
                }
            }

            $update.cstat.s5 = db.comments.countDocuments((queryC.s = 5, queryC));
            $update.cstat.s7 = db.comments.countDocuments((queryC.s = 7, queryC));
            $update.cstat.s9 = db.comments.countDocuments((queryC.s = 9, queryC));
            $update.cstat.del = db.comments.countDocuments((delete queryC.s, queryC.del = { $exists: true }, queryC));
            $update.cstat.all = $update.cstat.s5 + $update.cstat.s7 + $update.cstat.s9 + $update.cstat.del;

            db.regions.updateOne({ cid: region.cid }, { $set: $update });

            var currentChangeCounter = changeCounter;

            countChangingValues(region.photostat, $update.photostat);
            countChangingValues(region.paintstat, $update.paintstat);
            countChangingValues(region.cstat, $update.cstat);

            if (changeCounter !== currentChangeCounter) {
                changeRegionCounter++;
            }

            doneCounter++;

            if (doneCounter % 100 === 0) {
                print('Calculated stats for ' + doneCounter + ' region. Cumulative time: ' + (Date.now() - startTime) / 1000 + 's');
            }
        });

        return {
            valuesChanged: changeCounter,
            regionChanged: changeRegionCounter,
            message: 'Regions statistics were calculated for ' + doneCounter + ' regions in ' + (Date.now() - startTime) / 1000 + 's',
        };
    });

    // This method removes local ips from ip_hist which might have been reported accidentally from the reverse proxy
    saveSystemJSFunc(function pruneLocalHistIPs() {
        var startTime = Date.now();
        var locallRemoved = 0;
        var normalFlattened = 0;
        var histRemoved = 0;

        function run(collection) {
            collection.find({}).forEach(({ key, data }) => {
                if (Array.isArray(data.ip_hist)) {
                    var hist = data.ip_hist.reduce((acc, item, i, arr) => {
                        if (item.ip === '127.0.0.1' || item.ip === '::1') {
                            if (acc.length) {
                                if (i === arr.length - 1) {
                                    delete acc[acc.length - 1].off;
                                } else {
                                    acc[acc.length - 1].off = item.off;
                                }
                            }

                            locallRemoved++;
                        } else if (acc.length && item.ip === acc[acc.length - 1].ip) {
                            acc[acc.length - 1].off = item.off;
                            normalFlattened++;
                        } else if (i < arr.length - 1 || item.ip !== data.ip) {
                            acc.push(item);
                        }

                        return acc;
                    }, []);

                    if (!hist.length || hist.length === 1 && hist[0].ip === data.ip) {
                        histRemoved++;
                        collection.updateOne({ key: key }, { $unset: { 'data.ip_hist': 1 } });
                    } else {
                        collection.updateOne({ key: key }, { $set: { 'data.ip_hist': hist } });
                    }
                }
            });
        }

        run(db.sessions);
        run(db.sessions_archive);

        return {
            locallRemoved: locallRemoved,
            normalFlattened: normalFlattened,
            histRemoved: histRemoved,
            message: 'Pruning local loopback ip addresses has been done in ' + (Date.now() - startTime) / 1000 + 's',
        };
    });

    // This method removes repeating agents in history
    saveSystemJSFunc(function pruneHistAgents() {
        var startTime = Date.now();
        var normalFlattened = 0;
        var histRemoved = 0;

        function run(collection) {
            collection.find({}).forEach(({ key, data }) => {
                if (Array.isArray(data.agent_hist)) {
                    var hist = data.agent_hist.reduce((acc, { agent, off }, i, arr) => {
                        var prevAgent = acc[acc.length - 1] && acc[acc.length - 1].agent;

                        if (prevAgent && agent.d === prevAgent.d && agent.os === prevAgent.os &&
                            agent.n === prevAgent.n && agent.v === prevAgent.v) {
                            acc[acc.length - 1].off = off;
                            normalFlattened++;
                        } else if (i < arr.length - 1 || agent.d !== data.agent.d || agent.os !== data.agent.os ||
                            agent.n !== data.agent.n || agent.v !== data.agent.v) {
                            acc.push({ agent: agent, off: off });
                        }

                        return acc;
                    }, []);

                    if (!hist.length) {
                        histRemoved++;
                        collection.updateOne({ key: key }, { $unset: { 'data.agent_hist': 1 } });
                    } else {
                        collection.updateOne({ key: key }, { $set: { 'data.agent_hist': hist } });
                    }
                }
            });
        }

        run(db.sessions);
        run(db.sessions_archive);

        return {
            normalFlattened: normalFlattened,
            histRemoved: histRemoved,
            message: 'Pruning agent history has been done in ' + (Date.now() - startTime) / 1000 + 's',
        };
    });

    saveSystemJSFunc(function toPrecision(number, precision) {
        var divider = Math.pow(10, precision || 6);

        return ~~(number * divider) / divider;
    });
    saveSystemJSFunc(function toPrecision6(number) {
        return toPrecision(number, 6);
    });

    saveSystemJSFunc(function toPrecisionRound(number, precision) {
        var divider = Math.pow(10, precision || 6);

        return Math.round(number * divider) / divider;
    });

    saveSystemJSFunc(function geoToPrecision(geo, precision) {
        geo.forEach((item, index, array) => {
            array[index] = toPrecision(item, precision || 6);
        });

        return geo;
    });

    saveSystemJSFunc(function geoToPrecisionRound(geo, precision) {
        geo.forEach((item, index, array) => {
            array[index] = toPrecisionRound(item, precision || 6);
        });

        return geo;
    });

    saveSystemJSFunc(function spinLng(geo) {
        if (geo[0] < -180) {
            geo[0] += 360;
        } else if (geo[0] > 180) {
            geo[0] -= 360;
        }
    });

    saveSystemJSFunc(function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
        var R = 6371; // Mean radius of the earth in km
        var toRad = Math.PI / 180; // deg2rad below
        var dLat = (lat2 - lat1) * toRad;
        var dLon = (lon2 - lon1) * toRad;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in km
    });

    saveSystemJSFunc(function linkifyUrlString(inputText, target, className) {
        var replacedText;
        var replacePattern1;
        var replacePattern2;

        target = target ? ' target="' + target + '"' : '';
        className = className ? ' class="' + className + '"' : '';

        //URLs starting with http://, https://, or ftp://
        replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gim;
        replacedText = inputText.replace(replacePattern1, '<a href="$1"' + target + className + '>$1</a>');

        //URLs starting with "www." (without // before it, or it'd re-link the ones done above).
        replacePattern2 = /(^|[^/])(www\.[\S]+(\b|$))/gim;
        replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2"' + target + className + '>$2</a>');

        return replacedText;
    });

    saveSystemJSFunc(function inputIncomingParse(txt, spbPhotoShift) {
        var result = String(txt);

        result = result.trim(); //Обрезаем концы

        //www.oldmos.ru/photo/view/22382 ->> <a target="_blank" href="/p/22382">#22382</a>
        result = result.replace(
            // eslint-disable-next-line prefer-regex-literals
            new RegExp('(\\b)(?:https?://)?(?:www.)?oldmos.ru/photo/view/(\\d{1,8})/?(?=[\\s\\)\\.,;>]|$)', 'gi'),
            '$1<a target="_blank" class="sharpPhoto" href="/p/$2">#$2</a>'
        );

        if (spbPhotoShift) {
            //www.oldsp.ru/photo/view/22382 ->> <a target="_blank" href="/p/22382 + spbPhotoShift">#22382 + spbPhotoShift</a>
            result = spbReplace(result);
        }

        result = linkifyUrlString(result, '_blank'); //Оборачиваем url в ahref
        result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
        result = result.replace(/\s+/g, ' '); //Очищаем лишние пробелы

        return result;

        function spbReplace(inputText) {
            var matches = inputText.match(/[\s,.]?(?:http:\/\/)?(?:www\.)?oldsp\.ru\/photo\/view\/(\d{1,8})/gim);
            var shifted;

            if (matches && matches.length > 0) {
                var i = matches.length;

                while (i--) {
                    shifted = parseInt(matches[i].substr(matches[0].lastIndexOf('/') + 1), 10) + spbPhotoShift;

                    if (!isNaN(shifted)) {
                        inputText = inputText.replace(
                            matches[i],
                            ' <a target="_blank" class="sharpPhoto" href="/p/' + shifted + '">#' + shifted + '</a> '
                        );
                    }
                }
            }

            return inputText;
        }
    });
});
