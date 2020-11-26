import _ from 'lodash';
import log4js from 'log4js';
import Utils from '../commons/Utils';
import constants from './constants.js';
import { waitDb, dbEval } from './connection';
import { Photo } from '../models/Photo';
import { Cluster, ClusterPaint, ClusterParams } from '../models/Cluster';
import { ApplicationError, AuthorizationError, BadParamsError } from '../app/errors';

const logger = log4js.getLogger('cluster.js');

export let clusterParams; // Parameters of cluster
export let clusterConditions; // Parameters of cluster settings

async function readClusterParams() {
    [clusterParams, clusterConditions] = await Promise.all([
        ClusterParams.find({ sgeo: { $exists: false } }, { _id: 0 }, { lean: true, sort: { z: 1 } }).exec(),
        ClusterParams.find({ sgeo: { $exists: true } }, { _id: 0 }, { lean: true }).exec(),
    ]);
}

// Set new cluster parameters and send clusters to recalculate
async function recalcAll({ params, conditions }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    await ClusterParams.deleteMany({}).exec();
    await Promise.all([
        ClusterParams.collection.insertMany(params, { safe: true }),
        ClusterParams.collection.insertMany(conditions, { safe: true }),
    ]);
    await readClusterParams();
    await dbEval('clusterPhotosAll', [true], { nolock: true });

    const result = await dbEval('photosToMapAll', [], { nolock: true });

    if (result && result.error) {
        throw new ApplicationError({ message: result.error.message });
    }

    return result;
}

async function clusterRecalcByPhoto(g, zParam, geoPhotos, yearPhotos, isPainting) {
    const ClusterModel = isPainting ? ClusterPaint : Cluster;
    const $update = { $set: {} };

    if (g[0] < -180 || g[0] > 180) {
        Utils.geo.spinLng(g);
    }

    const cluster = await ClusterModel.findOne(
        { g, z: zParam.z }, { _id: 0, c: 1, geo: 1, y: 1, p: 1 }, { lean: true }
    ).exec();

    const c = _.get(cluster, 'c', 0);
    const yCluster = _.get(cluster, 'y', {});
    let geoCluster = _.get(cluster, 'geo');
    let inc = 0;

    if (!geoCluster) {
        geoCluster = [g[0] + zParam.wHalf, g[1] - zParam.hHalf];

        if (geoCluster[0] < -180 || geoCluster[0] > 180) {
            Utils.geo.spinLng(geoCluster);
        }
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
                (geoCluster[0] * (c + 1) - geoPhotos.o[0]) / c, (geoCluster[1] * (c + 1) - geoPhotos.o[1]) / c,
            ]);
        }

        if (geoPhotos.n) {
            geoCluster = Utils.geo.geoToPrecisionRound([
                (geoCluster[0] * (c + 1) + geoPhotos.n[0]) / (c + 2),
                (geoCluster[1] * (c + 1) + geoPhotos.n[1]) / (c + 2),
            ]);
        }

        if (geoCluster[0] < -180 || geoCluster[0] > 180) {
            Utils.geo.spinLng(geoCluster);
        }
    }

    const photo = await Photo.findOne(
        {
            s: constants.photo.status.PUBLIC, geo: { $near: geoCluster },
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
 * @param photo Photo
 * @param geoPhotoOld Geo coordinates before changes
 * @param yearPhotoOld Year of photo before changes
 */
export async function clusterPhoto({ photo, geoPhotoOld, yearPhotoOld, isPainting }) {
    if (!photo.year) {
        throw new BadParamsError();
    }

    let g; // Coordinates of top left corner of cluster for new coordinates
    let gOld;
    let clusterZoom;
    let geoPhotoCorrection;
    let geoPhotoOldCorrection;
    const recalcPromises = [];
    const geoPhoto = photo.geo; // New photo coordiate, which has been already saved in db

    if (_.isEmpty(geoPhotoOld)) {
        geoPhotoOld = undefined;
    }

    // Correction for the cluster
    // Since the clusters are calculated with binary rounding (>>), we must substruct 1 for negative lng
    // Since the cluster display goes from the top corner, we need add 1 positive lat
    if (geoPhoto) {
        // Correction for cluster of current coordinates
        geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0];
    }

    if (geoPhotoOld) {
        // Correction for cluster of old coordinates
        geoPhotoOldCorrection = [geoPhotoOld[0] < 0 ? -1 : 0, geoPhotoOld[1] > 0 ? 1 : 0];
    }

    for (let i = clusterParams.length; i--;) {
        clusterZoom = clusterParams[i];
        clusterZoom.wHalf = Utils.math.toPrecisionRound(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound(clusterZoom.h / 2);

        // Compute cluster for old and new coordinates if they exests
        if (geoPhotoOld) {
            gOld = Utils.geo.geoToPrecisionRound([
                clusterZoom.w * ((geoPhotoOld[0] / clusterZoom.w >> 0) + geoPhotoOldCorrection[0]),
                clusterZoom.h * ((geoPhotoOld[1] / clusterZoom.h >> 0) + geoPhotoOldCorrection[1]),
            ]);
        }

        if (geoPhoto) {
            g = Utils.geo.geoToPrecisionRound([
                clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]),
                clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1]),
            ]);
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
 * @param photo
 */
export function declusterPhoto({ photo, isPainting }) {
    if (!Utils.geo.check(photo.geo) || !photo.year) {
        throw new BadParamsError();
    }

    const geoPhoto = photo.geo;
    const geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0];

    return Promise.all(clusterParams.map(clusterZoom => {
        clusterZoom.wHalf = Utils.math.toPrecisionRound(clusterZoom.w / 2);
        clusterZoom.hHalf = Utils.math.toPrecisionRound(clusterZoom.h / 2);

        const g = Utils.geo.geoToPrecisionRound([
            clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]),
            clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1]),
        ]);

        return clusterRecalcByPhoto(g, clusterZoom, { o: geoPhoto }, { o: photo.year }, isPainting);
    }));
}

// Returns clusters within bounds
export async function getBounds({ bounds, z, isPainting }) {
    const ClusterModel = isPainting ? ClusterPaint : Cluster;
    const foundClusters = await Promise.all(bounds.map(bound => ClusterModel.find(
        { g: { $geoWithin: { $box: bound } }, z },
        { _id: 0, c: 1, geo: 1, p: 1 },
        { lean: true }
    ).exec()));

    const photos = []; // Photos array
    const clusters = [];  // Clusters array

    for (const bound of foundClusters) {
        for (const cluster of bound) {
            if (cluster.c > 1) {
                cluster.geo.reverse(); // Reverse geo
                clusters.push(cluster);
            } else if (cluster.c === 1) {
                photos.push(cluster.p);
            }
        }
    }

    return { photos, clusters };
}

// Returns clusters within bounds within given years intervals
export async function getBoundsByYear({ bounds, z, year, year2, isPainting }) {
    const ClusterModel = isPainting ? ClusterPaint : Cluster;
    const foundClusters = await Promise.all(bounds.map(bound => ClusterModel.find(
        { g: { $geoWithin: { $box: bound } }, z },
        { _id: 0, c: 1, geo: 1, y: 1, p: 1 },
        { lean: true }
    ).exec()));

    const clustersAll = [];
    const posterPromises = [];
    const yearCriteria = year === year2 ? year : { $gte: year, $lte: year2 };

    for (const bound of foundClusters) {
        for (const cluster of bound) {
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
            s: constants.photo.status.PUBLIC, geo: { $near: cluster.geo }, year: yearCriteria,
            type: isPainting ? constants.photo.type.PAINTING : constants.photo.type.PHOTO,
        },
        { _id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1 },
        { lean: true }
    ).exec();

    return cluster;
}

// After connection to db read current cluster parameters
waitDb.then(readClusterParams);

recalcAll.isPublic = true;

export default {
    recalcAll,

    clusterPhoto,
    declusterPhoto,
    getBounds,
    getBoundsByYear,
};
