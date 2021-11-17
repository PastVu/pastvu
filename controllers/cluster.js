import _ from 'lodash';
import log4js from 'log4js';
import Utils from '../commons/Utils';
import constants from './constants.js';
import { waitDb } from './connection';
import { Photo } from '../models/Photo';
import { Cluster, ClusterPaint, ClusterParams } from '../models/Cluster';
import { ApplicationError, AuthorizationError, BadParamsError } from '../app/errors';
import { runJob } from './queue';

const logger = log4js.getLogger('cluster.js');

let clusterParams; // Parameters of cluster
let clusterConditions; // Parameters of cluster settings

async function readClusterParams() {
    [clusterParams, clusterConditions] = await Promise.all([
        ClusterParams.find({ sgeo: { $exists: false } }, { _id: 0 }, { lean: true, sort: { z: 1 } }).exec(),
        ClusterParams.findOne({ sgeo: { $exists: true } }, { _id: 0 }, { lean: true }).exec(),
    ]);
}

/**
 * Compute cluster left top corner coordinates.
 *
 * @param {Array} geoPhoto geo coordiante pair of photo [lng, lat]
 * @param {object} clusterZoom zoom parameters
 * @returns {Array} geo coordiante pair of cluster [lng, lat]
 */
function computeClusterCoords(geoPhoto, clusterZoom) {
    // Correction for the cluster.
    // Since the clusters are calculated with binary rounding (>>), we must substruct 1 for negative lng
    // Since the cluster display goes from the top corner, we need add 1 positive lat
    const geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0];

    return Utils.geo.geoToPrecisionRound([
        clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]),
        clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1]),
    ]);
}

/**
 * Set new cluster parameters and send clusters to recalculate.
 *
 * @param {object} params
 * @param {object} [params.params]
 * @param {object} [params.conditions]
 * @returns {object} Data object returned by clusterPhotosAll.
 */
async function recalcAll({ params, conditions }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    await ClusterParams.deleteMany({});
    await Promise.all([
        ClusterParams.insertMany(params),
        ClusterParams.insertMany(conditions),
    ]);
    await readClusterParams();

    const result = await runJob('clusterPhotosAll', { withGravity: true });

    if (result && result.error) {
        throw new ApplicationError({ message: result.error.message });
    }

    // This function used to trigger photosToMapAll db stored function,
    // which does not seem required as photo coordinates are not affected by
    // clusters calculation.
    return result;
}

/**
 * Cluster photos.
 * Used by clusterPhotosAll job in userjobs queue.
 *
 * @param {object} params
 * @param {boolean} [params.withGravity]
 * @param {number} [params.logByNPhotos] How often to log progress
 * @param {number[]} [params.zooms] Limit to specified zooms
 * @returns {object} object containing message and data.
 */
export const clusterPhotosAll = async function (params) {
    const clusterparamsQuery = { sgeo: { $exists: false } };

    if (params.zooms) {
        clusterparamsQuery.z = { $in: params.zooms };
    }

    const clusterZooms = await ClusterParams.find(clusterparamsQuery, { _id: 0 }).sort({ z: 1 }).exec();

    const photosAllCount = await Photo.countDocuments({ s: constants.photo.status.PUBLIC, geo: { $exists: true } });
    const logByNPhotos = params.logByNPhotos || photosAllCount / 20 >> 0;
    const withGravity = params.withGravity || false;

    logger.info(`clusterPhotosAll: Start to clusterize ${photosAllCount} photos, progress is logged every ${logByNPhotos}. Gravity: ${withGravity}`);

    for (const clusterZoom of clusterZooms) {
        await clusterizeZoom(clusterZoom);
    }

    async function clusterizeZoom(clusterZoom) {
        const startTime = Date.now();
        let timestamp;

        let photoCounter = 0;

        const clusters = {};
        let clustersCount = 0;
        const clustersArr = [];
        let clustersArrLastIndex = 0;
        let clustersInserted = 0;

        const sorterByCount = function (a, b) {
            return a.c === b.c ? 0 : a.c < b.c ? 1 : -1;
        };

        clusterZoom.wHalf = Utils.math.toPrecisionRound6(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound6(clusterZoom.h / 2);

        const useGravity = withGravity && clusterZoom.z > 11;

        clustersArr.push([]);

        // Use cursor.
        const photos = Photo.find({ s: constants.photo.status.PUBLIC, geo: { $exists: true } }, { _id: 0, geo: 1, year: 1, year2: 1 });

        for await (const photo of photos) {
            photoCounter++;

            const geoPhoto = photo.geo;
            const g = computeClusterCoords(geoPhoto, clusterZoom);
            const clustCoordId = g[0] + '@' + g[1];
            let cluster = clusters[clustCoordId];

            // Create cluster.
            if (cluster === undefined) {
                clustersCount++;
                clusters[clustCoordId] = cluster = {
                    g,
                    z: clusterZoom.z,
                    geo: [g[0] + clusterZoom.wHalf, g[1] - clusterZoom.hHalf],
                    c: 0,
                    y: {},
                    p: null,
                };

                if (clustersArr[clustersArrLastIndex].push(cluster) > 249) {
                    // Create next batch.
                    clustersArr.push([]);
                    clustersArrLastIndex++;
                }
            }

            cluster.c += 1;
            cluster.y[photo.year] = 1 + (cluster.y[photo.year] | 0);

            if (useGravity) {
                cluster.geo[0] += geoPhoto[0];
                cluster.geo[1] += geoPhoto[1];
            }

            if (photoCounter % logByNPhotos === 0) {
                timestamp = (Date.now() - startTime) / 1000;
                logger.info(`clusterPhotosAll: ${clusterZoom.z}: Clusterized ${photoCounter}/${photosAllCount} photos in ` +
                    `${clustersCount} clusters in ${timestamp}s`);
            }
        }

        logger.info(`clusterPhotosAll: ${clusterZoom.z}: ${clustersCount} clusters ready for inserting`);
        await Cluster.deleteMany({ z: clusterZoom.z });

        let clustersCounter = clustersArr.length;

        while (clustersCounter) {
            const clustersArrInner = clustersArr[--clustersCounter];

            clustersArrInner.sort(sorterByCount);

            let clustersCounterInner = clustersArrInner.length;

            if (clustersCounterInner > 0) {
                while (clustersCounterInner) {
                    // Post-process cluster.
                    const cluster = clustersArrInner[--clustersCounterInner];

                    if (useGravity) {
                        cluster.geo = Utils.geo.geoToPrecisionRound([
                            cluster.geo[0] / (cluster.c + 1),
                            cluster.geo[1] / (cluster.c + 1),
                        ]);
                    }

                    Utils.geo.normalizeCoordinates(cluster.geo);
                    Utils.geo.normalizeCoordinates(cluster.g);

                    // Link it to photo that will represent cluster.
                    cluster.p = await Photo.findOne({
                        s: constants.photo.status.PUBLIC,
                        geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: cluster.geo } } },
                    }, {
                        _id: 0,
                        cid: 1,
                        geo: 1,
                        file: 1,
                        dir: 1,
                        title: 1,
                        year: 1,
                        year2: 1,
                    }).exec();
                }
            }

            // Record current batch of clusters.
            await Cluster.insertMany(clustersArrInner);
            clustersInserted += clustersArrInner.length;

            const timestamp = (Date.now() - startTime) / 1000;

            logger.info(`clusterPhotosAll: ${clusterZoom.z}: Inserted ${clustersInserted}/${clustersCount} clusters in ${timestamp}s`);
        }
    }

    const clustersCount = await Cluster.estimatedDocumentCount();

    return {
        data: { photos: photosAllCount, clusters: clustersCount },
    };
};

async function clusterRecalcByPhoto(g, zParam, geoPhotos, yearPhotos, isPainting) {
    const ClusterModel = isPainting ? ClusterPaint : Cluster;
    const $update = { $set: {} };

    Utils.geo.normalizeCoordinates(g);

    const cluster = await ClusterModel.findOne(
        { g, z: zParam.z }, { _id: 0, c: 1, geo: 1, y: 1, p: 1 }, { lean: true }
    ).exec();

    const c = _.get(cluster, 'c', 0);
    const yCluster = _.get(cluster, 'y', {});
    let geoCluster = _.get(cluster, 'geo');
    let inc = 0;

    if (!geoCluster) {
        geoCluster = [g[0] + zParam.wHalf, g[1] - zParam.hHalf];
        Utils.geo.normalizeCoordinates(geoCluster);
    }

    if (geoPhotos.o) {
        inc -= 1;
    }

    if (geoPhotos.n) {
        inc += 1;
    }

    if (cluster && c <= 1 && inc === -1) {
        // If after deletion photo from cluster, cluster become empty - remove it
        return ClusterModel.deleteMany({ g, z: zParam.z }).exec();
    }

    if (inc !== 0) {
        $update.$inc = { c: inc };
    }

    if (yearPhotos.o !== yearPhotos.n) {
        if (yearPhotos.o && yCluster[yearPhotos.o] !== undefined && yCluster[yearPhotos.o] > 0) {
            yCluster[yearPhotos.o] -= 1;

            if (yCluster[yearPhotos.o] < 1) {
                delete yCluster[yearPhotos.o];
            }
        }

        if (yearPhotos.n) {
            yCluster[String(yearPhotos.n)] = 1 + (yCluster[String(yearPhotos.n)] | 0);
        }

        $update.$set.y = yCluster;
    }

    // Such a situation shouldn't be
    // It means that photo before coordinate change has already had coordinate, but it was not participate in cluster
    if (geoPhotos.o && !c) {
        logger.warn('Strange. While recluster photo trying to remove it old geo from unexisting cluster.');
    }

    if (zParam.z > 11) {
        // If you are on the scale, where center of gravity must be calculated,
        // then if old coordinate exists, subtract it, and if new exists - augment it
        // If both transferred, means that coordinate changed within a single cell
        // If coordinate didn't transferred, then just change poster
        if (geoPhotos.o && c) {
            geoCluster = Utils.geo.geoToPrecisionRound([
                (geoCluster[0] * (c + 1) - geoPhotos.o[0]) / c,
                (geoCluster[1] * (c + 1) - geoPhotos.o[1]) / c,
            ]);
        }

        if (geoPhotos.n) {
            geoCluster = Utils.geo.geoToPrecisionRound([
                (geoCluster[0] * (c + 1) + geoPhotos.n[0]) / (c + 2),
                (geoCluster[1] * (c + 1) + geoPhotos.n[1]) / (c + 2),
            ]);
        }

        Utils.geo.normalizeCoordinates(geoCluster);
    }

    const photo = await Photo.findOne(
        {
            s: constants.photo.status.PUBLIC, geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: geoCluster } } },
            type: isPainting ? constants.photo.type.PAINTING : constants.photo.type.PHOTO,
        },
        { _id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1 },
        { lean: true }
    ).exec();

    $update.$set.p = photo;
    $update.$set.geo = geoCluster;

    const { n: count = 0 } = await ClusterModel.updateOne({ g, z: zParam.z }, $update, { upsert: true }).exec();

    return count;
}

/**
 * Create cluster for new photo coordinates
 *
 * @param {object} obj
 * @param {object} obj.photo Photo
 * @param {number[]} obj.geoPhotoOld Geo coordinates before changes
 * @param {number} obj.yearPhotoOld Year of photo before changes
 * @param {boolean} obj.isPainting
 */
export async function clusterPhoto({ photo, geoPhotoOld, yearPhotoOld, isPainting }) {
    if (!photo.year) {
        throw new BadParamsError();
    }

    let g; // Coordinates of top left corner of cluster for new coordinates
    let gOld;
    let clusterZoom;
    const recalcPromises = [];
    const geoPhoto = photo.geo; // New photo coordiate, which has been already saved in db

    if (_.isEmpty(geoPhotoOld)) {
        geoPhotoOld = undefined;
    }

    for (let i = clusterParams.length; i--;) {
        clusterZoom = clusterParams[i];
        clusterZoom.wHalf = Utils.math.toPrecisionRound(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound(clusterZoom.h / 2);

        // Compute cluster for old and new coordinates if they exests
        if (geoPhotoOld) {
            gOld = computeClusterCoords(geoPhotoOld, clusterZoom);
        }

        if (geoPhoto) {
            g = computeClusterCoords(geoPhoto, clusterZoom);
        }

        if (gOld && g && gOld[0] === g[0] && gOld[1] === g[1]) {
            // If old and new coordinates exists, and on this scale cluster for them the same
            // so if coordinate didn't change, recalculate only poster,
            // but if changed - recalculate gravity (substruct old, add new one)
            if (geoPhotoOld[0] === geoPhoto[0] && geoPhotoOld[1] === geoPhoto[1]) {
                recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, {}, { o: yearPhotoOld, n: photo.year }, isPainting));
            } else {
                recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, { o: geoPhotoOld, n: geoPhoto }, {
                    o: yearPhotoOld,
                    n: photo.year,
                }, isPainting));
            }
        } else {
            // If cluster for coordinates changed, or one of coordinate is not exists,
            // then recalculate old and new clusters (if coordinate for them exists)
            if (gOld) {
                recalcPromises.push(clusterRecalcByPhoto(gOld, clusterZoom, { o: geoPhotoOld }, { o: yearPhotoOld }, isPainting));
            }

            if (g) {
                recalcPromises.push(clusterRecalcByPhoto(g, clusterZoom, { n: geoPhoto }, { n: photo.year }, isPainting));
            }
        }
    }

    return Promise.all(recalcPromises);
}

/**
 * Remove photo from clusters
 *
 * @param {object} obj
 * @param {object} obj.photo
 * @param {boolean} obj.isPainting
 */
export function declusterPhoto({ photo, isPainting }) {
    if (!Utils.geo.check(photo.geo) || !photo.year) {
        throw new BadParamsError();
    }

    const geoPhoto = photo.geo;

    return Promise.all(clusterParams.map(clusterZoom => {
        clusterZoom.wHalf = Utils.math.toPrecisionRound(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound(clusterZoom.h / 2);

        const g = computeClusterCoords(geoPhoto, clusterZoom);

        return clusterRecalcByPhoto(g, clusterZoom, { o: geoPhoto }, { o: photo.year }, isPainting);
    }));
}

/**
 * Returns clusters within GeoJSON geometry object bounds.
 *
 * @param {object} param
 * @param {object} param.geometry GeoJSON geometry object (e.g. Polygon)
 * @param {number} param.z Zoom level
 * @param {boolean} param.isPainting
 * @returns {object}
 */
export async function getBounds({ geometry, z, isPainting }) {
    const ClusterModel = isPainting ? ClusterPaint : Cluster;
    const foundClusters = await ClusterModel.find(
        { g: { $geoWithin: { $geometry: geometry } }, z },
        { _id: 0, c: 1, geo: 1, p: 1 },
        { lean: true }
    ).exec();

    const photos = []; // Photos array
    const clusters = [];  // Clusters array

    for (const cluster of foundClusters) {
        if (cluster.c > 1) {
            cluster.geo.reverse(); // Reverse geo
            clusters.push(cluster);
        } else if (cluster.c === 1) {
            photos.push(cluster.p);
        }
    }

    return { photos, clusters };
}

/**
 * Returns clusters within GeoJSON geometry object bounds within given years intervals
 */
export async function getBoundsByYear({ geometry, z, year, year2, isPainting }) {
    const ClusterModel = isPainting ? ClusterPaint : Cluster;
    const foundClusters = await ClusterModel.find(
        { g: { $geoWithin: { $geometry: geometry } }, z },
        { _id: 0, c: 1, geo: 1, y: 1, p: 1 },
        { lean: true }
    ).exec();

    const clustersAll = [];
    const posterPromises = [];
    const yearCriteria = year === year2 ? year : { $gte: year, $lte: year2 };

    for (const cluster of foundClusters) {
        cluster.c = 0;

        for (let y = year; y <= year2; y++) {
            cluster.c += cluster.y[y] | 0;
        }

        if (cluster.c > 0) {
            clustersAll.push(cluster);

            if (cluster.p.year < year || cluster.p.year > year2) {
                posterPromises.push(getClusterPoster(cluster, yearCriteria, isPainting));
            }
        }
    }

    if (posterPromises.length) {
        await Promise.all(posterPromises);
    }

    const photos = []; // Photos array
    const clusters = [];  // Clusters array

    for (const cluster of clustersAll) {
        if (cluster.c > 1) {
            cluster.geo.reverse(); // Reverse geo
            clusters.push(cluster);
        } else if (cluster.c === 1) {
            photos.push(cluster.p);
        }
    }

    return { photos, clusters };
}

async function getClusterPoster(cluster, yearCriteria, isPainting) {
    cluster.p = await Photo.findOne(
        {
            s: constants.photo.status.PUBLIC,
            geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: cluster.geo } } },
            year: yearCriteria,
            type: isPainting ? constants.photo.type.PAINTING : constants.photo.type.PHOTO,
        },
        { _id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1 },
        { lean: true }
    ).exec();

    return cluster;
}

/**
 * Return cluster conditions for client use.
 *
 * @returns {object} object containing result.
 */
function getClusterConditions() {
    return clusterConditions;
}

// After connection to db read current cluster parameters.
waitDb.then(readClusterParams);

recalcAll.isPublic = true;
getClusterConditions.isPublic = true;

export default {
    recalcAll,
    clusterPhoto,
    declusterPhoto,
    getBounds,
    getBoundsByYear,
    getClusterConditions,
};
