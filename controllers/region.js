import _ from 'lodash';
import log4js from 'log4js';
import config from '../config';
import Utils from '../commons/Utils';
import { waitDb, dbEval } from './connection';
import constants from './constants.js';
import * as _session from './_session.js';
import { User } from '../models/User';
import { Photo } from '../models/Photo';
import { Region } from '../models/Region';
import { Comment } from '../models/Comment';
import { Counter } from '../models/Counter';

export let DEFAULT_HOME = null;
export const regionsAllSelectHash = Object.create(null);

const logger = log4js.getLogger('region.js');
const maxRegionLevel = constants.region.maxLevel;
const nogeoRegion = { cid: 0, title_en: 'Where is it?', title_local: 'Где это?' };
const msg = {
    badParams: 'Bad params',
    deny: 'You do not have permission for this action',
    nouser: 'Requested user does not exist',
    noregion: 'Requested region does not exist',
    noregions: 'No regions'
};

let regionCacheArr = []; // Array-cache of regions  [{ _id, cid, parents }]
let regionCacheHash = {}; // Hash-cache of regions { cid: { _id, cid, parents } }

let regionCacheArrPromise;

for (let i = 0; i <= maxRegionLevel; i++) {
    regionsAllSelectHash['r' + i] = 1;
}

export const ready = waitDb.then(fillCache);

// Заполняем кэш (массив и хэш) регионов в память
async function fillCache() {
    try {
        regionCacheArr = await Region.find(
            {},
            { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1 },
            { lean: true, sort: { cid: 1 } }
        ).exec();

        regionCacheArrPromise = Promise.resolve({ regions: regionCacheArr });

        regionCacheHash = _.transform(regionCacheArr, (result, region) => {
            result[region.cid] = region;
        }, { '0': nogeoRegion }); // Zero region means absence of coordinates

        DEFAULT_HOME = regionCacheHash[config.regionHome] || regionCacheArr[0];
        logger.info('Region cache filled with ' + regionCacheArr.length);
    } catch (err) {
        err.message = `FillCache: ${err.message}`;
        throw err;
    }
}

export const getRegionFromCache = cid => regionCacheHash[cid];
export const getRegionsArrFromCache = cids => _.transform(cids, (result, cid) => {
    const region = regionCacheHash[cid];

    if (region !== undefined) {
        result.push(region);
    }
});
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
        for (const i in hash) {
            const region = regionCacheHash[i];

            hash[i] = {};

            for (const field of fileds) {
                hash[i][field] = region[field];
            }
        }
    } else {
        for (const i in hash) {
            hash[i] = regionCacheHash[i];
        }
    }

    return hash;
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
};

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
};

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

        for (const cid in rhash) {
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
        for (j = maxRegionLevel; j--;) {
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
            delete obj.geo;
            for (j = 0; j <= maxRegionLevel; j++) {
                delete obj['r' + j];
            }
        }
    }

    if (Object.keys(shortRegionsHash).length) {
        fillRegionsHash(shortRegionsHash, ['cid', 'title_local']);
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
        throw { message: `Cant find region ${cidOrRegion}] find for calcRegionIncludes` };
    }

    const level = 'r' + region.parents.length;

    // First clear assignment of objects with coordinates to region
    const unsetObject = { $unset: { [level]: 1 } };
    const [{n: photosCountBefore = 0 }, { n: commentsCountBefore = 0 }] = await* [
        Photo.update({ geo: { $exists: true }, [level]: region.cid }, unsetObject, { multi: true }).exec(),
        Comment.update({ geo: { $exists: true }, [level]: region.cid }, unsetObject, { multi: true }).exec()
    ];

    // Then assign to region on located in it polygon objects
    const setObject = { $set: { [level]: region.cid } };
    const [{ n: photosCountAfter = 0 }, { n: commentsCountAfter = 0 }] = await* [
        Photo.update({ geo: { $geoWithin: { $geometry: region.geo } } }, setObject, { multi: true }).exec(),
        Comment.update({ geo: { $geoWithin: { $geometry: region.geo } } }, setObject, { multi: true }).exec()
    ];

    return { cid: region.cid, photosCountBefore, commentsCountBefore, photosCountAfter, commentsCountAfter };
}

/**
 * Recalculate what objects belong to list of region. If list is empty - recalc all regions
 * @param cids Array of regions cids
 */
export async function calcRegionsIncludes(cids) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!Array.isArray(cids)) {
        throw { message: msg.badParams };
    }

    let result;

    if (_.isEmpty(cids)) {
        // If array is empty - recalc all photos
        result = await dbEval('regionsAssignObjects', [], { nolock: true });

        if (result && result.error) {
            throw { message: result.message };
        }
    } else {
        // Recalc every region in loop
        result = [];

        for (const cid of cids) {
            result.push(await calcRegionIncludes(cid));
        }
    }

    return result;
};

/**
 * Returns for region it populated parents and number of children
 * @param region Region object
 */
async function getChildsLenByLevel(region) {
    let level = _.size(region.parent); // Region level equals number of parent regions

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

        return _.compact(await* promises);
    } else {
        // If level is maximum just move to the mext step
        return [];
    }
};

/**
 * Возвращает для региона спопулированные parents и кол-во дочерних регионов по уровням
 * @param region Объект региона
 */
async function getParentsAndChilds(region) {
    const level = _.size(region.parents); // Region level equals number of parent regions

    return await* [
        getChildsLenByLevel(region),
        // If parents regions exist - populate them
        level ? getOrderedRegionList(region.parents) : null
    ];
};

async function changeRegionParentExternality(region, oldParentsArray, childLenArray) {
    const levelWas = oldParentsArray.length;
    const levelNew = region.parents.length;
    const levelDiff = Math.abs(levelWas - levelNew); // The difference between the levels
    const childLen = childLenArray.length;

    async function updateObjects(query, update) {
        return await* [
            Photo.update(query, update, { multi: true }).exec(),
            Comment.update(query, update, { multi: true }).exec()
        ];
    };

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
            queryObj = {['r' + levelWas]: region.cid};
            setObj = { $unset: {} };
            for (i = levelNew; i < levelWas; i++) {
                setObj.$unset['r' + i] = 1;
            }

            await updateObjects(queryObj, setObj);
        }

        // Sequentally rename to upper level, begining from top moved
        queryObj = { ['r' + levelWas]: region.cid };
        for (i = levelWas; i <= levelWas + childLen; i++) {
            if (i === (levelWas + 1)) {
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
        let queryObj;
        let setObj;

        queryObj = { ['r' + levelWas]: region.cid };
        for (let i = levelWas + childLen; i >= levelWas; i--) {
            setObj = { $rename: { ['r' + i]: 'r' + (i + levelDiff) } };
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
        const [parentRegions, childRegions] = await* [
            // Find _ids of new parent regions
            Region.find({ cid: { $in: region.parents } }, { _id: 1 }, { lean: true }).exec(),
            // Find _ids of all children regions of moving region
            Region.find({ parents: region.cid }, { _id: 1 }, { lean: true }).exec()
        ];

        // Array of _id of parents regions
        const parentRegionsIds = _.pluck(parentRegions, '_id');
        // Array of _ids of regions of moving branch (ie region itself and its children)
        const movingRegionsIds = _.pluck(childRegions, '_id');
        movingRegionsIds.unshift(region._id);

        const [{ n: affectedUsers = 0 }, { n: affectedMods = 0 }] = await* [
            // Remove subscription on moving regions of those users, who have subscription on new and on parent regions,
            // because in this case they'll have subscription on children automatically
            User.update({
                $and: [
                    { regions: { $in: parentRegionsIds } },
                    { regions: { $in: movingRegionsIds } }
                ]
            }, { $pull: { regions: { $in: movingRegionsIds } } }, { multi: true }).exec(),

            // Tha same with moderated regions
            User.update({
                $and: [
                    { mod_regions: { $in: parentRegionsIds } },
                    { mod_regions: { $in: movingRegionsIds } }
                ]
            }, { $pull: { mod_regions: { $in: movingRegionsIds } } }, { multi: true }).exec()
        ];

        return { affectedUsers, affectedMods };
    }

    // Calculate number of photos belongs to the region
    const countQuery = { ['r' + levelWas]: region.cid };
    const [affectedPhotos, affectedComments] = await* [
        Photo.count(countQuery).exec(), Comment.count(countQuery).exec()
    ];

    let affectedUsers;
    let affectedMods;
    let regionsDiff; // Array of cids of adding/removing regions

    if (!levelNew || (levelNew < levelWas && _.isEqual(oldParentsArray.slice(0, levelNew), region.parents))) {
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

/**
 * Save/Create region
 * @param data
 */
async function save(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    if (!_.isObject(data) || !data.title_en || !data.title_local) {
        throw { message: msg.badParams };
    }

    data.title_en = data.title_en.trim();
    data.title_local = data.title_local.trim();
    if (!data.title_en || !data.title_local) {
        throw { message: msg.badParams };
    }

    data.parent = data.parent && Number(data.parent);

    let parentsArray;

    if (data.parent) {
        if (data.cid && data.cid === data.parent) {
            throw { message: 'You trying to specify a parent himself' };
        }

        const parentRegion = await Region.findOne(
            { cid: data.parent }, { _id: 0, cid: 1, parents: 1 }, { lean: true }
        ).exec();

        if (_.isEmpty(parentRegion)) {
            throw { message: `Such parent region doesn't exists` };
        }

        parentsArray = parentRegion.parents || [];

        if (data.cid && parentsArray.includes(data.cid)) {
            throw { message: 'You specify the parent, which already has this region as his own parent' };
        }

        parentsArray.push(parentRegion.cid);
    } else {
        parentsArray = [];
    }

    if (typeof data.geo === 'string') {
        try {
            data.geo = JSON.parse(data.geo);
        } catch (err) {
            throw { message: `GeoJSON parse error! ${err.message}` };
        }

        if (data.geo.type === 'GeometryCollection') {
            data.geo = data.geo.geometries[0];
        }

        if (Object.keys(data.geo).length !== 2 ||
            !Array.isArray(data.geo.coordinates) || !data.geo.coordinates.length ||
            !data.geo.type || (data.geo.type !== 'Polygon' && data.geo.type !== 'MultiPolygon')) {
            throw { message: `It's not GeoJSON geometry!` };
        }
    } else if (data.geo) {
        delete data.geo;
    }

    let region;
    let parentChange;
    let parentsArrayOld;
    let childLenArray;
    const resultStat = {};

    if (!data.cid) {
        // Create new region object
        const count = await Counter.increment('region');

        if (!count) {
            throw ({ message: 'Increment comment counter error' });
        }

        region = new Region({ cid: count.next, parents: parentsArray });
    } else {
        // Find region by cid
        region = await Region.findOne({ cid: data.cid }).exec();

        if (!region) {
            throw ({ message: `Such region doesn't exists` });
        }

        parentChange = !_.isEqual(parentsArray, region.parents);

        if (parentChange) {
            childLenArray = await getChildsLenByLevel(region);
        }

        if (parentChange) {
            if (parentsArray.length > region.parents.length &&
                (parentsArray.length + childLenArray.length > maxRegionLevel)) {
                throw ({
                    message: `After moving the region, ` +
                    `it or its descendants will be greater than the maximum level (${maxRegionLevel + 1}).`
                });
            }

            parentsArrayOld = region.parents;
            region.parents = parentsArray;
        }

        region.udate = new Date();
    }

    // If 'geo' was updated - write it, marking modified, because it has type Mixed
    if (data.geo) {
        // If multipolygon contains only one polygon, take it and make type Polygon
        if (data.geo.type === 'MultiPolygon' && data.geo.coordinates.length === 1) {
            data.geo.coordinates = data.geo.coordinates[0];
            data.geo.type = 'Polygon';
        }

        // Count number of points
        region.pointsnum = data.geo.type === 'Point' ? 1 : Utils.calcGeoJSONPointsNum(data.geo.coordinates);

        if (data.geo.type === 'Polygon' || data.geo.type === 'MultiPolygon') {

            // TODO: determine polygon intersection, they must be segments inside one polygon,
            // then sort segments in one polygon by its area
            // *if (data.geo.type === 'MultiPolygon') {
            //    data.geo.coordinates.forEach(
            //        polygon => polygon.length > 1 ? polygon.sort(Utils.sortPolygonSegmentsByArea) : null
            //    );
            // } else if (data.geo.coordinates.length > 1) {
            //    data.geo.coordinates.sort(Utils.sortPolygonSegmentsByArea);
            // }*/

            // Count number of segments
            region.polynum = Utils.calcGeoJSONPolygonsNum(data.geo);
        } else {
            region.polynum = { exterior: 0, interior: 0 };
        }

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
            throw { message: `Saved, but while calculating included photos for the new geojson: ${err.message}` };
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
            throw { message: `Saved, but while change parent externality: ${err.message}` };
        }
    }

    try {
        await fillCache(); // Refresh regions cache
    } catch (err) {
        throw { message: `Saved, but while refilling cache: ${err.message}` };
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
    _session.regetUsers(function (usObj) {
        return usObj.rhash && usObj.rhash[region.cid] ||
            usObj.mod_rhash && usObj.mod_rhash[region.cid] ||
            usObj.user.regionHome && usObj.user.regionHome.cid === region.cid;
    }, true);

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
        throw { message: msg.deny };
    }

    if (!_.isObject(data) || !data.cid) {
        throw { message: msg.badParams };
    }

    const regionToRemove = await Region.findOne({ cid: data.cid }).exec();

    if (!regionToRemove) {
        throw { message: 'Deleting region does not exists'};
    }

    // if (data.reassignChilds && !regionToReassignChilds) {
    //  throw { message: 'Region for reassign descendants does not exists'};
    // }

    const removingLevel = regionToRemove.parents.length;

    const [childRegions, parentRegion] = await* [
        // Find all child regions
        Region.find({ parents: regionToRemove.cid }, { _id: 1 }, { lean: true }).exec(),
        // Find parent region for replacing with it user's home region (for those who have removing region as home),
        // If region has no parent (we removing whole country) - select any another country
        Region.findOne(
            removingLevel ?
            { cid: regionToRemove.parents[regionToRemove.parents.length - 1] } :
            { cid: { $ne: regionToRemove.cid }, parents: { $size: 0 } },
            { _id: 1, cid: 1, title_en: 1 }, { lean: true }
        ).exec()
    ];

    if (_.isEmpty(parentRegion)) {
        throw { message: `Can't find parent`};
    }

    // _ids of all removing regoions
    const removingRegionsIds = childRegions ? _.pluck(childRegions, '_id') : [];
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

    const [{ n: affectedPhotos = 0 }, { n: affectedComments = 0 }] = await* [
        // Update included photos
        Photo.update(objectsMatchQuery, objectsUpdateQuery, { multi: true }).exec(),
        // Update comments of included photos
        Comment.update(objectsMatchQuery, objectsUpdateQuery, { multi: true }).exec(),
        // Remove child regions
        Region.remove({ parents: regionToRemove.cid }).exec(),
        // Remove this regions
        regionToRemove.remove().exec()
    ];

    await fillCache(); // Refresh regions cache

    // If some users affected with region removal, reget all online users (because we don't know concrete of them)
    if (homeAffectedUsers || affectedUsers || modsResult.affectedMods) {
        _session.regetUsers('all', true);
    };

    return { removed: true, homeAffectedUsers, affectedUsers, affectedPhotos, affectedComments, ...modsResult };
}

async function removeRegionsFromMods(usersQuery, regionsIds) {
    // Find all moderators of removing regions
    const modUsers = await User.find(usersQuery, { cid: 1 }, { lean: true }).exec();
    const modUsersCids = _.isEmpty(modUsers) ? [] : _.pluck(modUsers, 'cid');

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
        throw { message: msg.deny };
    }

    if (!_.isObject(data) || !data.cid) {
        throw { message: msg.badParams };
    }

    const region = await Region.findOne({ cid: data.cid }, { _id: 0, __v: 0 }, { lean: true }).exec();

    if (!region) {
        throw { message: `Such region doesn't exists` };
    }

    const [childLenArr, parentsSortedArr] = await getParentsAndChilds(region);

    if (parentsSortedArr) {
        region.parents = parentsSortedArr;
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

    return { childLenArr, region };
}

// Returns array of count of all regions by levels
export async function getRegionsCountByLevel() {
    const promises = [];

    for (let i = 0; i <= maxRegionLevel; i++) {
        promises.push(Region.count({ parents: { $size: i } }).exec());
    }

    return await* promises;
}

// Return stat of regions by level (number of regions, total vertex)
async function getRegionsStatByLevel() {
    return await Region.aggregate([
        // Fields for selection. level - formed field of size of parents array, eg. region level
        // Introduced in 2.5.3 https://jira.mongodb.org/browse/SERVER-4899
        { $project: { _id: 0, level: { $size: '$parents' }, pointsnum: 1 } },
        // Calculate indicator for every level
        { $group: { _id: '$level', regionsCount: { $sum: 1 }, pointsCount: { $sum: '$pointsnum' } } },
        // Sort by parent ascending
        { $sort: { _id: 1 } },
        // Retain only the necessary fields
        { $project: { regionsCount: 1, pointsCount: 1, _id: 0 } }
    ]).exec();
}

async function giveListFull(data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }

    const [regions, regionsStatByLevel] = await* [
        Region.find({}, { _id: 0, geo: 0, __v: 0 }, { lean: true }).exec(),
        getRegionsStatByLevel()
    ];

    if (!regions) {
        throw { message: 'No regions' };
    }

    const regionsStatCommon = { regionsCount: 0, pointsCount: 0 };

    // General indicators (composed by levels)
    for (let i = regionsStatByLevel.length; i--;) {
        regionsStatCommon.regionsCount += regionsStatByLevel[i].regionsCount;
        regionsStatCommon.pointsCount += regionsStatByLevel[i].pointsCount;
    }

    return { regions, stat: { common: regionsStatCommon, byLevel: regionsStatByLevel } };
}

export const giveListPublic = () => regionCacheArrPromise;

// Returns an array of regions in which a given point falls
const getRegionsByGeoPoint = (function () {
    const defRegion = 1000000; // If the region is not found, return the Open sea

    return async function({ geo, fields = { _id: 0, geo: 0, __v: 0 } }) {
        const regions = await Region.find(
            { geo: { $nearSphere: { $geometry: { type: 'Point', coordinates: geo }, $maxDistance: 1 } } },
            fields, { lean: true, sort: { parents: -1 } }
        ).exec();

        if (_.isEmpty(regions)) {
            if (regionCacheHash[defRegion]) {
                regions.push(regionCacheHash[defRegion]);
            }
        }

        return regions;
    };
}());

async function giveRegionsByGeo({ geo }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }
    if (!Utils.geo.checkLatLng(geo)) {
        throw { message: msg.badParams };
    }
    geo.reverse();

    const regions = await this.call(
        'region.getRegionsByGeoPoint', { geo, fields: { _id: 0, cid: 1, title_local: 1, parents: 1 } }
    );

    if (_.isEmpty(regions)) {
        throw { message: msg.noregions };
    }

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
        throw { message: msg.noregions };
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
        region.parents.forEach(function (cid) {
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
};

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
export async function setUserRegions({login, regions: regionsCids, field}) {
    const $update = {};

    if (_.isEmpty(regionsCids)) {
        $update.$unset = { [field]: 1 };
    } else {
        // Check that transfered valid region numbers
        for (const cid of regionsCids) {
            if (typeof cid !== 'number' || !regionCacheHash[cid]) {
                throw { message: msg.badParams };
            }
        }

        const regions = await getOrderedRegionList(regionsCids, { geo: 0 });

        if (regions.length !== regionsCids.length) {
            throw { message: 'You want to save nonexistent regions' };
        }

        const regionsIdsSet = new Set();

        for (const region of regions) {
            regionsIdsSet.add(String(region._id));
        }

        // Check that the regions are not relatives
        for (const region of regions) {
            for (const parent of region.parents) {
                if (regionsIdsSet.has(String(parent))) {
                    throw { message: 'Selected regions should not be relatives' };
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
        throw { message: msg.deny };
    }

    cid = Number(cid);

    if (!login || !cid) {
        throw { message: msg.badParams };
    }

    const userObjOnline = _session.getOnline({ login });
    let region;
    let user;

    [user, region] = await* [
        userObjOnline ? userObjOnline.user : User.findOne({ login }).exec(),
        Region.findOne(
            { cid },
            { _id: 1, cid: 1, parents: 1, title_en: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 }
        ).exec()
    ];

    if (!user || !region) {
        throw { message: !user ? msg.nouser : msg.noregion };
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
        throw { message: msg.deny };
    }
    if (!login || !Array.isArray(regions)) {
        throw { message: msg.badParams };
    }
    if (regions.length > maxRegionLevel) {
        throw { message: 'Вы можете выбрать до ' + maxRegionLevel + ' регионов' };
    }

    // Check that transfered valid region numbers
    for (const cid of regions) {
        if (typeof cid !== 'number' || !regionCacheHash[cid]) {
            throw { message: msg.badParams };
        }
    }

    const userObjOnline = _session.getOnline({ login });
    const user = userObjOnline ? userObjOnline.user : await User.findOne({ login }).exec();

    if (!user) {
        throw { message: msg.nouser };
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
};

/**
 * Return query for selecting by regions kind '$or: [{r0: 1}, {r1: {$in: [3, 4]}}, {r2: 10}]' and hash of regions
 * @param regions Array of populated regions
 * @returns {{rquery: {}, rhash: {}}}
 */
export const buildQuery = regions => {
    let rquery = Object.create(null);
    const rhash = Object.create(null);
    const result = { rquery, rhash };

    if (_.isEmpty(regions)) {
        return result;
    }

    const levels = {};
    rquery.$or = [];

    // Forming request for the regions
    for (let region of regions) {
        region = regionCacheHash[region.cid];
        rhash[region.cid] = region;

        const level = 'r' + region.parents.length;

        if (levels[level] === undefined) {
            levels[level] = [];
        }
        levels[level].push(region.cid);
    }

    _.forOwn(levels, (cids, level) => {
        const $orobj = {};

        if (cids.length === 1) {
            $orobj[level] = cids[0];
        } else if (cids.length > 1) {
            $orobj[level] = { $in: cids };
        }
        rquery.$or.push($orobj);
    });

    if (rquery.$or.length === 1) {
        rquery = rquery.$or[0];
    }
    // console.log(JSON.stringify(rquery));

    return { rquery, rhash };
};

give.isPublic = true;
save.isPublic = true;
remove.isPublic = true;
giveListFull.isPublic = true;
giveListPublic.isPublic = true;
giveRegionsByGeo.isPublic = true;
saveUserHomeRegion.isPublic = true;
saveUserRegions.isPublic = true;
export default {
    give,
    save,
    remove,
    giveListFull,
    giveListPublic,
    giveRegionsByGeo,
    saveUserHomeRegion,
    saveUserRegions,

    setUserRegions,
    getObjRegionList,
    updateObjsRegions,
    setObjRegionsByGeo,
    getRegionsByGeoPoint
};