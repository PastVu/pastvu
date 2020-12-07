import ms from 'ms';
import _ from 'lodash';
import log4js from 'log4js';
import config from '../config';
import Utils from '../commons/Utils';
import { polygon as turfPolygon } from '@turf/turf';
import turfIntersect from '@turf/intersect';
import geojsonRewind from 'geojson-rewind';
import geojsonHint from '@mapbox/geojsonhint';
import geojsonArea from '@mapbox/geojson-area';
import { waitDb, dbEval } from './connection';
import constants from './constants.js';
import * as _session from './_session.js';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Comment } from '../models/Comment';
import { Counter } from '../models/Counter';
import { Region, RegionStatQueue } from '../models/Region';
import constantsError from '../app/errors/constants';
import { ApplicationError, AuthorizationError, BadParamsError, NotFoundError, NoticeError } from '../app/errors';

export let DEFAULT_HOME = null;
export const regionsAllSelectHash = Object.create(null);

const loggerApp = log4js.getLogger('app');
const logger = log4js.getLogger('region.js');
const maxRegionLevel = constants.region.maxLevel;
const nogeoRegion = { cid: 0, title_en: 'Where is it?', title_local: 'Где это?' };

let regionCacheArr = []; // Array-cache of regions  [{ _id, cid, parents }]
let regionCacheHash = {}; // Hash-cache of regions { cid: { _id, cid, parents } }

let regionCacheArrPublic = [];
let regionCacheMapPublic = new Map();
let regionCacheArrPublicPromise = Promise.resolve({
    regions: regionCacheArrPublic,
    regionsStringified: JSON.stringify(regionCacheArrPublic),
});
let regionCacheArrAdmin = [];
let regionCacheMapAdmin = new Map();
let regionCacheArrAdminPromise = Promise.resolve({ regions: regionCacheArrAdmin });

let regionsChildrenArrHash = {};

for (let i = 0; i <= maxRegionLevel; i++) {
    regionsAllSelectHash['r' + i] = 1;
}

export const ready = waitDb.then(fillCache);

// Заполняем кэш (массив и хэш) регионов в память
async function fillCache() {
    try {
        const start = Date.now();

        regionCacheArr = await Region.find(
            {},
            {
                _id: 1, cid: 1, parents: 1,
                cdate: 1, udate: 1, gdate: 1,
                title_en: 1, title_local: 1,
                photostat: 1, paintstat: 1, cstat: 1,
            },
            { lean: true, sort: { cid: 1 } }
        ).exec();

        regionCacheArr.sort((a, b) =>
            a.parents.length < b.parents.length || a.parents.length === b.parents.length && a.cid < b.cid ? -1 : 1
        );

        regionCacheArrAdmin = [];
        regionCacheMapAdmin = new Map();
        regionCacheArrPublic = [];
        regionCacheMapPublic = new Map();
        regionsChildrenArrHash = {};
        regionCacheHash = { '0': nogeoRegion }; // Zero region means absence of coordinates

        // Fill number of children regions for each region
        for (const region of regionCacheArr) {
            const { cid, parents } = region;

            region.childLen = 0;

            if (parents && parents.length) {
                for (const parentCid of parents) {
                    regionCacheHash[parentCid].childLen++;
                }
            }

            regionCacheHash[cid] = region;
        }

        for (const region of regionCacheArr) {
            const { cid, parents } = region;
            const { regionAdmin, regionPublic } = fillPublicAndAdminMaps(region);

            regionCacheArrAdmin.push(regionAdmin);
            regionCacheArrPublic.push(regionPublic);

            const parentCid = parents[parents.length - 1];

            if (parentCid) {
                const parentChildren = regionsChildrenArrHash[parentCid];

                if (parentChildren) {
                    parentChildren.push(cid);
                } else {
                    regionsChildrenArrHash[parentCid] = [cid];
                }
            }
        }

        regionCacheArrPublicPromise = Promise.resolve({
            regions: regionCacheArrPublic,
            regionsStringified: JSON.stringify(regionCacheArrPublic),
        });
        regionCacheArrAdminPromise = Promise.resolve({ regions: regionCacheArrAdmin });

        DEFAULT_HOME = regionCacheHash[config.regionHome] || regionCacheArrPublic[0];
        loggerApp.info(`Region cache filled with ${regionCacheArr.length} in ${Date.now() - start}ms`);
    } catch (err) {
        err.message = `FillCache: ${err.message}`;
        throw err;
    } finally {
        // Refill cache in replica every 5m to catch up primary
        if (!config.primary) {
            setTimeout(fillCache, ms('5m'));
        }
    }
}

function fillPublicAndAdminMaps(region) {
    const { cid, parents, childLen, cdate, udate, gdate, title_en, title_local, photostat = {}, paintstat = {}, cstat = {} } = region;
    const regionAdmin = regionCacheMapAdmin.get(cid) || { cid };
    const regionPublic = regionCacheMapPublic.get(cid) || { cid };

    Object.assign(regionPublic, {
        parents, title_en, title_local, childLen,
        phc: photostat.s5, pac: paintstat.s5, cc: cstat.all - cstat.del,
    });

    Object.assign(regionAdmin, {
        parents, title_en, title_local, childLen,
        cdate: new Date(cdate).getTime(),
        udate: udate ? new Date(udate).getTime() : undefined,
        gdate: gdate ? new Date(gdate).getTime() : undefined,
        pc: photostat.all + paintstat.all,
        pcg: photostat.geo + paintstat.geo,
        pco: photostat.own + paintstat.own,
        pcog: photostat.owngeo + paintstat.owngeo,
        cc: cstat.all,
        ccd: cstat.del,
    });

    if (!regionCacheMapAdmin.has(cid)) {
        regionCacheMapAdmin.set(cid, regionAdmin);
    }

    if (!regionCacheMapPublic.has(cid)) {
        regionCacheMapPublic.set(cid, regionPublic);
    }

    return { regionAdmin, regionPublic };
}

export const getRegionFromCache = cid => regionCacheHash[cid];
export const getRegionsArrFromCache = cids => _.transform(cids, (result, cid) => {
    const region = regionCacheHash[cid];

    if (region !== undefined) {
        result.push(region);
    }
}, []);
export const getRegionPublicFromCache = cid => regionCacheMapPublic.get(cid);
export const getRegionsArrPublicFromCache = cids => Array.isArray(cids) ? cids.reduce((result, cid) => {
    const region = regionCacheMapPublic.get(cid);

    if (region !== undefined) {
        result.push(region);
    }

    return result;
}, []) : cids;
export const getRegionsHashFromCache = cids => _.transform(cids, (result, cid) => {
    const region = regionCacheHash[cid];

    if (region !== undefined) {
        result[region.cid] = region;
    }
}, {});
export const getRegionsArrFromHash = (hash, cids) => {
    const result = [];

    if (cids) {
        for (let i = 0; i < cids.length; i++) {
            result.push(hash[cids[i]]);
        }
    } else {
        for (const i in hash) {
            if (hash[i] !== undefined) {
                result.push(hash[i]);
            }
        }
    }

    return result;
};
export const fillRegionsHash = (hash, fileds) => {
    if (fileds) {
        // hash is a null prototype object
        for (const i in hash) { // eslint-disable-line guard-for-in
            const region = regionCacheHash[i];

            hash[i] = {};

            for (const field of fileds) {
                hash[i][field] = region[field];
            }
        }
    } else {
        // hash is a null prototype object
        for (const i in hash) { // eslint-disable-line guard-for-in
            hash[i] = regionCacheHash[i];
        }
    }

    return hash;
};
export const fillRegionsPublicStats = regions => {
    if (regions) {
        for (const region of regions) {
            const { phc = 0, pac = 0, cc = 0 } = regionCacheMapPublic.get(region.cid) || {};

            region.phc = phc;
            region.pac = pac;
            region.cc = cc;
        }
    }

    return regions;
};

/**
 * Returns regions array in the same order as received array of cids
 * @param cidArr Regions cid array
 * @param [fields]
 */
async function getOrderedRegionList(cidArr = [], fields = { _id: 0, geo: 0, __v: 0 }) {
    const regions = await Region.find({ cid: { $in: cidArr } }, fields, { lean: true }).exec();

    if (cidArr.length !== regions.length) {
        return [];
    }

    // $in doesn't guarantee sort as incoming array, so make manual resort

    const parentsSortedArr = [];

    for (const cid of cidArr) {
        for (const region of regions) {
            if (region.cid === cid) {
                parentsSortedArr.push(region);
                break;
            }
        }
    }

    return parentsSortedArr;
}

/**
 * Return array of cid or object regions
 * @param obj Object (photo, comment и т.д.)
 */
export const getObjRegionCids = obj => {
    const result = [];

    for (let i = 0; i <= maxRegionLevel; i++) {
        const rcid = obj['r' + i];

        if (rcid) {
            result.push(rcid);
        }
    }

    return result;
};

/**
 * Return populated array of regions for transferred object
 * @param obj Object (photo, comment etc.)
 * @param fields Selected region fields. Array, but in case of 'fromDb' - object
 * @param [fromDb] Select from db, not just from cache (in cahce not all fields presented)
 */
function getObjRegionList({ obj, fields, fromDb }) {
    if (fromDb) {
        return getOrderedRegionList(getObjRegionCids(obj), fields);
    }

    const cidArr = [];

    for (let i = 0; i <= maxRegionLevel; i++) {
        const rcid = obj['r' + i];

        if (rcid) {
            cidArr.push(fields ? _.pick(regionCacheHash[rcid], fields) : regionCacheHash[rcid]);
        }
    }

    return cidArr;
}

// Select the maximum levels of the regions, which should be reflected in the summary of regional affiliation of objects
// Maximum level - under which user filters by default more then one region
// For example when the global filtration, maximum level - country, because a lot of them
// When filtering by country maximum level - state, because a lot of them whithin the country,
// therefore it is necessary to reflect the affiliation to the subjects
// If filtration fas several regions of different countries, so maximum level - country, because a lot of them
// @returns {lvls: ['rn'], sel: {rn: 1, rn+1: 1, ..., rmax: 1}}
export const getShortRegionsParams = (function () {
    const globalFilterParams = { lvls: ['r0', 'r1'], sel: regionsAllSelectHash };

    return function (rhash) {
        // If hash not transfered (for example anonym user) or it's empty (this mean filter is global),
        // return global parameters
        if (_.isEmpty(rhash)) {
            return globalFilterParams;
        }

        let i;
        let result;
        const regionLevels = new Array(maxRegionLevel + 1);

        // rhash is a null prototype object
        for (const cid in rhash) { // eslint-disable-line guard-for-in
            const region = rhash[cid];
            const regionParents = region.parents;
            let regionLevelHash = regionLevels[regionParents.length];

            if (regionLevelHash === undefined) {
                regionLevelHash = regionLevels[regionParents.length] = {};
            }

            regionLevelHash[cid] = true;

            for (i = 0; i < regionParents.length; i++) {
                regionLevelHash = regionLevels[i];

                if (regionLevelHash === undefined) {
                    regionLevelHash = regionLevels[i] = {};
                }

                regionLevelHash[regionParents[i]] = true;
            }
        }

        // Maximum level is on which several regions or undefined (ie any number of regions)
        for (i = 0; i < regionLevels.length; i++) {
            if (!regionLevels[i] || Object.keys(regionLevels[i]).length > 1) {
                if (i === 0) {
                    // If it's zero level (ie show countries), take global params
                    result = globalFilterParams;
                } else {
                    result = { lvls: ['r' + i], sel: Object.create(null) };

                    // Beginning from this level, fill hash selected region's levels regions of object
                    // ({rn: 1, rn+1: 1, ..., rmax: 1}),
                    // just not to select superfluous highers in each request to object
                    for (let j = i; j <= maxRegionLevel; j++) {
                        result.sel['r' + j] = 1;
                    }
                }

                break;
            }
        }

        // If in previous cycle didn't find level,
        // means that last level of branch has selected and need to return empty objects
        if (!result) {
            result = { lvls: [], sel: Object.create(null) };
        }

        return result;
    };
}());

// Run through array of objects and for each object create array of cids of regions,
// which match transfered levels for shorthand regions view
// Mutate elements of transfered array and return hash of regions
export const genObjsShortRegionsArr = function (objs, showlvls = ['r0', 'r1'], dropRegionsFields) {
    let shortRegionsHash = {};
    let level;
    let cid;
    let j;
    let k;

    for (const obj of objs) {
        for (j = maxRegionLevel; j >= 0; j--) {
            level = 'r' + j;
            cid = obj[level];

            if (cid !== undefined) {
                shortRegionsHash[cid] = true;
                obj.rs = [cid];

                for (k = showlvls.length; k--;) {
                    if (showlvls[k] !== level) {
                        cid = obj[showlvls[k]];

                        if (cid !== undefined) {
                            shortRegionsHash[cid] = true;
                            obj.rs.push(cid);
                        }
                    }
                }

                break;
            }
        }

        // If object has no coordinates, this mean that it belongs to category 'where is it?'
        // To inform about it add 0 to the beginning of array of regions
        // If there is no regions (without regions and coordinates may be new photos), so in array will be only 0
        if (!obj.geo) {
            if (!obj.rs) {
                obj.rs = [0];
            } else {
                obj.rs.unshift(0);
            }

            shortRegionsHash['0'] = true;
        }

        // If transfered flag that removal of field 'rn' is needed, do it
        if (dropRegionsFields === true) {
            obj.geo = undefined;

            for (j = 0; j <= maxRegionLevel; j++) {
                obj['r' + j] = undefined;
            }
        }
    }

    if (Object.keys(shortRegionsHash).length) {
        fillRegionsHash(shortRegionsHash, ['cid', 'title_en']);
    } else {
        shortRegionsHash = undefined;
    }

    return shortRegionsHash;
};

/**
 * Recalculate what objects belong to region
 * First, clear current assignment of objects to region, then again search for objects, located within region's polygon
 * @param cidOrRegion
 */
async function calcRegionIncludes(cidOrRegion) {
    const region = _.isNumber(cidOrRegion) ?
        await Region.findOne({ cid: cidOrRegion }, { _id: 0, cid: 1, parents: 1, geo: 1 }, { lean: true }).exec() :
        cidOrRegion;

    if (!region) {
        throw new NotFoundError({
            code: constantsError.NO_SUCH_REGION, what: `Cant find region ${cidOrRegion} for calcRegionIncludes`,
        });
    }

    const level = 'r' + region.parents.length;

    // First clear assignment of objects with coordinates to region
    const unsetObject = { $unset: { [level]: 1 } };
    const [{ n: photosCountBefore = 0 }, { n: commentsCountBefore = 0 }] = await Promise.all([
        Photo.update({ geo: { $exists: true }, [level]: region.cid }, unsetObject, { multi: true }).exec(),
        Comment.update({ geo: { $exists: true }, [level]: region.cid }, unsetObject, { multi: true }).exec(),
    ]);

    // Then assign to region on located in it polygon objects
    const setObject = { $set: { [level]: region.cid } };
    const [{ n: photosCountAfter = 0 }, { n: commentsCountAfter = 0 }] = await Promise.all([
        Photo.update({ geo: { $geoWithin: { $geometry: region.geo } } }, setObject, { multi: true }).exec(),
        Comment.update({ geo: { $geoWithin: { $geometry: region.geo } } }, setObject, { multi: true }).exec(),
    ]);

    return { cid: region.cid, photosCountBefore, commentsCountBefore, photosCountAfter, commentsCountAfter };
}

/**
 * Recalculate what objects belong to list of region. If list is empty - recalc all regions
 * @param cids Array of regions cids
 */
export async function calcRegionsIncludes(cids) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!Array.isArray(cids)) {
        throw new BadParamsError();
    }

    let result;

    if (_.isEmpty(cids)) {
        // If array is empty - recalc all photos
        result = await dbEval('regionsAssignObjects', [], { nolock: true });

        if (result && result.error) {
            throw new ApplicationError({ code: constantsError.REGION_ASSIGN_OBJECTS, result });
        }
    } else {
        // Recalc every region in loop
        result = [];

        for (const cid of cids) {
            result.push(await calcRegionIncludes(cid));
        }
    }

    return result;
}

/**
 * Returns for region it populated parents and number of children
 * @param region Region object
 */
async function getChildsLenByLevel(region) {
    let level = _.size(region.parents); // Region level equals number of parent regions

    if (level < maxRegionLevel) {
        // Find number of children by levels
        // Current region will be on position of current level
        // For example, children of region 77, wich has only one parent, will be found like that:
        // {'parents.1': 77, parents: {$size: 2}}
        // {'parents.1': 77, parents: {$size: 3}}
        // {'parents.1': 77, parents: {$size: 4}}
        const childrenQuery = { ['parents.' + level]: region.cid };
        const promises = [];

        while (level++ < maxRegionLevel) { // level инкрементируется после сравнения
            childrenQuery.parents = { $size: level };
            promises.push(Region.count(childrenQuery).exec());
        }

        return _.compact(await Promise.all(promises));
    }

    // If level is maximum just move to the mext step
    return [];
}

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов по уровням
 * @param region Объект региона
 */
async function getParentsAndChilds(region) {
    const level = _.size(region.parents); // Region level equals number of parent regions

    return Promise.all([
        getChildsLenByLevel(region),
        // If parents regions exist - populate them
        level ? getOrderedRegionList(region.parents) : null,
    ]);
}

async function changeRegionParentExternality(region, oldParentsArray, childLenArray) {
    const levelWas = oldParentsArray.length;
    const levelNew = region.parents.length;
    const levelDiff = Math.abs(levelWas - levelNew); // The difference between the levels
    const childLen = childLenArray.length;

    function updateObjects(query, update) {
        return Promise.all([
            Photo.update(query, update, { multi: true }).exec(),
            Comment.update(query, update, { multi: true }).exec(),
        ]);
    }

    // Sequentially raise photos up by level difference
    // First, rename region level field with name of new region level, next rename child levels also up
    async function pullPhotosRegionsUp() {
        let queryObj;
        let setObj;
        let i;

        // Remove all rX fileds, which are between current and new levels
        // It in case when we lift up more than one level,
        // inasmuch as photos, which belongs only to this region (but not to its children),
        // will still be belong to intermediate upper levels,
        // because $rename doesn't remove exists fields if renamed field doesn't exists
        if (levelDiff > 1) {
            queryObj = { ['r' + levelWas]: region.cid };
            setObj = { $unset: {} };

            for (i = levelNew; i < levelWas; i++) {
                setObj.$unset['r' + i] = 1;
            }

            await updateObjects(queryObj, setObj);
        }

        // Sequentally rename to upper level, begining from top moved
        queryObj = { ['r' + levelWas]: region.cid };

        for (i = levelWas; i <= levelWas + childLen; i++) {
            if (i === levelWas + 1) {
                // Photos, which belongs to children of moving region,
                // must be selected as belonging to new level, because they were moved on first dtep
                queryObj = { ['r' + levelNew]: region.cid };
            }

            setObj = { $rename: { ['r' + i]: 'r' + (i - levelDiff) } };

            await updateObjects(queryObj, setObj);
        }
    }

    // Sequentially move photos down by level difference
    // Start renaming from last level fields
    async function pushPhotosRegionsDown() {
        const queryObj = { ['r' + levelWas]: region.cid };

        for (let i = levelWas + childLen; i >= levelWas; i--) {
            const setObj = { $rename: { [`r${i}`]: `r${i + levelDiff}` } };

            await updateObjects(queryObj, setObj);
        }
    }

    // Insert new parents on places of shifted old ones
    async function refillPhotosRegions(levelFrom, levelTo) {
        const queryObj = { ['r' + levelTo]: region.cid };
        const setObj = {};

        for (let i = levelFrom; i < levelTo; i++) {
            setObj['r' + i] = region.parents[i];
        }

        await updateObjects(queryObj, setObj);
    }

    // Remove from users and moderators subscription on children regions, if they subscribed on parents
    async function dropChildRegionsForUsers() {
        const [parentRegions, childRegions] = await Promise.all([
            // Find _ids of new parent regions
            Region.find({ cid: { $in: region.parents } }, { _id: 1 }, { lean: true }).exec(),
            // Find _ids of all children regions of moving region
            Region.find({ parents: region.cid }, { _id: 1 }, { lean: true }).exec(),
        ]);

        // Array of _id of parents regions
        const parentRegionsIds = _.map(parentRegions, '_id');
        // Array of _ids of regions of moving branch (ie region itself and its children)
        const movingRegionsIds = _.map(childRegions, '_id');

        movingRegionsIds.unshift(region._id);

        const [{ n: affectedUsers = 0 }, { n: affectedMods = 0 }] = await Promise.all([
            // Remove subscription on moving regions of those users, who have subscription on new and on parent regions,
            // because in this case they'll have subscription on children automatically
            User.update({
                $and: [
                    { regions: { $in: parentRegionsIds } },
                    { regions: { $in: movingRegionsIds } },
                ],
            }, { $pull: { regions: { $in: movingRegionsIds } } }, { multi: true }).exec(),

            // Tha same with moderated regions
            User.update({
                $and: [
                    { mod_regions: { $in: parentRegionsIds } },
                    { mod_regions: { $in: movingRegionsIds } },
                ],
            }, { $pull: { mod_regions: { $in: movingRegionsIds } } }, { multi: true }).exec(),
        ]);

        return { affectedUsers, affectedMods };
    }

    // Calculate number of photos belongs to the region
    const countQuery = { ['r' + levelWas]: region.cid };
    const [affectedPhotos, affectedComments] = await Promise.all([
        Photo.count(countQuery).exec(), Comment.count(countQuery).exec(),
    ]);

    let affectedUsers;
    let affectedMods;
    let regionsDiff; // Array of cids of adding/removing regions

    if (!levelNew || levelNew < levelWas && _.isEqual(oldParentsArray.slice(0, levelNew), region.parents)) {
        // Move region UP
        regionsDiff = _.difference(oldParentsArray, region.parents);

        // Remove differens in regions from children of moving region, eg move them up too
        await Region.update(
            { parents: region.cid }, { $pull: { parents: { $in: regionsDiff } } }, { multi: true }
        ).exec();

        if (affectedPhotos) {
            // Sequentially raise photos up by level difference
            await pullPhotosRegionsUp();
        }
    } else if (levelNew > levelWas && _.isEqual(region.parents.slice(0, levelWas), oldParentsArray)) {
        // Move region DOWN
        regionsDiff = _.difference(region.parents, oldParentsArray);

        // Insert added parent regions to children of moving region, eg move them down also
        await Region.update(
            { parents: region.cid },
            { $push: { parents: { $each: regionsDiff, $position: levelWas } } },
            { multi: true }
        ).exec();

        if (!affectedPhotos) {
            return { affectedPhotos, affectedComments };
        }

        await pushPhotosRegionsDown(); // Sequentially move photos down by level difference

        await refillPhotosRegions(levelWas, levelNew); // Insert new parents on places of shifted old ones

        // Remove from users and moderators subscription on children regions, if they subscribed on parents
        ({ affectedUsers, affectedMods } = await dropChildRegionsForUsers());
    } else {
        // Move region to ANOTHER BRANCH

        // Remove all parents of this region from its children
        await Region.update(
            { parents: region.cid }, { $pull: { parents: { $in: oldParentsArray } } }, { multi: true }
        ).exec();

        // Insert added parent regions to children of moving region, eg move them down also
        // Insert all parents of region to its children
        await Region.update(
            { parents: region.cid },
            { $push: { parents: { $each: region.parents, $position: 0 } } },
            { multi: true }
        ).exec();

        if (affectedPhotos && levelNew !== levelWas) {
            if (levelNew < levelWas) {
                await pullPhotosRegionsUp();
            } else if (levelNew > levelWas) {
                await pushPhotosRegionsDown();
            }
        }

        if (affectedPhotos) {
            // Insert new parents on places of shifted old ones
            await refillPhotosRegions(0, levelNew);
        }

        // Remove from users and moderators subscription on children regions, if they subscribed on parents
        ({ affectedUsers, affectedMods } = await dropChildRegionsForUsers());
    }

    return { affectedPhotos, affectedComments, affectedUsers, affectedMods };
}


async function processFeatureCollection(data) {
    const start = Date.now();
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data) || typeof data.cid !== 'number' || data.cid < 1 || typeof data.featureString !== 'string') {
        throw new BadParamsError();
    }

    // Find parent by cid
    const parent = await Region.findOne({ cid: data.cid }, { _id: 0, cid: 1, parents: 1 }, { lean: true }).exec();

    if (!parent) {
        throw new NotFoundError(constantsError.NO_SUCH_REGION);
    }

    if (parent.parents.length > maxRegionLevel) {
        throw new NoticeError(constantsError.REGION_MOVE_EXCEED_MAX_LEVEL);
    }

    let featureCollection;

    try {
        featureCollection = JSON.parse(data.featureString);
    } catch (err) {
        throw new BadParamsError({ code: constantsError.REGION_GEOJSON_PARSE, why: err.message });
    }

    if (!_.isObject(featureCollection) || featureCollection.type !== 'FeatureCollection') {
        throw new BadParamsError();
    }

    const { features } = featureCollection;

    if (!Array.isArray(features) || !features.length) {
        throw new BadParamsError();
    }

    const result = { features: [] };

    for (const feature of features) {
        const featureResult = {};

        result.features.push(featureResult);

        if (!_.isObject(feature.geometry)) {
            featureResult.error = "Feature doesn't contain geometry";
            continue;
        }

        if (!_.isObject(feature.properties) || !feature.properties.name) {
            featureResult.error = "Feature doesn't contain name property";
            continue;
        }

        logger.info(`Working on child feature ${feature.properties.name}`);

        try {
            const existentRegion = await Region.findOne({
                $and: [
                    { parents: parent.cid },
                    { parents: { $size: parent.parents.length + 1 } },
                ],
                $or: [
                    { title_en: new RegExp('^' + feature.properties.name + '$', 'i') },
                    { title_local: new RegExp('^' + feature.properties.name + '$', 'i') },
                ],
            }, { _id: 0, cid: 1, title_en: 1, title_local: 1 }, { lean: true }).exec();

            const saveResult = await save.call(this, {
                refillCache: false,
                recalcStatsParent: false,

                parent: data.cid,
                cid: existentRegion ? existentRegion.cid : undefined,
                title_en: existentRegion ? existentRegion.title_en : feature.properties.name,
                title_local: existentRegion ? existentRegion.title_local : feature.properties.name,
                geo: feature.geometry,
            });

            featureResult.success = true;
            featureResult.edit = Boolean(existentRegion);
            featureResult.stat = saveResult.resultStat;
            featureResult.region = _.pick(saveResult.region, 'cid', 'title_local', 'polynum', 'pointsnum');
        } catch (err) {
            featureResult.error = err.message || err;
        }
    }

    try {
        // Update region stats for current and all parents
        await recalcStats([parent.cid]);
    } catch (error) {
        logger.warn(`Failed to calculate region stats on region ${parent.cid} processFeatureCollection`, error);
    }

    try {
        await fillCache(); // Refresh regions cache
    } catch (err) {
        throw new ApplicationError({ code: constantsError.REGION_SAVED_BUT_REFILL_CACHE, why: err.message });
    }

    result.s = Math.round((Date.now() - start) / 100) / 10;

    return result;
}

/**
 * Save/Create region
 * @param data
 */
async function save(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data) || !data.title_en || !data.title_local) {
        throw new BadParamsError();
    }

    data.title_en = data.title_en.trim();
    data.title_local = data.title_local.trim();

    if (!data.title_en || !data.title_local) {
        throw new BadParamsError();
    }

    data.parent = data.parent && Number(data.parent);

    let parentsArray;

    if (data.parent) {
        if (data.cid && data.cid === data.parent) {
            throw new NoticeError(constantsError.REGION_PARENT_THE_SAME);
        }

        const parentRegion = await Region.findOne(
            { cid: data.parent }, { _id: 0, cid: 1, parents: 1 }, { lean: true }
        ).exec();

        if (_.isEmpty(parentRegion)) {
            throw new NoticeError(constantsError.REGION_PARENT_DOESNT_EXISTS);
        }

        parentsArray = parentRegion.parents || [];

        if (data.cid && parentsArray.includes(data.cid)) {
            throw new NoticeError(constantsError.REGION_PARENT_LOOP);
        }

        parentsArray.push(parentRegion.cid);
    } else {
        parentsArray = [];
    }

    if (data.geo) {
        if (typeof data.geo === 'string') {
            try {
                data.geo = JSON.parse(data.geo);
            } catch (err) {
                throw new BadParamsError({ code: constantsError.REGION_GEOJSON_PARSE, why: err.message });
            }
        }

        if (data.geo.type === 'GeometryCollection') {
            data.geo = data.geo.geometries[0];
        }

        if (Object.keys(data.geo).length !== 2 || !Array.isArray(data.geo.coordinates) || !data.geo.coordinates.length ||
            !data.geo.type || data.geo.type !== 'Polygon' && data.geo.type !== 'MultiPolygon') {
            throw new BadParamsError(constantsError.REGION_GEOJSON_GEOMETRY);
        }

        // If multipolygon contains only one polygon, take it and make type Polygon
        if (data.geo.type === 'MultiPolygon' && data.geo.coordinates.length === 1) {
            data.geo.coordinates = data.geo.coordinates[0];
            data.geo.type = 'Polygon';
        }

        const sortPolygonSegmentsByArea = (function () {
            const polygonsArea = new Map(); // Cache to avoid computing area of a polygon more than once

            return (a, b) => {
                const areaA = polygonsArea.get(a) || geojsonArea.geometry({ type: 'Polygon', coordinates: a });
                const areaB = polygonsArea.get(b) || geojsonArea.geometry({ type: 'Polygon', coordinates: b });

                polygonsArea.set(a, areaA);
                polygonsArea.set(b, areaB);

                return areaA > areaB ? -1 : areaA < areaB ? 1 : 0;
            };
        }());


        if (data.geo.type === 'Polygon' && data.geo.coordinates.length > 1) {
            // If it is polygon with excluded polygons, make sure the first on is the biggest (exterior ring)
            // ([ [[x, y], [x,y]], [[x, y], [x,y]] ])
            //    ^^^^polygon^^^^  ^^^^polygon^^^^
            data.geo.coordinates.sort(sortPolygonSegmentsByArea);
        } else if (data.geo.type === 'MultiPolygon') {
            // If it is MultiPolygon without holes, automatically reveal if each polygon is a hole for the bigger one
            // Find holes (interior rings) in each polygon, and if there at least one that means nesting is done for us
            const polygonsContainHoles = data.geo.coordinates.some(polygonCoord => polygonCoord.length > 1);

            // If there is no holes in polygons, check if polygons are holes of each other
            if (!polygonsContainHoles) {
                // Sort polygons by area size, to make potential exterior one first
                data.geo.coordinates.sort(sortPolygonSegmentsByArea);

                // Recursively move through polygons, considering first one as an exterior and testing with each next for intersection
                const newCoordinates = (function processCoordinates(leftPolygons, result) {
                    const nextLeftCoordinates = [];
                    const exteriorPolygon = leftPolygons[0]; // First one is supposed to be exterior, because of size

                    result.push(exteriorPolygon);

                    for (let i = 1; i < leftPolygons.length; i++) {
                        const polygon = leftPolygons[i];
                        const intersectionWithExterior = turfIntersect(turfPolygon(exteriorPolygon), turfPolygon(polygon));

                        if (intersectionWithExterior && intersectionWithExterior.geometry.type === 'Polygon') {
                            // If polygons intersect as Polygon, means current one is a hole (interior ring)
                            exteriorPolygon.push(polygon[0]);
                        } else {
                            // If the don't intersect, mean molygons are really separate
                            // It also correctly handles case where polygon can be inside of hole of exterior,
                            // then it will return undefined and polygon will become next exterior ring
                            nextLeftCoordinates.push(polygon);
                        }
                    }

                    if (nextLeftCoordinates.length) {
                        // If there are still left polygons, repeat recursively for them
                        processCoordinates(nextLeftCoordinates, result);
                    }

                    return result;
                }(data.geo.coordinates, []));

                if (newCoordinates.length !== data.geo.coordinates.length) {
                    data.geo.coordinates = newCoordinates;
                }
            }
        }

        // Enforce polygon ring winding order for geojson
        // RFC 7946 GeoJSON now recommends right-hand rule winding order
        // https://macwright.org/2015/03/23/geojson-second-bite.html
        data.geo = geojsonRewind(data.geo);

        // Validate geojson objects against the specification
        const hints = geojsonHint.hint(data.geo, {
            noDuplicateMembers: true,
            precisionWarning: false,
        });

        if (hints.length) {
            throw new BadParamsError({
                code: constantsError.REGION_GEOJSON_PARSE,
                why: hints.reduce((acc, hint) => `${acc}${hint.message}${hint.line ? `, ${hint.line}` : ''}.<br>`, ''),
            });
        }
    }

    let region;
    let parentChange;
    let parentsArrayOld;
    let childLenArray;
    const resultStat = {};

    if (!data.cid) {
        // Create new region object

        if (!data.geo) {
            throw new BadParamsError();
        }

        const count = await Counter.increment('region');

        if (!count) {
            throw new ApplicationError(constantsError.COUNTER_ERROR);
        }

        region = new Region({ cid: count.next, parents: parentsArray, cuser: iAm.user._id });
    } else {
        // Find region by cid
        region = await Region.findOne({ cid: data.cid }).exec();

        if (!region) {
            throw new NotFoundError(constantsError.NO_SUCH_REGION);
        }

        parentChange = !_.isEqual(parentsArray, region.parents);

        if (parentChange) {
            childLenArray = await getChildsLenByLevel(region);
        }

        if (parentChange) {
            if (parentsArray.length > region.parents.length &&
                parentsArray.length + childLenArray.length > maxRegionLevel) {
                throw new NoticeError(constantsError.REGION_MOVE_EXCEED_MAX_LEVEL);
            }

            parentsArrayOld = region.parents;
            region.parents = parentsArray;
        }

        region.udate = new Date();
        region.uuser = iAm.user._id;

        if (data.geo) {
            region.gdate = region.udate;
            region.guser = iAm.user._id;
        }
    }

    // If 'geo' was updated - write it, marking modified, because it has type Mixed
    if (data.geo) {
        // Count number of segments
        region.polynum = Utils.calcGeoJSONPolygonsNum(data.geo);

        // Count number of points
        region.pointsnum = data.geo.type === 'Point' ? 1 : Utils.calcGeoJSONPointsNum(data.geo.coordinates);

        // Compute bbox
        region.bbox = Utils.geo.polyBBOX(data.geo).map(Utils.math.toPrecision6);

        region.geo = data.geo;
        region.markModified('geo');
        region.markModified('polynum');
    }

    if (Utils.geo.checkbboxLatLng(data.bboxhome)) {
        region.bboxhome = Utils.geo.bboxReverse(data.bboxhome).map(Utils.math.toPrecision6);
    } else if (data.bboxhome === null) {
        region.bboxhome = undefined; // If null received, need to remove it, so it bocome automatic
    }

    if (data.centerAuto || !Utils.geo.checkLatLng(data.center)) {
        if (data.geo || !region.centerAuto) {
            region.centerAuto = true;
            // If Polygon - its center of gravity takes as the center, if MultiPolygon - center of bbox
            region.center = Utils.geo.geoToPrecision(region.geo.type === 'MultiPolygon' ?
                [(region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2] :
                Utils.geo.polyCentroid(region.geo.coordinates[0])
            );
        }
    } else {
        region.centerAuto = false;
        region.center = Utils.geo.geoToPrecision(data.center.reverse());
    }

    region.title_en = String(data.title_en);
    region.title_local = data.title_local ? String(data.title_local) : undefined;

    // If we changing region, drain stat queue before saving region,
    // to align statistics before we will be changing objects belongings
    if (data.cid) {
        await regionStatQueueDrain();
    }

    region = await region.save();
    region = region.toObject();

    // If coordinates changed, compute included objects
    if (data.geo) {
        try {
            const geoRecalcRes = await calcRegionIncludes(region);

            if (geoRecalcRes) {
                Object.assign(resultStat, geoRecalcRes);
            }
        } catch (err) {
            throw new ApplicationError({ code: constantsError.REGION_SAVED_BUT_INCL_PHOTO, why: err.message });
        }
    }

    // If parents changed, compute all dependences from level
    if (parentChange) {
        try {
            const moveRes = await changeRegionParentExternality(region, parentsArrayOld, childLenArray);

            if (moveRes) {
                Object.assign(resultStat, moveRes);
            }
        } catch (err) {
            throw new ApplicationError({ code: constantsError.REGION_SAVED_BUT_PARENT_EXTERNALITY, why: err.message });
        }
    }

    // If coordinates or parent changed, compute stats for current and parents
    if (data.geo || parentChange) {
        const { recalcStatsParent = true } = data;
        const affected = recalcStatsParent ? _.union([region.cid], parentsArray, parentsArrayOld) : [region.cid];

        let recalcStatsResult;

        try {
            // Update region stats for current and all parents
            recalcStatsResult = await recalcStats(affected);
        } catch (error) {
            recalcStatsResult = { recalcStatsError: error };
            logger.warn(`Failed to calculate region stats on region ${region.cid} save`, error);
        }

        Object.assign(resultStat, recalcStatsResult);
    }

    const { refillCache = true } = data;

    if (refillCache) {
        try {
            await fillCache(); // Refresh regions cache
        } catch (err) {
            throw new ApplicationError({ code: constantsError.REGION_SAVED_BUT_REFILL_CACHE, why: err.message });
        }
    }

    const [childLenArr, parentsSortedArr] = await getParentsAndChilds(region);

    if (parentsSortedArr) {
        region.parents = parentsSortedArr;
    }

    if (data.geo) {
        region.geo = JSON.stringify(region.geo);
    } else {
        delete region.geo;
    }

    if (region.center) {
        region.center.reverse();
    }

    if (region.bbox !== undefined) {
        if (Utils.geo.checkbbox(region.bbox)) {
            region.bbox = Utils.geo.bboxReverse(region.bbox);
        } else {
            delete region.bbox;
        }
    }

    if (region.bboxhome !== undefined) {
        if (Utils.geo.checkbbox(region.bboxhome)) {
            region.bboxhome = Utils.geo.bboxReverse(region.bboxhome);
        } else {
            delete region.bboxhome;
        }
    }

    // Update online users whose current region saved as home region or filtered by default of moderated
    _session.regetUsers(usObj => usObj.rhash && usObj.rhash[region.cid] ||
            usObj.mod_rhash && usObj.mod_rhash[region.cid] ||
            usObj.user.regionHome && usObj.user.regionHome.cid === region.cid, true);

    return { childLenArr, region, resultStat };
}

/**
 * Region removal by administrator
 * Parameter 'reassignChilds' is reserved for moving child regions of removed under another region
 * @param data
 */
async function remove(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data) || !data.cid) {
        throw new BadParamsError();
    }

    const regionToRemove = await Region.findOne({ cid: data.cid }).exec();

    if (!regionToRemove) {
        throw new NotFoundError(constantsError.NO_SUCH_REGION);
    }

    // if (data.reassignChilds && !regionToReassignChilds) {
    //  throw { message: 'Region for reassign descendants does not exists'};
    // }

    const { parents } = regionToRemove;
    const removingLevel = parents.length;

    const [childRegions, parentRegion] = await Promise.all([
        // Find all child regions
        Region.find({ parents: regionToRemove.cid }, { _id: 1 }, { lean: true }).exec(),
        // Find parent region for replacing with it user's home region (for those who have removing region as home),
        // If region has no parent (we removing whole country) - select any another country
        Region.findOne(
            removingLevel ?
                { cid: parents[parents.length - 1] } :
                { cid: { $ne: regionToRemove.cid }, parents: { $size: 0 } },
            { _id: 1, cid: 1, title_en: 1 }, { lean: true }
        ).exec(),
    ]);

    if (_.isEmpty(parentRegion)) {
        throw new NotFoundError(constantsError.REGION_PARENT_DOESNT_EXISTS);
    }

    // If we removing region, drain stat queue before that,
    // to align statistics before we will be changing objects belonging
    if (data.cid) {
        await regionStatQueueDrain();
    }

    // _ids of all removing regions
    const removingRegionsIds = childRegions ? _.map(childRegions, '_id') : [];

    removingRegionsIds.push(regionToRemove._id);

    // Replace home regions
    const { n: homeAffectedUsers = 0 } = await User.update(
        { regionHome: { $in: removingRegionsIds } }, { $set: { regionHome: parentRegion._id } }, { multi: true }
    ).exec();

    // Unsubscribe all users from removing regions ('my regions')
    const { n: affectedUsers = 0 } = await User.update(
        { regions: { $in: removingRegionsIds } }, { $pull: { regions: { $in: removingRegionsIds } } }, { multi: true }
    ).exec();

    // Remove removing regions from moderated by users
    const modsResult = await removeRegionsFromMods({ mod_regions: { $in: removingRegionsIds } }, removingRegionsIds);

    const objectsMatchQuery = { ['r' + removingLevel]: regionToRemove.cid };
    const objectsUpdateQuery = { $unset: {} };

    if (removingLevel === 0) {
        // If we remove country, assign all its photos to Open sea
        objectsUpdateQuery.$set = { r0: 1000000 };

        for (let i = 1; i <= maxRegionLevel; i++) {
            objectsUpdateQuery.$unset['r' + i] = 1;
        }
    } else {
        for (let i = removingLevel; i <= maxRegionLevel; i++) {
            objectsUpdateQuery.$unset['r' + i] = 1;
        }
    }

    const [{ n: affectedPhotos = 0 }, { n: affectedComments = 0 }] = await Promise.all([
        // Update included photos
        Photo.update(objectsMatchQuery, objectsUpdateQuery, { multi: true }).exec(),
        // Update comments of included photos
        Comment.update(objectsMatchQuery, objectsUpdateQuery, { multi: true }).exec(),
        // Remove child regions
        Region.remove({ parents: regionToRemove.cid }).exec(),
        // Remove this regions
        regionToRemove.remove(),
    ]);

    // If removing region has parent, recalc parents stat
    let recalcStatsResult = {};

    if (removingLevel) {
        try {
            // Update region stats for current and all parents
            recalcStatsResult = await recalcStats(parents);
        } catch (error) {
            recalcStatsResult = { recalcStatsError: error };
            logger.warn(`Failed to calculate parent regions stats on region ${data.cid} removal`, error);
        }
    }

    await fillCache(); // Refresh regions cache

    // If some users affected with region removal, reget all online users (because we don't know concrete of them)
    if (homeAffectedUsers || affectedUsers || modsResult.affectedMods) {
        _session.regetUsers('all', true);
    }

    return {
        removed: true,
        affectedUsers,
        affectedPhotos,
        affectedComments,
        homeAffectedUsers,
        homeReplacedWith: parentRegion,
        ...modsResult,
        ...recalcStatsResult,
    };
}

async function removeRegionsFromMods(usersQuery, regionsIds) {
    // Find all moderators of removing regions
    const modUsers = await User.find(usersQuery, { cid: 1 }, { lean: true }).exec();
    const modUsersCids = _.isEmpty(modUsers) ? [] : _.map(modUsers, 'cid');

    if (modUsersCids.length) {
        // Remove regions from finded moderators
        const { n: affectedMods = 0 } = await User.update(
            { cid: { $in: modUsersCids } },
            { $pull: { mod_regions: { $in: regionsIds } } },
            { multi: true }
        ).exec();

        // Revoke moderation role from users, in whose no moderation regions left after regions removal
        const { n: affectedModsLose = 0 } = await User.update(
            { cid: { $in: modUsersCids }, mod_regions: { $size: 0 } },
            { $unset: { role: 1, mod_regions: 1 } },
            { multi: true }
        ).exec();

        return { affectedMods, affectedModsLose };
    }

    return { affectedMods: 0, affectedModsLose: 0 };
}

async function give(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data) || !data.cid) {
        throw new BadParamsError();
    }

    const region = await Region.findOne({ cid: data.cid }, { _id: 0, __v: 0 }, { lean: true }).exec();

    if (!region) {
        throw new NotFoundError(constantsError.NO_SUCH_REGION);
    }

    const [childLenArr, parentsSortedArr] = await getParentsAndChilds(region);

    if (parentsSortedArr) {
        region.parents = parentsSortedArr;
    }

    let children;
    const childrenCids = regionsChildrenArrHash[data.cid];

    if (childrenCids) {
        children = [];

        for (const cid of childrenCids) {
            const { cdate, udate, title_en: title, childLen } = regionCacheHash[cid];

            children.push({ cid, cdate, udate, title, childLen, childrenCount: _.size(regionsChildrenArrHash[cid]) || undefined });
        }

        // Add public stat for each region
        fillRegionsPublicStats(children);

        children = _.sortBy(children, ['title']);
    }

    // Send client stringified geojson
    region.geo = JSON.stringify(region.geo);

    if (region.center) {
        region.center.reverse();
    }

    if (region.bbox !== undefined) {
        if (Utils.geo.checkbbox(region.bbox)) {
            region.bbox = Utils.geo.bboxReverse(region.bbox);
        } else {
            delete region.bbox;
        }
    }

    if (region.bboxhome !== undefined) {
        if (Utils.geo.checkbbox(region.bboxhome)) {
            region.bboxhome = Utils.geo.bboxReverse(region.bboxhome);
        } else {
            delete region.bboxhome;
        }
    }

    return { childLenArr, children, region };
}

// Returns array of count of all regions by levels
export async function getRegionsCountByLevel() {
    const promises = [];

    for (let i = 0; i <= maxRegionLevel; i++) {
        promises.push(Region.count({ parents: { $size: i } }).exec());
    }

    return Promise.all(promises);
}

// Return stat of regions by level (number of regions, total vertex)
function getRegionsStatByLevel() {
    return Region.aggregate([
        // Fields for selection. level - formed field of size of parents array, eg. region level
        // Introduced in 2.5.3 https://jira.mongodb.org/browse/SERVER-4899
        { $project: { _id: 0, level: { $size: '$parents' }, pointsnum: 1 } },
        // Calculate indicator for every level
        { $group: { _id: '$level', regionsCount: { $sum: 1 }, pointsCount: { $sum: '$pointsnum' } } },
        // Sort by parent ascending
        { $sort: { _id: 1 } },
        // Retain only the necessary fields
        { $project: { regionsCount: 1, pointsCount: 1, _id: 0 } },
    ]).exec();
}

async function giveListFull(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!_.isObject(data)) {
        throw new BadParamsError();
    }

    const [{ regions }, regionsStatByLevel] = await Promise.all([
        regionCacheArrAdminPromise,
        getRegionsStatByLevel(),
    ]);

    if (!regions) {
        throw new NotFoundError(constantsError.NO_SUCH_REGIONS);
    }

    const regionsStatCommon = { regionsCount: 0, pointsCount: 0 };

    // General indicators (composed by levels)
    for (let i = regionsStatByLevel.length; i--;) {
        regionsStatCommon.regionsCount += regionsStatByLevel[i].regionsCount;
        regionsStatCommon.pointsCount += regionsStatByLevel[i].pointsCount;
    }

    return { regions, stat: { common: regionsStatCommon, byLevel: regionsStatByLevel } };
}

export const giveListPublic = () => regionCacheArrPublicPromise.then(data => ({ regions: data.regions }));
export const giveListPublicString = () => regionCacheArrPublicPromise.then(data => ({ regions: data.regionsStringified }));

// Returns an array of regions in which a given point falls
// Determine regions path to geo by parents of the very last in path
const getRegionsByGeoPoint = (function () {
    const defRegion = 1000000; // If the region is not found, return the Open sea
    const sortDeepestFirst = (a, b) => {
        if (!a.parents || !a.parents.length) {
            return 1;
        }

        if (!b.parents || !b.parents.length) {
            return -1;
        }

        return a.parents.length < b.parents.length ? 1 : a.parents.length > b.parents.length ? -1 : 0;
    };

    return async function ({ geo, fields = { _id: 0, geo: 0, __v: 0 } }) {
        const closestRegions = await Region.find(
            { geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: geo }, $maxDistance: 1 } } },
            fields, { lean: true, limit: maxRegionLevel + 1 }
        ).exec();

        const result = [];
        const region = closestRegions.sort(sortDeepestFirst)[0];

        if (_.isEmpty(region)) {
            if (regionCacheHash[defRegion]) {
                result.push(regionCacheHash[defRegion]);
            }
        } else {
            if (region.parents && region.parents.length) {
                const parentRegions = await Region.find({ cid: { $in: region.parents } }, fields, { lean: true }).exec();
                const parentRegionsMap = parentRegions.reduce((map, region) => map.set(region.cid, region), new Map());

                for (const cid of region.parents) {
                    const region = parentRegionsMap.get(cid);

                    if (region) {
                        result.push(parentRegionsMap.get(cid));
                    }
                }
            }

            result.push(region);
        }

        return result;
    };
}());

async function giveRegionsByGeo({ geo }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    if (!Utils.geo.checkLatLng(geo)) {
        throw new BadParamsError();
    }

    geo.reverse();

    const regions = await this.call(
        'region.getRegionsByGeoPoint', { geo, fields: { _id: 0, cid: 1, title_local: 1, parents: 1, title_en: 1 } }
    );

    if (_.isEmpty(regions)) {
        throw new NotFoundError(constantsError.NO_SUCH_REGIONS);
    }

    // Add public stat for each region
    fillRegionsPublicStats(regions);

    const regionsArr = [];

    for (let i = 0; i <= maxRegionLevel; i++) {
        if (regions[i]) {
            regionsArr[regions[i].parents.length] = regions[i];
        }
    }

    // In case of missing regions in the hierarchy (such shouldn't be), remove empty values
    return { geo: geo.reverse(), regions: _.compact(regionsArr) };
}

/**
 * Set to object regions fields r0-rmaxRegionLevel based on a given coordinate
 * @param obj Object (photo, comment etc.)
 * @param geo Coordinate
 * @param returnArrFields Array of selecting fields. Array of regions with selected fields will be reterned
 */
export async function setObjRegionsByGeo({ obj, geo, returnArrFields = { _id: 0, cid: 1, parents: 1 } }) {
    if (!returnArrFields.cid || !returnArrFields.parents) {
        returnArrFields.cid = 1;
        returnArrFields.parents = 1;
    }

    const regions = await this.call('region.getRegionsByGeoPoint', { geo, fields: returnArrFields });

    if (_.isEmpty(regions)) {
        throw new NotFoundError(constantsError.NO_SUCH_REGIONS);
    }

    const regionsArr = [];

    for (let i = 0; i <= maxRegionLevel; i++) {
        const region = regions[i];

        if (region) {
            obj['r' + region.parents.length] = region.cid;
            regionsArr[region.parents.length] = region;
        } else {
            obj['r' + i] = undefined;
        }
    }

    return regionsArr;
}

/**
 * Set to object regions fields r0-rmaxRegionLevel based on region cid
 * @param obj Object (photo, comment etc.)
 * @param cid Region cid
 * @param returnArrFields Array of selecting fields. Array of regions with selected fields will be reterned
 */
export const setObjRegionsByRegionCid = (obj, cid, returnArrFields) => {
    const region = regionCacheHash[cid];

    if (!region) {
        return false;
    }

    // First zeroize all fields
    for (let i = 0; i <= maxRegionLevel; i++) {
        obj['r' + i] = undefined;
    }

    const regionsArr = [];

    // If parents exists, assign them
    if (region.parents) {
        region.parents.forEach(cid => {
            const region = regionCacheHash[cid];

            if (region) {
                obj['r' + region.parents.length] = cid;
                regionsArr.push(returnArrFields ? _.pick(region, returnArrFields) : region);
            }
        });
    }

    // Assing transfered region
    obj['r' + region.parents.length] = cid;
    regionsArr.push(returnArrFields ? _.pick(region, returnArrFields) : region);

    return regionsArr;
};

/**
 * Assign regions to object of specified model by specified criteria through update (multi assignment)
 * @param model
 * @param criteria
 * @param regions Array or regions with mandatory cid
 * @param additionalUpdate
 */
async function updateObjsRegions({ model, criteria = {}, regions = [], additionalUpdate }) {
    const $set = {};
    const $unset = {};
    const $update = {};

    for (let i = 0; i <= maxRegionLevel; i++) {
        const region = regions[i];

        if (region) {
            $set['r' + (Array.isArray(region.parents) ? region.parents.length : 0)] = region.cid;
        } else {
            $unset['r' + i] = 1;
        }
    }

    if (Object.keys($set).length) {
        $update.$set = $set;
    }

    if (Object.keys($unset).length) {
        $update.$unset = $unset;
    }

    if (additionalUpdate) {
        _.merge($update, additionalUpdate);
    }

    if (Object.keys($update).length) {
        await model.update(criteria, $update, { multi: true }).exec();
    }
}

/**
 * Clear all regions from object
 * @param obj Object (photo, comment etc.)
 */
export const clearObjRegions = obj => {
    for (let i = 0; i <= maxRegionLevel; i++) {
        obj['r' + i] = undefined;
    }
};

// Save array of regions _ids in specified user field
export async function setUserRegions({ login, regions: regionsCids, field }) {
    const $update = {};

    if (_.isEmpty(regionsCids)) {
        $update.$unset = { [field]: 1 };
    } else {
        // Check that transfered valid region numbers
        for (const cid of regionsCids) {
            if (typeof cid !== 'number' || !regionCacheHash[cid]) {
                throw new BadParamsError();
            }
        }

        const regions = await getOrderedRegionList(regionsCids, { geo: 0 });

        if (regions.length !== regionsCids.length) {
            throw new NotFoundError(constantsError.NO_SUCH_REGIONS);
        }

        const regionsIdsSet = new Set();

        for (const region of regions) {
            regionsIdsSet.add(String(region._id));
        }

        // Check that the regions are not relatives
        for (const region of regions) {
            for (const parent of region.parents) {
                if (regionsIdsSet.has(String(parent))) {
                    throw new NotFoundError(constantsError.REGION_NO_RELATIVES);
                }
            }
        }

        $update.$set = { [field]: [...regionsIdsSet] };
    }

    return User.update({ login }, $update).exec();
}

async function saveUserHomeRegion({ login, cid }) {
    const { handshake: { usObj: iAm } } = this;
    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    cid = Number(cid);

    if (!login || !cid) {
        throw new BadParamsError();
    }

    const userObjOnline = _session.getOnline({ login });
    let region;
    let user;

    [user, region] = await Promise.all([
        userObjOnline ? userObjOnline.user : User.findOne({ login }).exec(),
        Region.findOne(
            { cid },
            { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 }
        ).exec(),
    ]);

    if (!user || !region) {
        throw new NotFoundError(constantsError[!user ? 'NO_SUCH_USER' : 'NO_SUCH_REGION']);
    }

    user.regionHome = region;
    user = await user.save();

    // Need to take exactly from 'region', because 'user.regionHome' will be object only in case of populated region,
    // when user is online (in case of offline user will be just _id)
    const regionHome = _.omit(region.toObject(), '_id');

    if (user.settings.r_as_home) {
        await this.call('region.setUserRegions', { login, regions: [regionHome.cid], field: 'regions' });

        if (userObjOnline) {
            await _session.regetUser(userObjOnline, true);
        }
    } else if (userObjOnline) {
        await _session.emitUser({ usObj: userObjOnline, wait: true });
    }

    return { saved: 1, region: regionHome };
}

// Save regions to user
async function saveUserRegions({ login, regions }) {
    const { socket, handshake: { usObj: iAm } } = this;
    const itsMe = iAm.registered && iAm.user.login === login;

    if (!itsMe && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!login || !Array.isArray(regions)) {
        throw new BadParamsError();
    }

    if (regions.length > 10) {
        throw new BadParamsError(constantsError.REGION_SELECT_LIMIT);
    }

    // Check that transfered valid region numbers
    for (const cid of regions) {
        if (typeof cid !== 'number' || !regionCacheHash[cid]) {
            throw new BadParamsError();
        }
    }

    const userObjOnline = _session.getOnline({ login });
    const user = userObjOnline ? userObjOnline.user : await User.findOne({ login }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    await this.call('region.setUserRegions', { login, regions, field: 'regions' });

    // We can't just assign array of regions to user and save him
    // https://github.com/LearnBoost/mongoose/wiki/3.6-Release-Notes
    // #prevent-potentially-destructive-operations-on-populated-arrays
    // Need to do user.update({$set: regionsIds}), and then user.regions = regionsIds; next populate regions
    // But after that 'user.save()' works incorrect, and array of regions in db will be filled by null's
    // https://groups.google.com/forum/?fromgroups#!topic/mongoose-orm/ZQan6eUV9O0
    // So completely reget user from db
    if (userObjOnline) {
        await _session.regetUser(userObjOnline, true, socket);
    }

    return { saved: 1 };
}

/**
 * Return query for selecting by regions kind '$or: [{r0: 1}, {r1: {$in: [3, 4]}}, {r2: 10}]' and hash of regions
 * @param regions Array of populated regions
 * @returns {{rquery: {}, rhash: {}}}
 */
export const buildQuery = (regions, rs, regionsToExclude, insensitiveForRsCidsSet) => {
    let rquery = Object.create(null);
    const rhash = Object.create(null);
    const result = { rquery, rhash };

    if (_.isEmpty(regions)) {
        return result;
    }

    const levels = new Map();
    const filterBySublevelExistence = Array.isArray(rs);
    const subRegions = filterBySublevelExistence && Boolean(Number(rs[0]));

    // Forming request for the regions
    for (const region of regions) {
        rhash[region.cid] = region;

        const level = region.parents.length;
        let levelObject = levels.get(level);

        if (!levelObject) {
            levelObject = { rCids: [] };
            levels.set(level, levelObject);
        }

        levelObject.rCids.push(region.cid);
    }

    // If array of excluded region cids passed and there is no subregion setting or it is set to 'must exist',
    // calculate array if excluded region for each level of included region
    if (regionsToExclude && regionsToExclude.length && (!filterBySublevelExistence || subRegions)) {
        const rehash = Object.create(null);

        for (const reRegion of regionsToExclude) {
            // Check that parent of excluding region is not in excluded list already
            if (rehash[reRegion.cid]) {
                continue;
            }

            let includedRegion;

            for (const parentCid of reRegion.parents) {
                includedRegion = rhash[parentCid];

                if (includedRegion) {
                    break;
                }
            }

            // Check that at least one parent of excluding region is in the list of including regions
            if (!includedRegion) {
                continue;
            }

            const level = includedRegion.parents.length;
            const levelObject = levels.get(level);

            if (!levelObject.reRegions) {
                levelObject.reRegions = [];
            }

            levelObject.reRegions.push(reRegion);
            rehash[reRegion.cid] = reRegion;
        }

        if (Object.keys(rehash).length) {
            result.rehash = rehash;
        }
    }

    rquery.$or = [];

    for (const [level, { rCids, reRegions }] of levels.entries()) {
        const $orobj = {};

        if (filterBySublevelExistence && insensitiveForRsCidsSet && rCids.some(cid => insensitiveForRsCidsSet.has(cid))) {
            // If rs filter is active and insensitive cids have been passed (usually for modarators subregions)
            // we should make separate query for sensitive and insensitive cids,
            // because insensitive cids should not depend on subregions existence
            const $or = [];
            const [rcidsSensitive, rcidsInsensitive] = rCids.reduce((result, cid) => {
                result[insensitiveForRsCidsSet.has(cid) ? 1 : 0].push(cid);

                return result;
            }, [[], []]);

            if (rcidsSensitive.length) {
                const obj = {};

                if (rcidsSensitive.length === 1 && !reRegions) {
                    obj['r' + level] = rcidsSensitive[0];
                } else {
                    obj['r' + level] = { $in: rcidsSensitive };
                }

                if (filterBySublevelExistence) {
                    obj[`r${level + 1}`] = { $exists: subRegions };
                }

                $or.push(obj);
            }

            if (rcidsInsensitive.length) {
                const obj = {};

                if (rcidsInsensitive.length === 1 && !reRegions) {
                    obj['r' + level] = rcidsInsensitive[0];
                } else {
                    obj['r' + level] = { $in: rcidsInsensitive };
                }

                $or.push(obj);
            }


            if ($or.length === 1) {
                Object.assign($orobj, $or[0]);
            } else {
                // result will be like
                // $or: [{r1: {$in: [3,5]}, r2: {$exists: true}}, {r1: {$in: [7]}}]
                $orobj.$or = $or;
            }
        } else {
            if (rCids.length === 1 && !reRegions) {
                $orobj['r' + level] = rCids[0];
            } else {
                $orobj['r' + level] = { $in: rCids };
            }

            if (filterBySublevelExistence) {
                $orobj[`r${level + 1}`] = { $exists: subRegions };
            }
        }

        if (reRegions) {
            for (const region of reRegions) {
                const reLevel = region.parents.length;
                let queryObj = $orobj['r' + reLevel];

                if (!queryObj) {
                    queryObj = $orobj['r' + reLevel] = { $nin: [] };
                } else if (!queryObj.$nin) {
                    queryObj.$nin = [];
                }

                queryObj.$nin.push(region.cid);
            }
        }

        rquery.$or.push($orobj);
    }

    if (rquery.$or.length === 1) {
        rquery = result.rquery = rquery.$or[0];
    }

    if (filterBySublevelExistence) {
        result.withSubRegion = subRegions;
    }

    // console.log(JSON.stringify(rquery));
    return result;
};

export const buildGlobalReQuery = regionsToExclude => {
    const rquery = Object.create(null);
    const rhash = Object.create(null);
    const result = { rquery, rhash };

    if (_.isEmpty(regionsToExclude)) {
        return result;
    }

    const levels = new Map();

    for (const region of regionsToExclude) {
        rhash[region.cid] = region;

        const level = region.parents.length;
        let levelCids = levels.get(level);

        if (!levelCids) {
            levelCids = [];
            levels.set(level, levelCids);
        }

        levelCids.push(region.cid);
    }

    for (const [level, cids] of levels.entries()) {
        rquery['r' + level] = cids.length === 1 ? { $ne: cids[0] } : { $nin: cids };
    }

    return result;
};


const $incRegionPhotoStat = function ({ regionsMap, state: { s, type, geo, regions, cc = 0, ccd = 0 }, sign = 1 }) {
    const imageField = type === constants.photo.type.PHOTO ? 'photostat' : 'paintstat';
    const geoExists = Utils.geo.check(geo);
    const call = cc + ccd;

    regions.forEach((cid, index, regions) => {
        const region$inc = regionsMap.get(cid) || Object.create(null);

        region$inc[`${imageField}.all`] = (region$inc[`${imageField}.all`] || 0) + sign;
        region$inc[`${imageField}.s${s}`] = (region$inc[`${imageField}.s${s}`] || 0) + sign;

        if (geoExists) {
            region$inc[`${imageField}.geo`] = (region$inc[`${imageField}.geo`] || 0) + sign;
        }

        if (index === regions.length - 1) {
            region$inc[`${imageField}.own`] = (region$inc[`${imageField}.own`] || 0) + sign;

            if (geoExists) {
                region$inc[`${imageField}.owngeo`] = (region$inc[`${imageField}.owngeo`] || 0) + sign;
            }
        }

        if (call) {
            region$inc['cstat.all'] = (region$inc['cstat.all'] || 0) + sign * call;

            if (cc) {
                region$inc[`cstat.s${s}`] = (region$inc[`cstat.s${s}`] || 0) + sign * cc;
            }

            if (ccd) {
                region$inc['cstat.del'] = (region$inc['cstat.del'] || 0) + sign * ccd;
            }
        }

        regionsMap.set(cid, region$inc);
    });
};

let drainTimeout = null;
let drainingPromise = null;
let statsIsBeingRecalc = false;
let drainingPhotoCidsSet = new Set();

function regionStatQueueDrain(limit) {
    clearTimeout(drainTimeout);
    drainTimeout = null;

    if (statsIsBeingRecalc) {
        scheduleRegionStatQueueDrain();

        return;
    }

    if (drainingPromise) {
        return drainingPromise;
    }

    logger.info('Draining stat starting');

    drainingPromise = (async function () {
        const findOptions = { lean: true, sort: { stamp: 1 } };

        if (limit) {
            findOptions.limit = limit;
        }

        // Find photos in stat queue
        const stats = await RegionStatQueue.find({}, { _id: 0, cid: 1, state: 1 }, findOptions).exec();

        if (!stats.length) {
            return;
        }

        // Get photos cids array
        const photoCids = stats.map(stat => stat.cid);

        // Fill set of photos cids that are going to be drained
        drainingPhotoCidsSet = new Set(photoCids);

        // Find all photos that are going to be drained
        const photos = await Photo.find(
            { cid: { $in: photoCids } },
            { _id: 0, cid: 1, s: 1, type: 1, geo: 1, ccount: 1, cdcount: 1, ...regionsAllSelectHash },
            { lean: true }
        ).exec();

        if (photos.length !== stats.length) {
            logger.warn(`Stat queue length ${stats.length} is not equal to number of photos ${photos.length}`);

            await removeDrainedRegionStat();

            return;
        }

        const regionsMap = new Map();
        const photosMap = photos.reduce((map, photo) => map.set(photo.cid, photo), new Map());

        // Iterate over each stat record and calculate final delta for each region in all stat records
        for (const { cid, state } of stats) {
            // If regions exists in time of photo's first change, decrement stat of each regions by values of that state
            if (Array.isArray(state.regions) && state.regions.length) {
                $incRegionPhotoStat({ regionsMap, state, sign: -1 });
            }

            const photo = photosMap.get(cid);
            const regions = getObjRegionCids(photo);

            // If regions exists for current photo (actual state), increment stat of each regions by current values
            if (regions.length) {
                $incRegionPhotoStat({ regionsMap, state: {
                    s: photo.s, type: photo.type, geo: photo.geo, regions, cc: photo.ccount, ccd: photo.cdcount,
                } });
            }
        }

        // Get only valuable deltas for each region, and update it in db and regions cache
        const updatePromises = [];

        for (const [cid, inc] of regionsMap.entries()) {
            let count = 0;
            const $inc = _.transform(inc, (result, value, key) => {
                if (value) {
                    count++;
                    result[key] = value;
                }
            }, Object.create(null));

            if (count) {
                updatePromises.push(Region.update({ cid }, { $inc }).exec());

                const region = regionCacheHash[cid];

                if (region) {
                    // Update each stat value in general regionCacheHash
                    _.forOwn($inc, (delta, key) => {
                        _.set(region, key, _.get(region, key, 0) + delta);
                    });

                    // Then update stat in each public and admin caches
                    fillPublicAndAdminMaps(region);
                }
            }
        }

        if (updatePromises.length) {
            await Promise.all(updatePromises);
        }

        await removeDrainedRegionStat();
        logger.info(`Drained ${stats.length} stats for ${updatePromises.length} regions`);
    }())
        .catch(error => {
            logger.error('Stat queue drain failed', error);
        })
        .then(() => {
            drainingPromise = null;
            scheduleRegionStatQueueDrain();
        });

    return drainingPromise;
}

async function removeDrainedRegionStat() {
    if (drainingPhotoCidsSet.size) {
        const photoCidsToRemove = Array.from(drainingPhotoCidsSet);

        drainingPhotoCidsSet = new Set();
        await RegionStatQueue.remove({ cid: { $in: photoCidsToRemove } }).exec();
    }
}

export function scheduleRegionStatQueueDrain() {
    if (!drainTimeout && config.primary) {
        drainTimeout = setTimeout(regionStatQueueDrain, ms('1m'), 1000);
    }
}

export async function putPhotoToRegionStatQueue(oldPhoto, newPhoto) {
    const regionCids = getObjRegionCids(oldPhoto);
    const { cid, s, type, geo, ccount: cc = 0, cdcount: ccd = 0 } = oldPhoto;

    // If new photo info has been passed, check if we need to update stat by comparing properties which are taken into account
    if (newPhoto) {
        const newRegionCids = getObjRegionCids(newPhoto);
        const { s: newS, type: newType, geo: newGeo, ccount: newcc = 0, cdcount: newccd = 0 } = newPhoto;
        const geoExists = Utils.geo.check(geo);
        const newGeoExists = Utils.geo.check(newGeo);
        const geoExistenceChanged = !geoExists && newGeoExists || geoExists && !newGeoExists;
        const statInfoCanged =
            s !== newS || type !== newType ||
            !_.isEqual(regionCids, newRegionCids) || geoExistenceChanged ||
            cc !== newcc || ccd !== newccd;

        if (!statInfoCanged) {
            return;
        }
    }

    let updateMethod;

    // If current photo is being drained now,
    // replace its state in queue with current state and
    // remove it from drain set to avoid removing it from queue on regionStatQueueDrain finish
    if (drainingPhotoCidsSet.has(cid)) {
        updateMethod = '$set';
        drainingPhotoCidsSet.delete(cid);
    } else {
        updateMethod = '$setOnInsert';
    }

    await RegionStatQueue.update({ cid }, { [updateMethod]: {
        stamp: new Date(), cid,
        state: { s, type, geo: _.isEmpty(geo) ? undefined : geo, regions: regionCids, cc, ccd },
    } }, { upsert: true }).exec();
}

async function recalcStats(cids = [], refillCache = false) {
    if (statsIsBeingRecalc) {
        return { running: true };
    }

    // If we are going to recalc some regions, drain queue
    // Otherwise whole queue will be dropped in calcRegionStats, because anyway everything will be recalculated
    if (cids.length) {
        await regionStatQueueDrain();
    }

    statsIsBeingRecalc = true;

    try {
        // Update all regions stats
        const result = await dbEval('calcRegionStats', [cids], { nolock: true });

        if (refillCache) {
            await fillCache(); // Refresh regions cache
        }

        return result;
    } finally {
        statsIsBeingRecalc = false;
    }
}

async function recalcStatistics({ cids = [] }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    try {
        return recalcStats(cids, true);
    } catch (error) {
        logger.warn('Failed to calculate recalcStatistics', error);
        throw new ApplicationError({ message: error.message });
    }
}

give.isPublic = true;
save.isPublic = true;
remove.isPublic = true;
recalcStatistics.isPublic = true;
giveListFull.isPublic = true;
giveListPublic.isPublic = true;
giveListPublicString.isPublic = true;
giveRegionsByGeo.isPublic = true;
saveUserHomeRegion.isPublic = true;
saveUserRegions.isPublic = true;
processFeatureCollection.isPublic = true;

export default {
    give,
    save,
    remove,
    recalcStatistics,
    giveListFull,
    giveListPublic,
    giveListPublicString,
    giveRegionsByGeo,
    saveUserHomeRegion,
    saveUserRegions,
    processFeatureCollection,

    setUserRegions,
    getObjRegionList,
    updateObjsRegions,
    setObjRegionsByGeo,
    getRegionsByGeoPoint,
};
