import fs from 'fs';
import ms from 'ms';
import mv from 'mv';
import _ from 'lodash';
import path from 'path';
import log4js from 'log4js';
import moment from 'moment';
import config from '../config';
import Utils from '../commons/Utils';
import { waitDb, dbRedis } from './connection';
import constants from './constants';
import constantsError from '../app/errors/constants';
import * as session from './_session';
import * as regionController from './region';
import * as converter from './converter';
import * as userObjectRelController from './userobjectrel';
import { getReasonHashFromCache } from './reason';
import { userSettingsDef, userSettingsVars } from './settings';
import { ApplicationError, AuthorizationError, BadParamsError, InputError, NotFoundError, NoticeError } from '../app/errors';

import { User } from '../models/User';
import { Counter } from '../models/Counter';
import { Comment } from '../models/Comment';
import { Download } from '../models/Download';
import { Photo, PhotoMap, PaintingMap, PhotoHistory } from '../models/Photo';

const shift10y = ms('10y');
const loggerApp = log4js.getLogger('app');
const logger = log4js.getLogger('photo.js');
const incomeDir = path.join(config.storePath, 'incoming');
const privateDir = path.join(config.storePath, 'private/photos');

export const maxNewPhotosLimit = 1e4;

const {
    photo: {
        status,
        parsingFields,
        historyFields,
        historyFieldsDiff,
        watersignLength,
        watersignPattern,
    },
    region: {
        maxLevel: maxRegionLevel,
    },
} = constants;

const typesSet = new Set(_.values(constants.photo.type));
const photoYears = constants.photo.years[constants.photo.type.PHOTO];
const paintYears = constants.photo.years[constants.photo.type.PAINTING];
const photoRange = photoYears.max - photoYears.min;
const paintRange = paintYears.max - paintYears.min;

const allStatuses = _.values(status);
const allStatusesSet = new Set(allStatuses);
const openedStatuses = [status.PUBLIC, status.DEACTIVATE, status.REMOVE];
const openedStatusesSet = new Set(openedStatuses);
const publicDefaultStatus = [status.PUBLIC];
const userGalleryBySelfDefaultStatuses = [status.NEW, status.REVISION, status.READY, status.PUBLIC, status.DEACTIVATE];
const userGalleryByModeratorDefaultStatuses = [status.NEW, status.REVISION, status.READY, status.PUBLIC];

const parsingFieldsSet = new Set(parsingFields);
const historyFieldsDiffHash = historyFieldsDiff.reduce((result, field) => {
    result[field] = field;

    return result;
}, {});

const compactFields = {
    _id: 0,
    cid: 1,
    file: 1,
    s: 1,
    title: 1,
    year: 1,
    ccount: 1,
    conv: 1,
    convqueue: 1,
};
const compactFieldsForReg = {
    ...compactFields,

    _id: 1, // To calculate new comments
    user: 1, //  To understand if photo is mine
    ucdate: 1, // For checking of changes
    mime: 1, // For serving protected files
};
const compactFieldsWithRegions = { geo: 1, ...compactFields, ...regionController.regionsAllSelectHash };
const compactFieldsForRegWithRegions = { geo: 1, ...compactFieldsForReg, ...regionController.regionsAllSelectHash };

export const permissions = {
    // Determines whether the user can moderate the photo
    // If yes, then in case of region's moderator returns region's number,
    // in case of global moderator and admin returns 'true'
    canModerate(photo, usObj) {
        if (usObj.isModerator) {
            // If user has region's moderator role, watch on his regions
            if (!usObj.user.mod_regions || !usObj.user.mod_regions.length) {
                return true; // Global moderators can moderate everything
            }

            // If photo belongs one of the moderated regions, means user can moderate it
            // In this case return region's number
            const rhash = usObj.mod_rhash;

            for (let i = 0; i <= maxRegionLevel; i++) {
                const photoRegion = photo['r' + i];

                if (photoRegion && rhash[photoRegion] !== undefined) {
                    return photoRegion;
                }
            }
        } else if (usObj.isAdmin) {
            // If user is admin - he can
            return true;
        }

        return false;
    },
    getCan(photo, usObj, ownPhoto, canModerate) {
        const can = {
            // edit: [true, false]
            // ready: [true, false]
            // revision: [true, false]
            // revoke: [true, false]
            // reject: [true, false]
            // rereject: [true, false]
            // approve: [true, false]
            // activate: [true, false]
            // deactivate: [true, false]
            // remove: [true, false]
            // restore: [true, false]
            // convert: [true, false]
            // comment: [true, false]
            // watersign: [true, false]
            // nowatersign: [true, false]
            // download: [true, byrole, withwater, login, false]
            // protected: [true, false, undefined]
        };
        const s = photo.s;

        if (usObj.registered) {
            const isAdmin = usObj.isAdmin;

            if (typeof ownPhoto !== 'boolean') {
                ownPhoto = !!photo.user && User.isEqual(photo.user, usObj.user);
            }

            if (canModerate !== undefined && canModerate !== null) {
                canModerate = !!canModerate;
            } else {
                canModerate = !!permissions.canModerate(photo, usObj);
            }

            const userSettings = photo.user.settings || userSettingsDef;

            can.protected = permissions.can.protected(s, ownPhoto, canModerate, isAdmin);

            if ((s === status.PUBLIC || can.protected) && (
                // If setted individual that photo has now watersing
                photo.watersignIndividual && photo.watersignOption === false ||
                // If no individual watersign option and setted by profile that photo has no watersing
                !photo.watersignIndividual && userSettings.photo_watermark_add_sign === false ||
                // If individually setted allow to download origin
                photo.disallowDownloadOriginIndividual && !photo.disallowDownloadOrigin ||
                // If no individual downloading setting and setted by profile that photo has no watersing
                // or by profile allowed to download origin
                !photo.disallowDownloadOriginIndividual &&
                (userSettings.photo_watermark_add_sign === false || !userSettings.photo_disallow_download_origin))) {
                // Let download origin
                can.download = true;
            } else if (ownPhoto || isAdmin) {
                // Or if it photo owner or admin then allow to download origin with special sign on button
                can.download = 'byrole';
            } else if (s === status.PUBLIC) {
                // Otherwise registered user can download full-size photo only with watermark
                can.download = 'withwater';
            } else {
                can.download = false;
            }

            // Admin can always edit, moderator and owner always except own revoked or removed photo,
            can.edit = isAdmin ||
                s !== status.REMOVE && s !== status.REVOKE && (
                    canModerate ||
                    ownPhoto && (s === status.NEW || s === status.REVISION || !usObj.user.nophotoedit)
                ) || undefined;
            // Owner can send to premoderation if photo is new or on revision
            can.ready = (s === status.NEW || s === status.REVISION) && ownPhoto || undefined;
            // Revoke can only owner if photo is new
            can.revoke = s < status.REVOKE && ownPhoto && !usObj.user.nophotostatus || undefined;
            // Moderator can reject not his own photo until it's new
            can.reject = s < status.REVOKE && canModerate && !ownPhoto || undefined;
            // Administrator can resore rejected photo
            can.rereject = s === status.REJECT && isAdmin || undefined;
            // Remove can owner its deactivated photo or admin any published or deactivated photo
            can.remove = ownPhoto && !usObj.user.nophotostatus && s === status.DEACTIVATE ||
                isAdmin && (s === status.PUBLIC || s === status.DEACTIVATE) || undefined;
            // Restore from removed can only administrator
            can.restore = isAdmin && s === status.REMOVE || undefined;
            // Send to convert can only admin
            can.convert = isAdmin || undefined;
            // Any registered user can comment public or deactivated photo. Moderator - also removed photos (except owns)
            can.comment = s === status.PUBLIC || s === status.DEACTIVATE ||
                s === status.REMOVE && (isAdmin || canModerate && !ownPhoto) || undefined;

            // Change watermark sign and download setting can administrator and owner/moderator
            // if photo is not removed and administrator didn't prohibit it for this photo or entire owner
            can.watersign = isAdmin || (ownPhoto || canModerate) &&
                (s !== status.REMOVE || !photo.user.nowaterchange && !photo.nowaterchange || photo.nowaterchange === false) || undefined;
            // Administrator can prohibit watesign changing by owner/moderator
            can.nowaterchange = isAdmin || undefined;

            if (canModerate) {
                // Moderator can send to revision
                can.revision = s === status.READY || undefined;
                // Moderator can approve new photo
                can.approve = s < status.REJECT || undefined;
                // Moderator can activate only deactivated photo
                can.activate = s === status.DEACTIVATE || undefined;
                // Moderator can deactivate only published photo
                can.deactivate = s === status.PUBLIC || undefined;
            }
        } else {
            can.download = s === status.PUBLIC ? 'login' : false;

            // Anonyms must request covered files /_prn/ of unpublished photos
            if (s !== status.PUBLIC) {
                can.protected = false;
            }
        }

        return can;
    },
    canSee(photo, usObj) {
        // If photo was published once, anyone can see its page. Visiblity of image is controlled by can.protected
        if (photo.s >= status.PUBLIC) {
            return true;
        }

        if (usObj.registered && photo.user) {
            // Owner always can see his photos
            if (User.isEqual(photo.user, usObj.user)) {
                return true;
            }

            return permissions.canModerate(photo, usObj);
        }

        return false;
    },
    can: {
        // Who will see protected or covered file (without cover) if photo is not public:
        // Protected(true): owner and admin - always, moderator - only if photo is not yet removed
        // Covered(false): others
        // Public(undefined): if photo is public
        'protected': (s, ownPhoto, canModerate, isAdmin) => {
            if (s !== status.PUBLIC) {
                return ownPhoto || isAdmin || canModerate && s !== status.REMOVE || false;
            }
        },
    },
};

/**
 * Find photo considering user rights
 * @param query
 * @param fieldSelect Field select (mandatory are: user, s, r0-rmaxRegionLevel)
 * @param options For example, { lean: true }
 * @param populateUser Flag, that user object needed
 */
export async function find({ query, fieldSelect = {}, options = {}, populateUser }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        query.s = { $gte: status.PUBLIC }; // Anonyms can see only photos, that were published (even if deactivated then)
    }

    let photo = Photo.findOne(query, fieldSelect, options);

    if (populateUser) {
        photo = photo.populate({ path: 'user' });
    }

    photo = await photo.exec();

    if (!photo || !photo.user || !permissions.canSee(photo, iAm)) {
        throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
    }

    if (populateUser) {
        photo.user.settings = _.defaults(photo.user.settings || {}, userSettingsDef);
    }

    return photo;
}

export function getNewPhotosLimit(user) {
    let canCreate = 0;
    const pfcount = user.pfcount;

    if (user.rules && _.isNumber(user.rules.photoNewLimit)) {
        canCreate = Math.max(0, Math.min(user.rules.photoNewLimit, maxNewPhotosLimit) - pfcount);
    } else if (user.ranks && (user.ranks.includes('mec_silv') || user.ranks.includes('mec_gold'))) {
        // Silver and Gold metsenats have the maximum possible limit
        canCreate = maxNewPhotosLimit - pfcount;
    } else if (user.ranks && user.ranks.includes('mec')) {
        // Metsenat has a limit of 150
        canCreate = Math.max(0, 150 - pfcount);
    } else if (user.pcount < 15) {
        canCreate = Math.max(0, 10 - pfcount);
    } else if (user.pcount < 25) {
        canCreate = Math.max(0, 15 - pfcount);
    } else if (user.pcount < 50) {
        canCreate = Math.max(0, 20 - pfcount);
    } else if (user.pcount < 200) {
        canCreate = Math.max(0, 50 - pfcount);
    } else if (user.pcount < 1000) {
        canCreate = Math.max(0, 75 - pfcount);
    } else if (user.pcount >= 1000) {
        canCreate = Math.max(0, 150 - pfcount);
    }

    return canCreate;
}

async function getBounds(data) {
    const { bounds, z, year, year2, isPainting } = data;
    const years = isPainting ? paintYears : photoYears;

    // Determine whether fetch by years needed
    const hasYears = _.isNumber(year) && _.isNumber(year2) &&
        year >= years.min && year2 <= years.max && year2 >= year &&
        year2 - year < (isPainting ? paintRange : photoRange);
    let clusters;
    let photos;

    if (z < 17) {
        ({ photos, clusters } = await this.call(`cluster.${hasYears ? 'getBoundsByYear' : 'getBounds'}`, data));
    } else {
        const MapModel = isPainting ? PaintingMap : PhotoMap;
        const yearCriteria = hasYears ? year === year2 ? year : { $gte: year, $lte: year2 } : false;

        photos = await Promise.all(bounds.map(bound => {
            const criteria = { geo: { $geoWithin: { $box: bound } } };

            if (yearCriteria) {
                criteria.year = yearCriteria;
            }

            return MapModel.find(criteria, { _id: 0 }, { lean: true }).exec();
        }));

        photos = photos.length > 1 ? _.flatten(photos) : photos[0];
    }

    // Reverse geo
    photos.forEach(photo => photo.geo.reverse());

    return { photos, clusters };
}

async function give(params) {
    const { handshake: { usObj: iAm } } = this;
    const { cid, noselect } = params;
    const fieldNoSelect = {};

    if (!_.isEmpty(noselect)) {
        Object.assign(fieldNoSelect, noselect);
    }

    _.defaults(fieldNoSelect, { __v: 0, path: 0, format: 0, sign: 0, signs: 0, sdate: 0, converted: 0 }); // But we need 'mime' for _pr

    if (fieldNoSelect.frags === undefined) {
        fieldNoSelect['frags._id'] = 0;
    }

    let photo = await Photo.findOne({ cid }, fieldNoSelect).exec();

    if (!photo || !permissions.canSee(photo, iAm)) {
        throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
    }

    let owner;
    let online;
    const isMine = User.isEqual(iAm.user, photo.user);
    const userObj = isMine ? iAm : session.getOnline({ userId: photo.user });

    if (userObj) {
        online = true;
        owner = userObj.user;
    } else {
        owner = await User.findOne({ _id: photo.user }).exec();

        if (!owner) {
            throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
        }
    }

    const regionFields = photo.geo ? ['cid', 'title_en'] :
        // If photo has no coordinates, additionally take home position of regions
        { _id: 0, cid: 1, title_en: 1, center: 1, bbox: 1, bboxhome: 1 };

    const regions = await this.call('region.getObjRegionList', { obj: photo, fields: regionFields, fromDb: !photo.geo });

    // Add public stat for each region
    regionController.fillRegionsPublicStats(regions);

    photo = photo.toObject();
    owner = owner.toObject();

    // Assign owner after 'toObject', otherwise there would be just owner's _id
    photo.user = owner;

    const can = permissions.getCan(photo, iAm, isMine);
    const shouldBeEdit = iAm.registered && can.edit &&
        (params.forEdit || params.fullView && photo.s === status.NEW && isMine);

    photo.user = {
        login: owner.login,
        avatar: owner.avatar,
        disp: owner.disp,
        ranks: owner.ranks || [],
        sex: owner.sex,
    };

    if (shouldBeEdit) {
        // Serve user settings, only when photo is for editing
        photo.user.settings = online ? owner.settings : _.defaults(owner.settings || {}, userSettingsDef);
        photo.user.watersignCustom = owner.watersignCustom;

        if (can.nowaterchange) {
            photo.user.nowaterchange = owner.nowaterchange;
        }
    }

    if (online) {
        photo.user.online = true;
    }

    // Don't serve fragments of removed comments
    if (photo.frags) {
        const frags = [];

        for (const frag of photo.frags) {
            if (!frag.del) {
                frags.push(frag);
            }
        }

        photo.frags = frags;
    }

    for (let i = 0; i <= maxRegionLevel; i++) {
        delete photo['r' + i];
    }

    if (regions.length) {
        photo.regions = regions;
    }

    if (photo.geo) {
        photo.geo = photo.geo.reverse();
    }

    if (iAm.registered) {
        await userObjectRelController.fillObjectByRels(photo, iAm.user._id, 'photo', params.rel);
    }

    if (params.countView === true) {
        // Increment amount of views only for public photos
        if (photo.s === status.PUBLIC) {
            photo.vdcount = (photo.vdcount || 0) + 1;
            photo.vwcount = (photo.vwcount || 0) + 1;
            photo.vcount = (photo.vcount || 0) + 1;

            // Through increment in db, to avoid race conditions
            Photo.update({ cid }, { $inc: { vdcount: 1, vwcount: 1, vcount: 1 } }).exec();
        }

        // Update view stamp of object by user
        if (iAm.registered) {
            userObjectRelController.setObjectView(photo._id, iAm.user._id);
        }
    }

    if (can.protected) {
        try {
            await this.call('photo.putProtectedFileAccessCache', { file: photo.file, mime: photo.mime });
        } catch (err) {
            logger.warn(`${this.ridMark} Putting link to redis for protected ${cid} photo's file failed. Serve public.`, err);
            can.protected = false;
        }
    }

    delete photo._id;

    return { photo, can };
}

async function giveNewLimit({ login }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const userObj = session.getOnline({ login });
    const user = userObj ? userObj.user : await User.findOne({ login }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    return { limit: getNewPhotosLimit(user) };
}

function getUserWaterSign(user, photo) {
    const validOptionValues = userSettingsVars.photo_watermark_add_sign;
    let option;
    let result;

    if (photo && _.get(photo, 'watersignIndividual')) {
        option = _.get(photo, 'watersignOption');

        if (validOptionValues.includes(option)) {
            result = option === 'custom' && photo.watersignCustom ? photo.watersignCustom : Boolean(option);
        }
    }

    if (result === undefined) {
        option = _.get(user, 'settings.photo_watermark_add_sign');

        // If user watersign option is not valid, take default value
        if (!validOptionValues.includes(option)) {
            option = userSettingsDef.photo_watermark_add_sign;
        }

        result = option === 'custom' && user.watersignCustom ? user.watersignCustom : Boolean(option);
    }

    if (result === true) {
        result = 'uploaded by ' + user.login;
    } else if (result === false) {
        result = undefined;
    }

    return result;
}

// Create photos
// const dirs = ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'];
async function create({ files }) {
    const { socket, handshake: { usObj: iAm } } = this;

    if (!iAm.registered || iAm.user.nophotoupload) {
        throw new AuthorizationError();
    }

    if (!Array.isArray(files) && !_.isObject(files)) {
        throw new BadParamsError();
    }

    if (!Array.isArray(files)) {
        files = [files];
    }

    const cids = [];
    const user = iAm.user;
    const canCreate = getNewPhotosLimit(user);

    if (!canCreate || !files.length) {
        return { message: 'Nothing to save', cids };
    }

    if (files.length > canCreate) {
        files = files.slice(0, canCreate);
    }

    await Promise.all(files.map(item => new Promise((resolve, reject) => {
        item.fullfile = item.file.replace(/((.)(.)(.))/, '$2/$3/$4/$1');

        mv(path.join(incomeDir, item.file), path.join(privateDir, item.fullfile), { clobber: false }, err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    })));

    const count = await Counter.incrementBy('photo', files.length);

    if (!count) {
        throw new ApplicationError(constantsError.COUNTER_ERROR);
    }

    const now = Date.now();
    const next = count.next - files.length + 1;

    await Promise.all(files.map((item, i) => {
        const photo = new Photo({
            user,
            s: 0,
            cid: next + i,
            path: item.fullfile,
            file: item.fullfile,
            ldate: new Date(now + i * 10), // Increase loading time of each file  by 10 ms for proper sorting
            sdate: new Date(now + i * 10 + shift10y), // New photos must be always on top
            mime: item.mime,
            size: item.size,
            geo: undefined,
            r2d: [Math.random() * 100, Math.random() * 100],
            title: item.name ? item.name.replace(/(.*)\.[^.]+$/, '$1') : undefined, // Cut off file extension
            frags: undefined,
            watersignText: getUserWaterSign(user),
            convqueue: true,
            // geo: [_.random(36546649, 38456140) / 1000000, _.random(55465922, 56103812) / 1000000],
            // dir: dirs[_.random(0, dirs.length - 1)],
        });

        cids.push({ cid: photo.cid });

        // Add this photo to redis cache as not public yet, don't wait
        changePhotoInNotpablicCache({ photo })
            .catch(error => logger.warn(`${this.ridMark} Adding photo to redis not public cache failed.`, error));

        return photo.save();
    }));

    // Add to coverter, don't wait
    converter.addPhotos(cids, 1);

    user.pfcount = user.pfcount + files.length;

    await session.saveEmitUser({ usObj: iAm, wait: true, excludeSocket: socket });

    return { message: `${files.length} photo successfully saved`, cids };
}

// Add photo onto map
async function photoToMap({ photo, geoPhotoOld, yearPhotoOld, paintingMap }) {
    const MapModel = paintingMap ? PaintingMap : PhotoMap;
    const $update = {
        $setOnInsert: { cid: photo.cid },
        $set: {
            geo: photo.geo,
            file: photo.file,
            title: photo.title,
            year: photo.year,
            year2: photo.year2 || photo.year,
        },
    };

    if (_.isString(photo.dir) && photo.dir.length) {
        $update.$set.dir = photo.dir;
    } else {
        $update.$unset = { dir: 1 };
    }

    await Promise.all([
        MapModel.update({ cid: photo.cid }, $update, { upsert: true }).exec(),
        this.call('cluster.clusterPhoto', { photo, geoPhotoOld, yearPhotoOld, isPainting: paintingMap }), // Send to clusterization
    ]);
}

// Remove photo from map
function photoFromMap({ photo, paintingMap }) {
    const MapModel = paintingMap ? PaintingMap : PhotoMap;

    return Promise.all([
        this.call('cluster.declusterPhoto', { photo, isPainting: paintingMap }),
        MapModel.remove({ cid: photo.cid }).exec(),
    ]);
}

function getPhotoChangedFields(oldPhoto, newPhoto, parsedFileds) {
    const diff = {};
    const fields = [];
    const oldValues = {};
    const newValues = {};

    // If at least one region has been changed, writes the entire array of current regions
    for (let i = 0; i <= maxRegionLevel; i++) {
        if (oldPhoto['r' + i] !== newPhoto['r' + i]) {
            oldValues.regions = [];
            newValues.regions = [];

            fields.push('regions');

            for (let j = 0; j <= maxRegionLevel; j++) {
                let region = oldPhoto['r' + j];

                if (region) {
                    oldValues.regions.push(region);
                }

                region = newPhoto['r' + j];

                if (region) {
                    newValues.regions.push(region);
                }
            }

            break;
        }
    }

    for (const field of historyFields) {
        let oldValue = oldPhoto[field];
        let newValue = newPhoto[field];

        if (!_.isEqual(oldValue, newValue)) {
            // If it is a string and equals "", nullify it
            if (!oldValue && _.isString(oldValue)) {
                oldValue = undefined;
            }

            if (!newValue && _.isString(newValue)) {
                newValue = undefined;
            }

            // Get formatted difference of the old and new text (unformatted)
            // for the fields for which need to calculate difference, and only if they are not empty
            if (historyFieldsDiffHash[field] && oldValue && newValue) {
                diff[field] = Utils.txtdiff(
                    Utils.txtHtmlToPlain(oldValue),
                    // Some fields (descripton, author etc) are parsed for markup,
                    // difference with last version must be calculated with 'plain'
                    parsingFieldsSet.has(field) ? parsedFileds[field] ? parsedFileds[field].plain :
                    Utils.txtHtmlToPlain(newValue) : newValue
                );
            }

            if (oldValue !== undefined) {
                oldValues[field] = oldValue;
            }

            if (newValue !== undefined) {
                newValues[field] = newValue;
            }

            fields.push(field);
        }
    }

    return { fields, oldValues, newValues, diff };
}

async function saveHistory({ oldPhotoObj, photo, canModerate, reason, parsedFileds }) {
    const { handshake: { usObj: iAm } } = this;
    const changes = getPhotoChangedFields(oldPhotoObj, photo.toObject ? photo.toObject() : photo, parsedFileds);

    if (_.isEmpty(changes.fields)) {
        return null;
    }

    const add = [];
    const del = [];
    const values = {};
    const promises = [];
    const newEntry = { cid: photo.cid, user: iAm.user._id, stamp: photo.cdate || new Date() };

    let reasonCid;
    let firstTime;
    let firstEntryChanged;

    let histories = await PhotoHistory.find(
        { cid: oldPhotoObj.cid }, { _id: 1, values: 1 }, { lean: true, sort: { stamp: 1 } }
    ).exec();

    // If it the first time when object changes, create first entry (by creation time),
    // to write in it initial values of fields, and save it (arrays is undefined, to prevent them from saving like [])
    if (_.isEmpty(histories)) {
        firstTime = true;
        histories = [{
            cid: photo.cid,
            user: photo.user,
            stamp: photo.ldate.getTime(),
            values: {},
            add: undefined,
            del: undefined,
        }];
    }

    const lastFieldsIndexes = histories.reduce((result, historyEntry, historyIndex) => {
        const del = historyEntry.del;
        const values = historyEntry.values;

        _.forEach(changes.fields, field => {
            if (!historyIndex || values && values[field] || del && del.includes(field)) {
                result[field] = historyIndex;
            }
        });

        return result;
    }, {});

    _.forOwn(changes.newValues, (value, field) => {
        values[field] = value;

        // If no current value and the new value is not the flag, saying it added
        if (!_.isBoolean(value) && changes.oldValues[field] === undefined) {
            add.push(field);
            delete changes.oldValues[field];
        }
    });

    _.forOwn(changes.oldValues, (value, field) => {
        if (!lastFieldsIndexes[field]) {
            firstEntryChanged = true;

            // There maybe no 'values' if photo was uploaded before introducing history functionality,
            // but after that some photo attribute was added (not edited)
            if (!histories[0].values) {
                histories[0].values = {};
            }

            histories[0].values[field] = value;
        }

        // If no new value and the old value is not the flag, say that it is removed
        if (!_.isBoolean(value) && changes.newValues[field] === undefined) {
            del.push(field);
        }
    });

    if (!_.isEmpty(values)) {
        newEntry.values = values;
    }

    if (!_.isEmpty(changes.diff)) {
        newEntry.diff = changes.diff;
    }

    newEntry.add = add.length ? add : undefined; // undefined temporary doesn't work, https://github.com/Automattic/mongoose/issues/4037
    newEntry.del = del.length ? del : undefined;

    if (reason) {
        newEntry.reason = {};
        reasonCid = Number(reason.cid);

        if (reasonCid >= 0) {
            newEntry.reason.cid = reasonCid;
        }

        if (_.isString(reason.desc) && reason.desc.length) {
            newEntry.reason.desc = Utils.inputIncomingParse(reason.desc).result;
        }
    }

    if (canModerate === undefined || canModerate === null) {
        // We should check permissions in object before changes
        canModerate = permissions.canModerate(oldPhotoObj, iAm);
    }

    if (canModerate && iAm.user.role) {
        // If changes required moderator/administrator role, write it at the time of removal
        newEntry.role = iAm.user.role;

        // In case of region moderator 'permissions.canModerate' returns region's cid
        if (iAm.isModerator && _.isNumber(canModerate)) {
            newEntry.roleregion = canModerate;
        }
    }

    promises.push(new PhotoHistory(newEntry).save());

    if (firstTime) {
        promises.push(new PhotoHistory(histories[0]).save());
    } else if (firstEntryChanged) {
        promises.push(PhotoHistory.update({ _id: histories[0]._id }, { $set: { values: histories[0].values } }).exec());
    }

    return Promise.all(promises);
}

/**
 * Fetching photo object for editing with access rights validation
 * Check if object was edited after specified time in 'cdate'. If yes - throws 'PHOTO_CHANGED'
 * Returns photo object and 'canModerate' flag
 */
async function prefetchForEdit({ data: { cid, s, cdate, ignoreChange }, can }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    cid = Number(cid);

    if (isNaN(cid) || cid < 1) {
        throw new BadParamsError();
    }

    const photo = await this.call('photo.find', { query: { cid }, populateUser: true });

    if (_.isNumber(s) && s !== photo.s) {
        // Two buttons if status has been changed: "Show", "Proceed <saving|changing status>"
        throw new NoticeError(constantsError.PHOTO_ANOTHER_STATUS);
    }

    const canModerate = permissions.canModerate(photo, iAm);

    if (can && permissions.getCan(photo, iAm, null, canModerate)[can] !== true) {
        throw new AuthorizationError();
    }

    // If photo has changed after last fetching and flag to ignore changes is not specified,
    // then throw changed error
    if (ignoreChange !== true && _.isDate(photo.cdate) && (!cdate || !_.isEqual(new Date(cdate), photo.cdate))) {
        throw new NoticeError(constantsError.PHOTO_CHANGED);
    }

    return { photo, canModerate };
}

/**
 * Сохраняем объект фотографии с подъемом времени просмотра пользователем объекта
 * @param [stamp] Принудительно устанавливает время просмотра
 */
async function update({ photo, oldPhotoObj, stamp }) {
    const { handshake: { usObj: iAm } } = this;

    const [, rel] = await Promise.all([
        photo.save(),
        userObjectRelController.setObjectView(photo._id, iAm.user._id, 'photo', stamp),
    ]);

    if (oldPhotoObj) {
        // Put oldPhoto in regions statistic calculation queue, don't wait
        regionController.putPhotoToRegionStatQueue(oldPhotoObj, photo);
    }

    return { photo, rel };
}

// Change amount of photos of user
function userPCountUpdate(user, newDelta = 0, publicDelta = 0, inactiveDelta = 0) {
    const userId = user._id || user;
    const ownerObj = session.getOnline({ userId });

    if (ownerObj) {
        ownerObj.user.pfcount = ownerObj.user.pfcount + newDelta;
        ownerObj.user.pcount = ownerObj.user.pcount + publicDelta;
        ownerObj.user.pdcount = ownerObj.user.pdcount + inactiveDelta;

        return session.saveEmitUser({ usObj: ownerObj, wait: true });
    }

    return User.update({ _id: userId }, {
        $inc: {
            pfcount: newDelta || 0,
            pcount: publicDelta || 0,
            pdcount: inactiveDelta || 0,
        },
    }).exec();
}

const protectedFileLinkTTLs = config.protectedFileLinkTTL / 1000;

// Set key/value to redis as fast cache to access photo's protected file for specific user,
// if we think he is going to request this file (for example, he's requested photo page)
// This is fast cache for downloader, because key give access only to this user for this file.
// If downloader handle regular _p request and there is no fast cache in redis,
// it will try to get user's authorities from mongo
const putProtectedFileAccessCache = async function ({ file, mime = '', ttl = protectedFileLinkTTLs }) {
    if (!dbRedis.connected) {
        throw new ApplicationError({ code: constantsError.REDIS_NO_CONNECTION, trace: false });
    }

    const { handshake: { session } } = this;
    const [fileUri] = file.split('?');

    return dbRedis.setAsync(`pr:${session.key}:${fileUri}`, `${fileUri}:${mime}`, 'EX', ttl)
        .catch(error => {
            throw new ApplicationError({ code: constantsError.REDIS, trace: false, message: error.message });
        });
};

// The same as above, but for multiple files (for example, user has requested gallery)
const putProtectedFilesAccessCache = async function ({ photos = [], ttl = protectedFileLinkTTLs }) {
    if (!dbRedis.connected) {
        throw new ApplicationError({ code: constantsError.REDIS_NO_CONNECTION, trace: false });
    }

    if (!photos.length) {
        return;
    }

    const { handshake: { session } } = this;
    const multi = dbRedis.multi();

    for (const { file, mime = '' } of photos) {
        const [fileUri] = file.split('?');

        multi.set(`pr:${session.key}:${fileUri}`, `${fileUri}:${mime}`, 'EX', ttl);
    }

    return multi.execAsync()
        .catch(error => {
            throw new ApplicationError({ code: constantsError.REDIS, trace: false, message: error.message });
        });
};

const fillPhotosProtection = async function ({ photos = [], theyAreMine, setMyFlag = false }) {
    if (!photos.length) {
        return;
    }

    const ownershipIsKnown = typeof theyAreMine === 'boolean';
    const { handshake: { usObj: iAm } } = this;
    const isAdmin = iAm.isAdmin;
    const myUser = iAm.user;
    const protectedPhotos = [];

    for (const photo of photos) {
        const isMine = ownershipIsKnown ? theyAreMine : User.isEqual(photo.user, myUser);

        if (setMyFlag && isMine) {
            photo.my = true;
        }

        // Undefined - will take public(/_p/), true - protected(/_pr/), false - covered(/_prn/)
        photo.protected = permissions.can.protected(photo.s, isMine, permissions.canModerate(photo, iAm), isAdmin);

        if (photo.protected) {
            protectedPhotos.push(photo);
        }
    }

    if (protectedPhotos.length) {
        await this.call('photo.putProtectedFilesAccessCache', { photos: protectedPhotos })
            .catch(err => {
                logger.warn(
                    `${this.ridMark} Putting link to redis for protected photos file failed. Serve public.`,
                    err
                );

                for (const photo of protectedPhotos) {
                    photo.protected = false;
                }
            });
    }
};

async function changePhotoInNotpablicCache({ photo, add = true }) {
    if (!dbRedis.connected) {
        throw new ApplicationError({ code: constantsError.REDIS_NO_CONNECTION, trace: false });
    }

    const multi = dbRedis.multi();

    if (add) {
        // Put information about new not public photo to redis cache
        multi.incr('notpublic:count').set(`notpublic:${photo.path}`, `${photo.cid}`);
    } else {
        // Remove information about not public photo from redis cache
        multi.decr('notpublic:count').del(`notpublic:${photo.path}`);
    }

    return multi.execAsync()
        .catch(error => {
            throw new ApplicationError({ code: constantsError.REDIS, trace: false, message: error.message });
        });
}


// If photo is getting public status,
// we must move files from protected to public folder (overwrite files if exist), and remove covered variants (if exist)
// If photo is being changed from public status,
// we must copy all public files to protected folder, create covered files with caption and remove public files
const changeFileProtection = async function ({ photo, protect = false }) {
    try {
        await converter.movePhotoFiles({ photo, copy: protect, toProtected: protect });
    } catch (err) {
        logger.warn(
            `${this.ridMark} Copying/moving of files in changing protection failed: ${err.message}.`,
            'Trying to recreate files with right status from original file'
        );

        // If copying/moving files failed for some reason, simply add converter job to create variants in actual folder
        await converter.addPhotos([photo], 2)
            .catch(err => logger.warn(`${this.ridMark} Failed to add photo to recreate it from original:`, err));

        if (!protect) {
            // And if this is moving from protected to public, try to remove all files from protected whatever happens
            await converter.deletePhotoFiles({ photo, fromProtected: true });
        }
    }

    // Change redis cache state of this photo
    await changePhotoInNotpablicCache({ photo, add: protect })
        .catch(err => logger.warn(`${this.ridMark} Changing photo state in redis not public cache failed:`, err));

    if (protect) {
        // Cover all public files with caption for not public photo.
        // And here public files will be removed after covered ones were created, to avoid gap between files existance
        await converter.addPhotos([photo], 2, true)
            .catch(err => logger.warn(`${this.ridMark} Failed to add photo to converter to cover with caption:`, err));
    } else {
        // Delete covered files if photo has got public files. Never fails, just tries for each variant
        await converter.deletePhotoFiles({ photo, fromCovered: true });
    }
};

const changePublicExternality = async function ({ photo, makePublic }) {
    return Promise.all([
        // Recalculate number of photos of owner
        userPCountUpdate(photo.user, 0, makePublic ? 1 : -1, makePublic ? -1 : 1),
        // If photo has coordinates, means that need to do something with map
        Utils.geo.check(photo.geo) ? this.call(makePublic ? 'photo.photoToMap' : 'photo.photoFromMap', {
            photo, paintingMap: photo.type === constants.photo.type.PAINTING,
        }) : null,
        this.call('photo.changeFileProtection', { photo, protect: !makePublic }),
    ]);
};

// Revoke own photo
async function revoke(data) {
    const { photo } = await this.call('photo.prefetchForEdit', { data, can: 'revoke' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REVOKE;
    photo.sdate = photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo, oldPhotoObj });

    // Compute amount of photos of user
    userPCountUpdate(photo.user, -1, 0, 1);

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate: false });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Say that photo is ready for premoderation
async function ready(data) {
    const { handshake: { usObj: iAm } } = this;
    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'ready' });
    const oldPhotoObj = photo.toObject();

    photoCheckPublicRequired(photo);

    photo.s = status.READY;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo, oldPhotoObj });

    // Save previous status to history
    await this.call('photo.saveHistory', {
        oldPhotoObj, photo, canModerate: User.isEqual(oldPhotoObj.user, iAm.user) ? false : canModerate,
    });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Send a photo, awaiting publication, to the author for revision
async function toRevision(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw new BadParamsError(constantsError.PHOTO_NEED_REASON);
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'revision' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REVISION;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo, oldPhotoObj });

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Reject waiting photo by moderator/administrator
async function reject(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw new BadParamsError(constantsError.PHOTO_NEED_REASON);
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'reject' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REJECT;
    photo.sdate = photo.stdate = photo.cdate = new Date(); // TODO: При возврате на доработку возвращать sdate +shift10y

    const { rel } = await this.call('photo.update', { photo, oldPhotoObj });

    // Compute amount of photos of user
    userPCountUpdate(photo.user, -1, 0, 1);

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Restore rejected photo to ready status (waitnig for moderation)
async function rereject(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw new BadParamsError(constantsError.PHOTO_NEED_REASON);
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'rereject' });

    const oldPhotoObj = photo.toObject();

    photo.s = status.READY;
    photo.sdate = photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo, oldPhotoObj });

    // Recalculate the number of photos of the owner
    userPCountUpdate(photo.user, 1, 0, -1);

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Publication (confirmation) of a new photo
async function approve(data) {
    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'approve' });

    photoCheckPublicRequired(photo);

    const oldPhotoObj = photo.toObject();

    photo.s = status.PUBLIC;
    photo.stdate = photo.cdate = photo.adate = photo.sdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    await Promise.all([
        // Recalculate the number of photos of the owner
        userPCountUpdate(photo.user, -1, 1, 0),
        // Subscribe photo's owner to it and set to him stamp of comments view,
        // to correctly count the number of new comments until he'll enter the page next time
        this.call(
            'subscr.subscribeUserByIds',
            { user: photo.user, objId: photo._id, setCommentView: true, type: 'photo' }
        ),
    ]);

    // Add photo to map
    if (Utils.geo.check(photo.geo)) {
        await this.call('photo.photoToMap', { photo, paintingMap: photo.type === constants.photo.type.PAINTING });
    }

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate });

    this.call('photo.changeFileProtection', { photo, protect: false });

    // Put oldPhoto in regions statistic calculation queue, don't wait
    regionController.putPhotoToRegionStatQueue(oldPhotoObj);

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Activation/deactivation of photo
async function activateDeactivate(data) {
    const { handshake: { usObj: iAm } } = this;
    const { reason, disable } = data;

    if (disable && _.isEmpty(reason)) {
        throw new BadParamsError(constantsError.PHOTO_NEED_REASON);
    }

    const { photo, canModerate } = await this.call(
        'photo.prefetchForEdit', { data, can: disable ? 'deactivate' : 'activate' }
    );

    if (!disable) {
        photoCheckPublicRequired(photo);
    }

    const oldPhotoObj = photo.toObject();

    photo.s = status[disable ? 'DEACTIVATE' : 'PUBLIC'];
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    await this.call('comment.changeObjCommentsStatus', { obj: photo });
    await this.call('photo.changePublicExternality', { photo, makePublic: !disable });

    if (disable && iAm.isModerator) {
        // In case of deactivation subscribe moderator to this photo and set to him stamp of comments view,
        // to correctly count the number of new comments until he'll enter the page next time
        await this.call(
            'subscr.subscribeUserByIds',
            { user: iAm.user, objId: photo._id, setCommentView: true, type: 'photo' }
        );
    }

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason: disable && reason });

    // Put oldPhoto in regions statistic calculation queue, don't wait
    regionController.putPhotoToRegionStatQueue(oldPhotoObj);

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Remove from 'incoming' directory uploaded but not created photo
function removeIncoming({ file }) {
    const { handshake: { usObj: iAm } } = this;

    if (!file) {
        throw new BadParamsError();
    }

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    return fs.unlink(path.join(incomeDir, file), (err) => {
      if (err) throw err;
      logger.info('Incoming file deleted');
    });
}

// Photo removal
async function remove(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw new BadParamsError(constantsError.PHOTO_NEED_REASON);
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'remove' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REMOVE;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Change comments status
    await this.call('comment.changeObjCommentsStatus', { obj: photo });
    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    if (oldPhotoObj.s === status.PUBLIC) {
        await this.call('photo.changePublicExternality', { photo, makePublic: false });
    }

    // Put oldPhoto in regions statistic calculation queue, don't wait
    regionController.putPhotoToRegionStatQueue(oldPhotoObj);

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Restore removed photo
async function restore(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw new BadParamsError(constantsError.PHOTO_NEED_REASON);
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'restore' });

    photoCheckPublicRequired(photo);

    const oldPhotoObj = photo.toObject();

    photo.s = status.PUBLIC;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Change comments status
    await this.call('comment.changeObjCommentsStatus', { obj: photo });
    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    await this.call('photo.changePublicExternality', { photo, makePublic: true });

    // Put oldPhoto in regions statistic calculation queue, don't wait
    regionController.putPhotoToRegionStatQueue(oldPhotoObj);

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
}

// Give photo for its page
export async function giveForPage({ cid, forEdit }) {
    cid = Number(cid);

    if (!cid || cid < 1) {
        throw new BadParamsError();
    }

    const { photo, can } = await this.call('photo.give', { cid, fullView: true, countView: !forEdit, forEdit });

    return { photo, can, forEdit: !!photo.user.settings };
}

async function givePrevNextCids({ cid }) {
    const [prev, next] = await Promise.all([
        Photo.findOne({ cid: { $lt: cid }, s: 5 }, { _id: 0, cid: 1 }, { lean: true }).sort({ cid: -1 }).exec(),
        Photo.findOne({ cid: { $gt: cid }, s: 5 }, { _id: 0, cid: 1 }, { lean: true }).sort({ cid: 1 }).exec(),
    ]);

    return { prev: prev && prev.cid, next: next && next.cid };
}

/**
 * Return full gallery based of user's rights and filters in compact view
 * @param filter Filter object (parsed)
 * @param userId _id of user, if we need gallery by user
 */
async function givePhotos({ filter, options: { skip = 0, limit = 40, random = false, customQuery }, userId }) {
    const { handshake: { usObj: iAm } } = this;

    skip = Math.abs(Number(skip)) || 0;
    limit = Math.min(Math.abs(Number(limit)), 100) || 40;

    const buildQueryResult = buildPhotosQuery(filter, userId, iAm, random);
    const { query } = buildQueryResult;

    let shortRegionsHash;
    let photos = [];
    let count = 0;

    if (query) {
        if (filter.geo) {
            if (filter.geo[0] === '0') {
                query.geo = null;
            }

            if (filter.geo[0] === '1') {
                query.geo = { $size: 2 };
            }
        }

        if (userId) {
            query.user = userId;
        }

        if (customQuery) {
            Object.assign(query, customQuery);
        }

        // To calculate new comments we need '_id', for checking of changes - 'ucdate'
        const fieldsSelect = iAm.registered ? compactFieldsForRegWithRegions : compactFieldsWithRegions;

        // console.log(JSON.stringify(query, null, '\t'));
        if (random) {
            const countQuery = { ...query };

            delete countQuery.r2d; // Don't need to to consider random field in counting

            [photos, count] = await Promise.all([
                Photo.find(query, fieldsSelect, { lean: true, limit }).exec(),
                Photo.count(countQuery).exec(),
            ]);
        } else {
            [photos, count] = await Promise.all([
                Photo.find(query, fieldsSelect, { lean: true, skip, limit, sort: { sdate: -1 } }).exec(),
                Photo.count(query).exec(),
            ]);
        }


        if (photos.length) {
            if (iAm.registered) {
                // If user is logged in, fill amount of new comments for each object
                await userObjectRelController.fillObjectByRels(photos, iAm.user._id, 'photo');

                // Check if user should get protected files
                const itsMineGallery = userId && User.isEqual(iAm.user._id, userId) || undefined;

                await this.call('photo.fillPhotosProtection', { photos, theyAreMine: itsMineGallery, setMyFlag: !userId });

                for (const photo of photos) {
                    photo._id = undefined;
                    photo.user = undefined;
                    photo.vdate = undefined;
                    photo.ucdate = undefined;
                }
            }

            // For each photo fill short regions and hash of this regions
            const shortRegionsParams = regionController.getShortRegionsParams(buildQueryResult.rhash);

            shortRegionsHash = regionController.genObjsShortRegionsArr(photos, shortRegionsParams.lvls, true);
        }
    }

    const r = [];
    const re = [];
    const filterRegionsHash = {};

    // Create hash of filter regions (selected and exluded) and their parents
    if (buildQueryResult.rarr.length) {
        for (const region of buildQueryResult.rarr) {
            r.push(region.cid);
            filterRegionsHash[region.cid] = region;

            if (region.parents && region.parents.length) {
                for (const cid of region.parents) {
                    if (filterRegionsHash[cid] === undefined) {
                        filterRegionsHash[cid] = regionController.getRegionPublicFromCache(cid);
                    }
                }
            }
        }
    }

    if (buildQueryResult.rearr && buildQueryResult.rearr.length) {
        for (const region of buildQueryResult.rearr) {
            re.push(region.cid);
            filterRegionsHash[region.cid] = region;

            if (region.parents && region.parents.length) {
                for (const cid of region.parents) {
                    if (filterRegionsHash[cid] === undefined) {
                        filterRegionsHash[cid] = regionController.getRegionPublicFromCache(cid);
                    }
                }
            }
        }
    }

    return {
        skip, count, photos, rhash: shortRegionsHash,
        filter: {
            r,
            re,
            rp: filter.rp,
            rs: filter.rs,
            rhash: filterRegionsHash,
            t: buildQueryResult.types,
            s: buildQueryResult.s,
            y: buildQueryResult.y,
            c: buildQueryResult.c,
            geo: filter.geo,
        },
    };
}

// Returns public photos for index page
const givePublicIndex = (function () {
    const options = { skip: 0, limit: 30 };
    const filter = { s: [status.PUBLIC] };

    return function () {
        // Always select again, because could be region filters
        return this.call('photo.givePhotos', { filter, options });
    };
}());

// Returns last public "Where is it?" photos for index page
const givePublicNoGeoIndex = (function () {
    const options = { skip: 0, limit: 30 };
    const filter = { geo: ['0'], s: [status.PUBLIC] };

    return function () {
        // Always select again, because could be region filters
        return this.call('photo.givePhotos', { filter, options });
    };
}());

const filterProps = { geo: [], r: [], rp: [], rs: [], re: [], s: [], t: [], y: [], c: [] };
const delimeterParam = '_';
const delimeterVal = '!';
export function parseFilter(filterString) {
    const filterParams = filterString && filterString.split(delimeterParam);
    const result = {};
    let filterVal;
    let filterValItem;

    if (!filterParams) {
        return result;
    }

    for (let filterParam of filterParams) {
        const dividerIndex = filterParam.indexOf(delimeterVal);

        if (dividerIndex > 0) {
            filterVal = filterParam.substr(dividerIndex + 1);
            filterParam = filterParam.substring(0, dividerIndex);
        }

        if (filterProps[filterParam] !== undefined) {
            if (typeof filterProps[filterParam] === 'boolean') {
                result[filterParam] = true;
            } else if (filterParam === 'r') {
                if (filterVal === '0') {
                    result.r = 0;
                } else {
                    filterVal = filterVal.split(delimeterVal).map(Number);

                    if (Array.isArray(filterVal) && filterVal.length && filterVal.length <= 10) {
                        result.r = [];

                        for (filterValItem of filterVal) {
                            if (filterValItem) {
                                result.r.push(filterValItem);
                            }
                        }

                        if (!result.r.length) {
                            delete result.r;
                        }
                    }
                }
            } else if (filterParam === 'rp') {
                // Regions phantom. Inactive filter regions
                filterVal = filterVal.split(delimeterVal).map(Number);

                if (Array.isArray(filterVal) && filterVal.length && filterVal.length <= 10) {
                    result.rp = [];

                    for (filterValItem of filterVal) {
                        if (filterValItem) {
                            result.rp.push(filterValItem);
                        }
                    }

                    if (!result.rp.length) {
                        delete result.rp;
                    }
                }
            } else if (filterParam === 'rs') {
                filterVal = filterVal.split(delimeterVal);

                if (Array.isArray(filterVal) && filterVal.length === 1) {
                    result.rs = filterVal;
                }
            } else if (filterParam === 're') {
                filterVal = filterVal.split(delimeterVal).map(Number);

                if (Array.isArray(filterVal) && filterVal.length && filterVal.length <= 10) {
                    result.re = [];

                    for (filterValItem of filterVal) {
                        if (filterValItem) {
                            result.re.push(filterValItem);
                        }
                    }

                    if (!result.re.length) {
                        delete result.re;
                    }
                }
            } else if (filterParam === 'y') {
                //constants.photo.years[constants.photo.type.PAINTING].max
                filterVal = filterVal.split(delimeterVal);

                if (Array.isArray(filterVal) && filterVal.length === 2) {
                    const year = Number(filterVal[0]);
                    const year2 = Number(filterVal[1]);

                    if (year >= constants.photo.years[constants.photo.type.PAINTING].min &&
                        year2 <= constants.photo.years[constants.photo.type.PHOTO].max &&
                        year <= year2) {
                        result.y = [year, year2];
                    }
                }
            } else if (filterParam === 's') {
                filterVal = filterVal.split(delimeterVal);

                if (Array.isArray(filterVal) && filterVal.length) {
                    if (filterVal.length === 1 && filterVal[0] === 'all') {
                        result.s = allStatuses;
                    } else {
                        result.s = [];

                        for (filterValItem of filterVal) {
                            if (filterValItem) {
                                filterValItem = Number(filterValItem);

                                if (allStatusesSet.has(filterValItem)) { // 0 must be included, that is why check for NaN
                                    result.s.push(filterValItem);
                                }
                            }
                        }

                        if (!result.s.length) {
                            delete result.s;
                        }
                    }
                }
            } else if (filterParam === 't') {
                filterVal = filterVal.split(delimeterVal);

                if (Array.isArray(filterVal) && filterVal.length) {
                    result.t = [];

                    for (filterValItem of filterVal) {
                        if (filterValItem) {
                            filterValItem = Number(filterValItem);

                            if (typesSet.has(filterValItem)) {
                                result.t.push(filterValItem);
                            }
                        }
                    }

                    if (!result.t.length) {
                        delete result.t;
                    }
                }
            } else if (filterParam === 'geo') {
                filterVal = filterVal.split(delimeterVal);

                if (Array.isArray(filterVal) && filterVal.length === 1) {
                    result.geo = filterVal;
                }
            } else if (filterParam === 'c') {
                filterVal = filterVal.split(delimeterVal);

                if (Array.isArray(filterVal) && (filterVal.length === 1 || filterVal.length === 2)) {
                    filterVal = filterVal.map(Number).sort();

                    if (!_.isEqual(filterVal, [0, 1])) {
                        const [c0, c1] = filterVal;
                        const c = {};
                        let active = true;

                        if (c0 === 0) {
                            c.no = true;

                            if (c1 > 0 && c1 < 1e4) {
                                c.min = c1;
                            }
                        } else if (c0 > 0 && c0 < 1e4) {
                            c.min = c0;
                        } else {
                            active = false;
                        }

                        if (active) {
                            result.c = c;
                        }
                    }
                }
            }
        }
    }

    return result;
}

// Return general gallery
function givePS(options) {
    const filter = options.filter ? parseFilter(options.filter) : {};

    return this.call('photo.givePhotos', { filter, options });
}

// Returns user's gallery
async function giveUserGallery({ login, filter, skip, limit }) {
    if (!login) {
        throw new BadParamsError();
    }

    const { handshake: { usObj: iAm } } = this;
    const userId = await User.getUserID(login);

    if (!userId) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    filter = filter ? parseFilter(filter) : {};

    if (iAm.registered && iAm.user.login !== login && iAm.user.settings && !iAm.user.settings.r_f_user_gal) {
        // If regions filter is not set, this is another's gallery, current user has own regions and
        // exists setting not filter gallery by own regions, then set whole world
        if (filter.r === undefined && iAm.user.regions && iAm.user.regions.length && iAm.user.settings) {
            filter.r = 0;
        }

        // The same with types
        if (filter.t === undefined && iAm.photoFilterTypes.length) {
            filter.t = null;
        }
    }

    return this.call('photo.givePhotos', { filter, options: { skip, limit }, userId });
}

// Returns last photos for approve
async function giveForApprove(data) {
    const { handshake: { usObj: iAm } } = this;
    const query = { s: status.READY };
    const myUser = iAm.user;

    if (!iAm.registered || iAm.user.role < 5) {
        throw new AuthorizationError();
    }

    if (iAm.isModerator) {
        Object.assign(query, iAm.mod_rquery);
    }

    const photos = await Photo.find(query, compactFieldsForRegWithRegions, {
        lean: true,
        sort: { sdate: -1 },
        skip: data.skip || 0,
        limit: Math.min(data.limit || 20, 100),
    }).exec();

    const shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm.mod_rshortlvls, true);

    await this.call('photo.putProtectedFilesAccessCache', { photos })
        .catch(err => {
            logger.warn(`${this.ridMark} Putting link to redis for protected photos file failed. Serve public.`, err);
        });

    for (const photo of photos) {
        if (User.isEqual(photo.user, myUser)) {
            photo.my = true;
        }

        photo._id = undefined;
        photo.user = undefined;
        photo.ucdate = undefined;
        photo.mime = undefined;
    }

    return { photos, rhash: shortRegionsHash };
}

// Returns array before and after specified photo (with specified length)
const userPhotosAroundFields = {
    _id: 0,
    cid: 1,
    file: 1,
    s: 1,
    title: 1,
    mime: 1,
};
const userPhotosAroundFieldsForModWithRegions = {
    ...userPhotosAroundFields,
    ...regionController.regionsAllSelectHash,
};

async function giveUserPhotosAround({ cid, limitL, limitR }) {
    const { handshake: { usObj: iAm } } = this;

    cid = Number(cid);
    limitL = Math.min(Math.abs(Number(limitL)), 100);
    limitR = Math.min(Math.abs(Number(limitR)), 100);

    if (!cid || !limitL && !limitR) {
        throw new BadParamsError();
    }

    const photo = await this.call('photo.find', { query: { cid } });

    const filter = iAm.registered && iAm.user.settings && !iAm.user.settings.r_f_photo_user_gal ? { r: 0, t: null } : {};
    const query = Object.assign(buildPhotosQuery(filter, photo.user, iAm).query, { user: photo.user });
    const promises = new Array(2);

    // Moderators can see not yet published photos, so we need to take regions to determine if user can moderate
    const fields = iAm.isModerator ? userPhotosAroundFieldsForModWithRegions : userPhotosAroundFields;

    if (limitL) {
        query.sdate = { $gt: photo.sdate };
        promises[0] = Photo.find(query, fields, { lean: true, sort: { sdate: 1 }, limit: limitL }).exec();
    }

    if (limitR) {
        query.sdate = { $lt: photo.sdate };
        promises[1] = Photo.find(query, fields, { lean: true, sort: { sdate: -1 }, limit: limitR }).exec();
    }

    const [left = [], right = []] = await Promise.all(promises);

    // Check if user should get protected files (only owner and moderators can)
    const theyAreMine = iAm.registered && User.isEqual(iAm.user._id, photo.user);

    if (iAm.registered && iAm.user.role >= 5 || theyAreMine) {
        if (left.length) {
            await this.call('photo.fillPhotosProtection', { photos: left, theyAreMine });
        }

        if (right.length) {
            await this.call('photo.fillPhotosProtection', { photos: right, theyAreMine });
        }
    }

    return { left, right };
}

// Returns array of nearest photos
async function giveNearestPhotos({ geo, type, year, year2, except, distance, limit, skip }) {
    if (!Utils.geo.checkLatLng(geo)) {
        throw new BadParamsError();
    }

    geo.reverse();

    type = typesSet.has(type) ? type : constants.photo.type.PHOTO;

    const isPainting = type === constants.photo.type.PAINTING;

    const query = { geo: { $near: geo }, s: status.PUBLIC, type };
    const options = { lean: true };

    const years = isPainting ? paintYears : photoYears;

    if (_.isNumber(year) && year > years.min && year < years.max) {
        query.year = { $gte: year };
    }

    if (_.isNumber(year2) && year2 > years.min && year2 < years.max) {
        if (year === year2) {
            query.year = year;
        } else if (!query.year) {
            query.year = { $lte: year2 };
        } else if (year2 > year) {
            query.year.$lte = year2;
        }
    }

    if (_.isNumber(except) && except > 0) {
        query.cid = { $ne: except };
    }

    if (_.isNumber(distance) && distance > 0 && distance < 7) {
        query.geo.$maxDistance = distance;
    } else {
        query.geo.$maxDistance = 2;
    }

    if (_.isNumber(limit) && limit > 0 && limit < 30) {
        options.limit = limit;
    } else {
        options.limit = 30;
    }

    if (_.isNumber(skip) && skip > 0 && skip < 1000) {
        options.skip = skip;
    }

    const photos = await Photo.find(query, compactFields, options).exec();

    return { photos };
}

// Returns not public photos of user
async function giveUserPhotosPrivate({ login, startTime, endTime }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered || iAm.user.role < 5 && iAm.user.login !== login) {
        throw new AuthorizationError();
    }

    const userId = await User.getUserID(login);

    if (!userId) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    const query = { user: userId, s: { $nin: [status.PUBLIC] } };

    if (iAm.isModerator) {
        query.s.$nin.push(status.REMOVE);
        Object.assign(query, iAm.mod_rquery);
    }

    if (startTime || endTime) {
        query.sdate = {};

        if (_.isNumber(startTime) && startTime > 0) {
            query.sdate.$gte = new Date(startTime);
        }

        if (_.isNumber(endTime) && endTime > 0) {
            query.sdate.$lte = new Date(endTime);
        }
    }

    const photos = await Photo.find(query, compactFields, { lean: true, sort: { sdate: -1 } }).exec();

    return { photos };
}

// Returns new photos
async function giveFresh({ login, after, skip, limit }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered ||
        !login && iAm.user.role < 5 ||
        login && iAm.user.role < 5 && iAm.user.login !== login) {
        throw new AuthorizationError();
    }

    const userId = login ? await User.getUserID(login) : null;

    const query = { s: status.NEW };
    const asModerator = iAm.user.login !== login && iAm.isModerator;

    if (asModerator) {
        Object.assign(query, iAm.mod_rquery);
    }

    if (userId) {
        query.user = userId;
    }

    if (after) {
        query.ldate = { $gt: new Date(after) };
    }

    const photos = await Photo.find(
        query,
        compactFields,
        { lean: true, skip: Math.abs(skip || 0), limit: Math.min(Math.abs(limit || 100), 100) }
    ).exec();

    const shortRegionsHash = regionController.genObjsShortRegionsArr(
        photos || [],
        asModerator ? iAm.mod_rshortlvls : iAm.rshortlvls,
        true
    );

    return { photos, rhash: shortRegionsHash };
}

// Return 'can' object for photo
async function giveCan({ cid }) {
    const { handshake: { usObj: iAm } } = this;

    cid = Number(cid);

    if (!cid) {
        throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
    }

    // Need to get can for anonymous too, but there is nothing to check with owner in this case, so do not populate him
    const photo = await this.call('photo.find', {
        query: { cid },
        options: { lean: true },
        populateUser: Boolean(iAm.registered),
    });

    return { can: permissions.getCan(photo, iAm) };
}

// Return protected flag for photo
async function giveCanProtected({ cid }) {
    const { handshake: { usObj: iAm } } = this;

    cid = Number(cid);

    if (!cid) {
        throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
    }

    const photo = await this.call('photo.find', { query: { cid }, options: { lean: true }, populateUser: false });

    if (photo.s !== status.PUBLIC && !iAm.registered) {
        return { result: false };
    }

    const isMine = User.isEqual(photo.user, iAm.user);

    return {
        result: permissions.can.protected(photo.s, isMine, permissions.canModerate(photo, iAm), iAm.isAdmin),
        mime: photo.mime,
    };
}

function photoCheckPublicRequired(photo) {
    if (!photo.r0) {
        throw new NoticeError(constantsError.PHOTO_NEED_COORD);
    }

    if (_.isEmpty(photo.title)) {
        throw new InputError(constantsError.PHOTO_NEED_TITLE);
    }

    const isPainting = photo.type === constants.photo.type.PAINTING;
    const years = isPainting ? paintYears : photoYears;

    if (!_.isNumber(photo.year) || !_.isNumber(photo.year2) ||
        photo.year < years.min || photo.year > years.max || photo.year2 < photo.year && photo.year2 > years.max) {
        throw new NoticeError(isPainting ? constantsError.PAINTING_YEARS_CONSTRAINT : constantsError.PHOTO_YEARS_CONSTRAINT);
    }

    return true;
}

function yearsValidate({ isPainting, maxDelta, year, year2 }) {
    const years = isPainting ? paintYears : photoYears;
    const maxYearsDelta = maxDelta || (isPainting ? paintRange : photoRange);

    // Both year fields must be filled
    if (_.isNumber(year) && _.isNumber(year2) && year >= years.min && year <= years.max &&
        year2 >= year && year2 <= years.max && Math.abs(year2 - year) <= maxYearsDelta) {
        return { year, year2 };
    }

    return {};
}

function photoValidate(newValues, oldValues, can) {
    const result = {};

    if (!newValues) {
        return result;
    }

    // Validate geo
    if (newValues.geo && Utils.geo.checkLatLng(newValues.geo)) {
        result.geo = Utils.geo.geoToPrecisionRound(newValues.geo.reverse());
    } else if (newValues.geo === null) {
        result.geo = undefined;
    }

    if (_.isNumber(newValues.type) && typesSet.has(newValues.type)) {
        result.type = newValues.type;
    }

    if (_.isNumber(newValues.region) && newValues.region > 0) {
        result.region = newValues.region;
    } else if (newValues.region === null) {
        result.region = undefined;
    }

    const isPainting = result.type === constants.photo.type.PAINTING || oldValues.type === constants.photo.type.PAINTING;

    if (newValues.year === null) {
        // Remove years from photo if null is passed
        result.year = undefined;
        result.year2 = undefined;
    } else {
        Object.assign(result, yearsValidate({
            isPainting, maxDelta: isPainting ? 200 : 50,
            year: newValues.year, year2: newValues.year2,
        }));
    }

    if (_.isString(newValues.dir) && newValues.dir.length) {
        result.dir = newValues.dir.trim();
    } else if (newValues.dir === null) {
        result.dir = undefined;
    }

    // Trim and remove last dot in title, if it is not part of ellipsis
    if (_.isString(newValues.title) && newValues.title.length) {
        result.title = newValues.title.trim().substr(0, 120).replace(/([^.])\.$/, '$1');
    } else if (newValues.title === null) {
        result.title = undefined;
    }

    if (_.isString(newValues.desc) && newValues.desc.length) {
        result.desc = newValues.desc.trim().substr(0, 4000);
    } else if (newValues.desc === null) {
        result.desc = undefined;
    }

    if (_.isString(newValues.source) && newValues.source.length) {
        result.source = newValues.source.trim().substr(0, 250);
    } else if (newValues.source === null) {
        result.source = undefined;
    }

    if (_.isString(newValues.author) && newValues.author.length) {
        result.author = newValues.author.trim().substr(0, 250);
    } else if (newValues.author === null) {
        result.author = undefined;
    }

    if (_.isString(newValues.address) && newValues.address.length) {
        result.address = newValues.address.trim().substr(0, 250);
    } else if (newValues.address === null) {
        result.address = undefined;
    }

    if (can.nowaterchange) {
        if (_.isBoolean(newValues.nowaterchange) && newValues.nowaterchange !== Boolean(oldValues.nowaterchange)) {
            result.nowaterchange = newValues.nowaterchange;
        }
    }

    if (can.watersign) {
        if (_.isBoolean(newValues.watersignIndividual) &&
            newValues.watersignIndividual !== Boolean(oldValues.watersignIndividual)) {
            result.watersignIndividual = newValues.watersignIndividual;
        }

        if (result.watersignIndividual || oldValues.watersignIndividual && result.watersignIndividual === undefined) {
            if (userSettingsVars.photo_watermark_add_sign.includes(newValues.watersignOption)) {
                result.watersignOption = newValues.watersignOption;
            }

            if (_.isString(newValues.watersignCustom)) {
                newValues.watersignCustom = newValues.watersignCustom
                    .match(watersignPattern).join('')
                    .trim().replace(/ {2,}/g, ' ').substr(0, watersignLength);
            }

            if (newValues.watersignCustom === null ||
                _.isString(newValues.watersignCustom) && newValues.watersignCustom.length) {
                result.watersignCustom = newValues.watersignCustom;
            }

            if (result.watersignOption === 'custom' && result.watersignCustom === null) {
                // If user set custom sign and empty it, we set default option and empty custom sign further
                if (oldValues.watersignOption !== true) {
                    result.watersignOption = true;
                } else {
                    delete result.watersignOption;
                }
            } else if (result.watersignOption === 'custom' && !result.watersignCustom && !oldValues.watersignCustom) {
                // If user set custom sign option, but did not fill it, don't set custom sign option
                delete result.watersignOption;
            } else if (oldValues.watersignOption === 'custom' && oldValues.watersignCustom &&
                (!result.watersignOption || result.watersignOption === 'custom') &&
                !result.watersignCustom && result.hasOwnProperty('watersignCustom')) {
                // If photo had custom individual watersign, and user has deleted it,
                // without changing the option, set default watersign

                result.watersignOption = true;
                result.watersignCustom = undefined;
            }

            if (newValues.watersignCustom === null) {
                result.watersignCustom = undefined;
            }
        }

        if (_.isBoolean(newValues.disallowDownloadOriginIndividual) &&
            newValues.disallowDownloadOriginIndividual !== Boolean(oldValues.disallowDownloadOriginIndividual)) {
            result.disallowDownloadOriginIndividual = newValues.disallowDownloadOriginIndividual;
        }

        if (result.disallowDownloadOriginIndividual ||
            oldValues.disallowDownloadOriginIndividual && result.disallowDownloadOriginIndividual === undefined) {
            if (userSettingsVars.photo_disallow_download_origin.includes(newValues.disallowDownloadOrigin)) {
                result.disallowDownloadOrigin = newValues.disallowDownloadOrigin;
            }
        }
    }

    return result;
}

// Save photo's changes
async function save(data) {
    const { handshake: { usObj: iAm } } = this;

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'edit' });

    const oldPhotoObj = photo.toObject();
    const isMine = User.isEqual(oldPhotoObj.user, iAm.user);
    const can = permissions.getCan(oldPhotoObj, iAm, isMine, canModerate);
    const changes = photoValidate(data.changes, oldPhotoObj, can);

    if (_.isEmpty(changes)) {
        return { emptySave: true };
    }

    const parsedFileds = {};

    // Immediately parse some fields, to compare them furter with existing unparsed values
    for (const field of parsingFieldsSet) {
        if (changes[field]) {
            parsedFileds[field] = Utils.inputIncomingParse(changes[field]);
            changes[field] = parsedFileds[field].result;
        }
    }

    // The new values of actually modifying properties
    const newValues = Utils.diff(
        _.pick(
            changes,
            'geo', 'type', 'year', 'year2', 'dir', 'title', 'address', 'desc', 'source', 'author',
            'nowaterchange',
            'watersignIndividual', 'watersignOption', 'watersignCustom',
            'disallowDownloadOriginIndividual', 'disallowDownloadOrigin'
        ),
        oldPhotoObj
    );

    if (_.isEmpty(newValues) && !changes.hasOwnProperty('region')) {
        return { emptySave: true };
    }

    Object.assign(photo, newValues);

    const geoToNull = newValues.hasOwnProperty('geo') && newValues.geo === undefined; // Flag of coordinates nullify
    const oldGeo = oldPhotoObj.geo;
    const newGeo = newValues.geo;
    let newRegions;

    // If coorditates were nullyfied or don't exist, region must be assign
    if (geoToNull || _.isEmpty(oldGeo) && !newGeo) {
        if (changes.region) {
            // If region assign manually, find its ancestry and assing to object
            newRegions = regionController.setObjRegionsByRegionCid(
                photo,
                changes.region,
                ['cid', 'parents', 'title_en', 'title_local']
            );

            // If false was returned, means such region doesn't exists
            if (!newRegions) {
                throw new NotFoundError(constantsError.NO_SUCH_REGION);
            }
        } else {
            // Clear region assignment
            regionController.clearObjRegions(photo);
            newRegions = [];
        }
    }

    // If coordinates have been added/changed, request regions by them
    if (newGeo) {
        newRegions = await this.call('region.setObjRegionsByGeo',
            { obj: photo, geo: newGeo, returnArrFields: { _id: 0, cid: 1, parents: 1, title_en: 1, title_local: 1 } }
        );
    }

    // If photo is public, check that all required fields are filled
    if (photo.s === status.READY || photo.s === status.PUBLIC) {
        photoCheckPublicRequired(photo);
    }

    // If photo watersign setting has been changed, send it to reconvert
    let reconvert = false;

    if (newValues.hasOwnProperty('watersignIndividual') ||
        newValues.hasOwnProperty('watersignOption') && newValues.watersignOption !== oldPhotoObj.watersignOption ||
        newValues.hasOwnProperty('watersignCustom') && newValues.watersignCustom !== oldPhotoObj.watersignCustom) {
        reconvert = true;
        photo.convqueue = true;

        photo.watersignText = getUserWaterSign(photo.user, photo);
        photo.watersignTextApplied = undefined; // Delete applied time of previous watersign appliance

        if (newValues.hasOwnProperty('watersignOption') && newValues.watersignOption !== oldPhotoObj.watersignOption) {
            photo.markModified('watersignOption');
        }
    }

    let saveHistory = false;

    if (photo.s !== status.NEW) {
        photo.cdate = new Date();

        const propsThatCountForUCDate = _.omit(
            newValues,
            'nowaterchange', // Do not notify when admin change permission to change watersign/download
            'watersignIndividual', 'watersignOption', 'watersignCustom', // Do not notify when watersign changed
            'disallowDownloadOriginIndividual', 'disallowDownloadOrigin' // Do not notify when download changed
        );

        if (!_.isEmpty(propsThatCountForUCDate)) {
            photo.ucdate = photo.cdate;
        }

        saveHistory = true;
    }

    const { rel } = await this.call('photo.update', { photo });

    if (newValues.type) {
        // If type has been changed, change it in photo's comments also
        await this.call('comment.changePhotoCommentsType', { photo });
    }

    if (photo.s === status.PUBLIC) {
        if (geoToNull) {
            // If coordinates has been nullified and photo is public, means it was on map, and we should remove it from map.
            // We must do it before coordinates removal, because clusterization looks on it
            await this.call('photo.photoFromMap', {
                photo: oldPhotoObj, paintingMap: oldPhotoObj.type === constants.photo.type.PAINTING,
            });
        } else if (!_.isEmpty(photo.geo)) {
            // Old values of changing properties
            const oldValues = _.transform(newValues, (result, val, key) => {
                result[key] = oldPhotoObj[key];
            }, {});

            if (newGeo || !_.isEmpty(_.pick(oldValues, 'type', 'dir', 'title', 'year', 'year2'))) {
                if (oldValues.type) {
                    // If type has been changed, delete object from previous type map
                    await this.call('photo.photoFromMap', {
                        photo: oldPhotoObj, paintingMap: oldPhotoObj.type === constants.photo.type.PAINTING,
                    });
                }

                // If coordinates have been added/changed or cluster's poster might be changed, then recalculate map.
                // Coordinates must be get exactly from 'photo.geo', not from 'newGeo',
                // because 'newGeo' can be 'undefined' and this case could mean, that coordinates haven't been changed,
                // but data for poster might have been changed
                await this.call('photo.photoToMap', {
                    photo,
                    paintingMap: photo.type === constants.photo.type.PAINTING,
                    // If type was changed, no need to recalc old coordinates or year
                    geoPhotoOld: oldValues.type ? undefined : oldGeo,
                    yearPhotoOld: oldValues.type ? undefined : oldPhotoObj.year,
                });
            }
        }
    }

    // If this photo was published (not neccessary currently public) and regions have been changed,
    // set them to photo's comments
    if (photo.s >= status.PUBLIC && newRegions) {
        const commentAdditionUpdate = {};

        if (geoToNull) {
            commentAdditionUpdate.$unset = { geo: 1 };
        } else if (newGeo) {
            commentAdditionUpdate.$set = { geo: newGeo };
        }

        await this.call('region.updateObjsRegions', {
            model: Comment, criteria: { obj: photo._id }, regions: newRegions, additionalUpdate: commentAdditionUpdate,
        });
    }

    if (saveHistory) {
        await this.call(
            'photo.saveHistory', { oldPhotoObj, photo, canModerate: isMine ? false : canModerate, parsedFileds }
        );
    }

    if (reconvert) {
        converter.addPhotos([{ cid: photo.cid }], 2);
    }

    // Put oldPhoto in regions statistic calculation queue, don't wait
    regionController.putPhotoToRegionStatQueue(oldPhotoObj);

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel }).then(result => ({ reconvert, ...result }));
}

// Фотографии и кластеры по границам
// {z: Масштаб, bounds: [[]]}
function getByBounds(data) {
    const { bounds, z, startAt } = data;

    if (!Array.isArray(bounds) || !_.isNumber(z) || z < 1) {
        throw new BadParamsError();
    }

    // Reverse bound's borders
    for (const bound of bounds) {
        bound[0].reverse();
        bound[1].reverse();
    }

    return this.call('photo.getBounds', data).then(result => ({ startAt, z, ...result }));
}

// Sends selected photos for convert (By admin, whom pressed reconvert button on photo page)
async function convert({ cids = [] }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (!Array.isArray(cids)) {
        throw new BadParamsError();
    }

    cids = cids.filter(cid => _.isNumber(cid) && cid > 0);

    if (!cids.length) {
        throw new BadParamsError();
    }

    const photos = await Photo
        .find({ cid: { $in: cids } }, { cid: 1, user: 1, watersignOption: 1, watersignCustom: 1 }, { lean: true })
        .populate({ path: 'user', select: { _id: 0, login: 1, watersignCustom: 1, settings: 1 } }).exec();

    const converterData = photos.map(photo => ({ cid: photo.cid, watersign: getUserWaterSign(photo.user, photo) }));

    if (converterData.length) {
        await Photo.update({ cid: { $in: cids } }, { $set: { convqueue: true } }, { multi: true }).exec();
    }

    return converter.addPhotos(converterData, 3);
}

// Sends all photo for convert
function convertAll({ min, max, r, s }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const params = { priority: 4 };

    if (_.isNumber(min) && min > 0) {
        params.min = min;
    }

    if (_.isNumber(max) && max > 0 && (!params.min || max >= params.min)) {
        params.max = max;
    }

    if (_.isNumber(r) && r > 0) {
        const region = regionController.getRegionFromCache(r);

        if (region) {
            params.region = { level: _.size(region.parents), cid: region.cid };
        }
    }

    if (Array.isArray(s) && s.every(s => allStatusesSet.has(s))) {
        params.statuses = s;
    }

    return converter.addPhotosAll(params);
}

// Sends user's photo for convert
const usersWhoConvertingNonIndividualPhotos = new Set();

async function convertByUser({ login, resetIndividual, r }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    if (usersWhoConvertingNonIndividualPhotos.has(login)) {
        throw new NoticeError(constantsError.PHOTO_CONVERT_PROCEEDING);
    }

    const stampStart = new Date();
    let region;

    if (_.isNumber(r) && r > 0) {
        region = regionController.getRegionFromCache(r);

        if (region) {
            region = { level: _.size(region.parents), cid: region.cid };
        }
    }

    const historyCalls = [];

    const user = await User.findOne({ login }, { login: 1, watersignCustom: 1, settings: 1 }, { lean: true }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    usersWhoConvertingNonIndividualPhotos.add(login);
    logger.info(
        `Starting sending to convert ${resetIndividual ? '' : 'non-'}individual photos`,
        `of user ${user.login} ${region ? `in region ${region.cid}` : ''}. Invoked by  ${iAm.user.login}`
    );

    const query = { user: user._id };

    if (region) {
        query[`r${region.level}`] = region.cid;
    }

    if (resetIndividual) {
        query.watersignIndividual = true;
    } else {
        query.$or = [{ watersignIndividual: null }, { watersignIndividual: false }];
    }

    const photos = await Photo.find(
        query,
        { _id: 0, cid: 1, s: 1, user: 1, ldate: 1, cdate: 1, ucdate: 1, watersignText: 1 },
        { lean: true, sort: { sdate: -1 } }
    ).exec();

    if (_.isEmpty(photos)) {
        return { added: 0, time: 0 };
    }

    const stamp = new Date();
    const count = photos.length;
    const itsMe = user.login === iAm.user.login;
    const watersignText = getUserWaterSign(user);

    try {
        for (const photoOld of photos) {
            if (photoOld.s === status.NEW || watersignText === photoOld.watersignText) {
                // New photo has no history yet, so don't need to write history row about watersign
                // If watersignText did not really changed, do not save history, only reconvert
                continue;
            }

            const photo = _.clone(photoOld);

            photo.cdate = stamp;
            photo.watersignText = watersignText;

            if (resetIndividual) {
                photo.watersignIndividual = undefined;
            }

            const canModerate = itsMe ? null : permissions.canModerate(photoOld, iAm);

            if (!itsMe && !canModerate) {
                // If at least for one photo user have no rights, deny whole operation
                throw new AuthorizationError();
            }

            historyCalls.push({ iAm, oldPhotoObj: photoOld, photo, canModerate: itsMe ? false : canModerate });
        }

        const update = { $set: {}, $unset: { watersignTextApplied: 1 } };

        if (resetIndividual) {
            update.$unset.watersignIndividual = 1;
        }

        // New photos don't have to update cdate and ucdate
        const updateNew = _.cloneDeep(update);
        const queryNew = _.clone(query);

        queryNew.s = status.NEW;

        query.s = { $ne: status.NEW };
        update.$set.cdate = stamp;

        if (watersignText) {
            update.$set.watersignText = updateNew.$set.watersignText = watersignText;
        } else {
            update.$unset.watersignText = updateNew.$unset.watersignText = 1;
        }

        if (_.isEmpty(updateNew.$set)) {
            delete updateNew.$set;
        }

        await Promise.all([
            Photo.update(query, update, { multi: true }).exec(),
            Photo.update(queryNew, updateNew, { multi: true }).exec(),
            Promise.all(historyCalls.map(hist => this.call('photo.saveHistory', hist))),
        ]);

        const conveyorResult = await converter.addPhotosAll({
            login,
            priority: 2,
            region,
            onlyWithoutTextApplied: true,
        });

        return { updated: count, conveyorAdded: conveyorResult.conveyorAdded, time: Date.now() - stampStart };
    } finally {
        usersWhoConvertingNonIndividualPhotos.delete(login);
        logger.info(
            `Finish in ${(Date.now() - stampStart) / 1000}s sending to convert ${count}`,
            `${resetIndividual ? '' : 'non-'}individual photos`,
            `of user ${login} ${region ? `in region ${region.cid}` : ''}. Invoked by ${iAm.user.login}`
        );
    }
}

async function resetIndividualDownloadOrigin({ login, r }) {
    const { handshake: { usObj: iAm } } = this;

    if (!login) {
        throw new BadParamsError();
    }

    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw new AuthorizationError();
    }

    const stampStart = new Date();
    let region;

    if (_.isNumber(r) && r > 0) {
        region = regionController.getRegionFromCache(r);

        if (region) {
            region = { level: _.size(region.parents), cid: region.cid };
        }
    }

    const user = await User.findOne({ login }, { login: 1, settings: 1 }, { lean: true }).exec();

    if (!user) {
        throw new NotFoundError(constantsError.NO_SUCH_USER);
    }

    const query = { user: user._id, disallowDownloadOriginIndividual: true };

    if (region) {
        query[`r${region.level}`] = region.cid;
    }

    const { n: updated = 0 } = await Photo.update(
        query, { $unset: { disallowDownloadOriginIndividual: 1 } }, { multi: true }
    ).exec();

    const time = Date.now() - stampStart;

    logger.info(
        `Resetting individual download setting in ${updated} photos has finished in ${time / 1000}s`,
        `of user ${login} ${region ? `in region ${region.cid}` : ''}. Invoked by ${iAm.user.login}`
    );

    return { updated, time };
}

/**
 * Build request parameters (query) for requesting photo with filter considering rights on statuses and regions
 * @param filter
 * @param forUserId
 * @param iAm Session object of user
 */
export function buildPhotosQuery(filter, forUserId, iAm, random) {
    let query; // Result query
    let queryPub; // Request within the public regions
    let queryMod; // Request within the moderated regions
    let rqueryPub;
    let rqueryMod;

    let regionsArr = [];
    let regionsCids = [];
    let regionsHash = {};
    let regionsArrAll = []; // Array of regions objects, including inactive (phantom in filters)

    const itsMineGallery = forUserId && forUserId.equals(iAm.user._id);
    let statuses = publicDefaultStatus;

    if (iAm.registered) {
        if (filter.s && filter.s.length) {
            statuses = filter.s;
        } else if (forUserId) {
            if (itsMineGallery) {
                statuses = userGalleryBySelfDefaultStatuses;
            } else if (iAm.isModerator || iAm.isAdmin) {
                statuses = userGalleryByModeratorDefaultStatuses;
            }
        }
    }

    let rs;
    let r = filter.r;
    let regionExludeAll; // Array if excluded regions objects, to return it to user
    let regionExludeCids; // Array if excluded regions cids, can be undefined whils regionExludeAll is not, if rdis is active

    // Excluding regions only available if some regions are specified
    // So ignore showing children option and excluded regions list if regions are not specified
    if (Array.isArray(r) && r.length) {
        rs = filter.rs;
        regionExludeCids = filter.re;
    } else if (r === 0) {
        regionExludeCids = filter.re;
    }

    if (regionExludeCids && regionExludeCids.length) {
        regionExludeAll = regionController.getRegionsArrPublicFromCache(regionExludeCids).sort((a, b) =>
            a.parents.length < b.parents.length || a.parents.length === b.parents.length && a.cid < b.cid ? -1 : 1
        );

        if (regionExludeAll.length !== regionExludeCids) {
            if (!regionExludeAll.length) {
                regionExludeAll = regionExludeCids = undefined;
            } else {
                regionExludeCids = regionExludeAll.map(region => region.cid);
            }
        }
    }

    const statusesOpened = [];
    const statusesClosed = [];

    statuses.forEach(s => (openedStatusesSet.has(s) ? statusesOpened : statusesClosed).push(s));

    const statusesOpenedOnly = statuses.length === statusesOpened.length;

    const result = { query: null, s: [], rcids: [], rarr: [], rhash: Object.create(null) };

    if (Array.isArray(r) && r.length) {
        regionsArrAll = regionController.getRegionsArrPublicFromCache(r);

        if (Array.isArray(filter.rp) && filter.rp.length) {
            // If exists array of inactive (phantom) regions of filter, take the difference
            regionsCids = _.difference(r, filter.rp);
            regionsArr = regionController.getRegionsArrPublicFromCache(regionsCids);
        } else {
            regionsCids = r;
            regionsArr = regionsArrAll;
        }

        if (regionsArr.length) {
            const regionQuery = regionController.buildQuery(regionsArr, rs, regionExludeAll);

            rqueryPub = rqueryMod = regionQuery.rquery;
            regionsHash = regionQuery.rhash;
        } else {
            // If user switched off all selected regions, consider request as with all regions (r = 0)
            r = 0;
            rs = undefined;
            regionExludeCids = undefined; // Consider that if user disabled all selected regions, he disbaled all excluded too
        }
    } else if (r === undefined && iAm.registered && iAm.user.regions.length && (!forUserId || !itsMineGallery)) {
        regionsHash = iAm.rhash;
        regionsCids = _.map(iAm.user.regions, 'cid');
        regionsArr = regionsArrAll = regionController.getRegionsArrPublicFromCache(regionsCids);
    }

    if (regionsCids.length) {
        regionsCids = regionsCids.map(Number);
    }

    if (statusesOpenedOnly) {
        queryPub = {};  // Give only public photos to anonymous or when filter for public is active

        if (r === undefined && iAm.registered && iAm.user.regions.length) {
            // If filter is not specified - give by own user regions (that user specified in settings)
            // In this case rs and re are ignored
            rqueryPub = iAm.rquery;
        }
    } else if (itsMineGallery) {
        // Own gallery give without removed regions(for non-admins) and without regions in settings, only by filter.r
        queryMod = {};
    } else {
        if (r === undefined && iAm.registered && iAm.user.regions.length) {
            // If filter is not specified - give by own user regions (that user specified in settings)
            // In this case rs and re are ignored
            rqueryPub = rqueryMod = iAm.rquery;
        }

        if (iAm.isAdmin) {
            // Give all statuses to the admins
            queryMod = {};
        } else if (!iAm.user.role || iAm.user.role < 5) {
            // Give only public to users, who role is below regions moderators
            queryPub = {};
        } else if (iAm.isModerator) {
            // To regions moderators give within theirs regions without removed regions,
            // within other regions - only public regions

            if (!iAm.user.mod_regions.length || iAm.mod_regions_equals) {
                // Give area as moderated for global moderators or regional moderators,
                // whose moderators regions match with own, i.e. moderation area includes users area
                queryMod = {};
            } else if (r === 0 || !regionsCids.length) {
                // If all users regions requested (i.e. whole world)
                // do global request for public, and with statuses for moderated
                queryPub = {};

                // if it global filter with exluded, need to find out what should be excluded from moderation regions
                if (r === 0 && regionExludeCids) {
                    const regionsMod = [];

                    // First exclude modaration regions that are under excluded regions
                    for (const region of iAm.user.mod_regions) {
                        // Exclude moderation region if it's in the list of excluded
                        if (regionExludeCids.includes(region.cid)) {
                            continue;
                        }

                        // Exclude moderation region if any of it's parent in the list of excluded
                        if (!region.parents || region.parents.some(parentCid => regionExludeCids.includes(parentCid))) {
                            continue;
                        }

                        regionsMod.push(region);
                    }

                    // Then exclude ecluded regions that are children of moderation
                    if (regionsMod.length) {
                        const regionQuery = regionController.buildQuery(regionsMod, null, regionExludeAll);

                        rqueryMod = regionQuery.rquery;
                        queryMod = {};
                    }
                } else {
                    // Otherwise just use user's moderation query
                    queryMod = {};
                    rqueryMod = iAm.mod_rquery;
                }
            } else {
                // If arrays of users and moderated regions are different,
                // "subtract" moderated from public , obtaining two new arrays

                const regionsPub = []; // Array of public regions that are selected
                const regionsMod = []; // Array of moderated regions
                let regionsModUnderSelectedPubCidsSet;

                // If user region or one of its parent is moderated,
                // then include it into array of moderation regions
                for (const region of regionsArr) {
                    let contained = false;

                    if (iAm.mod_rhash[region.cid]) {
                        contained = true;
                    } else if (region.parents) {
                        for (const parentCid of region.parents) {
                            if (iAm.mod_rhash[parentCid]) {
                                contained = true;
                                break;
                            }
                        }
                    }

                    if (contained) {
                        regionsMod.push(region);
                    } else {
                        regionsPub.push(region);
                    }
                }

                if (regionsPub.length) {
                    const regionQuery = regionController.buildQuery(regionsPub, rs, regionExludeAll);
                    const regionsExcludeHash = regionQuery.rehash || {};

                    rqueryPub = regionQuery.rquery;
                    queryPub = {};

                    if (regionQuery.withSubRegion !== false) {
                        // If showing subregions option (rs) is not switched to 'No',
                        // find moderated regions that are children to selected public regions,
                        // are not in the list of excluded or their parents is in that list.
                        // Then include that moderated regions in array of moderated,
                        // despite the fact that the parent is an array of public.

                        regionsModUnderSelectedPubCidsSet = new Set();

                        for (const region of iAm.user.mod_regions) {
                            // Exclude moderation region if it's in the list of excluded
                            if (regionsExcludeHash[region.cid]) {
                                continue;
                            }

                            // Exclude moderation region if any of it's parent in the list of excluded
                            if (!region.parents || region.parents.some(parentCid => regionsExcludeHash[parentCid])) {
                                continue;
                            }

                            // If moderation region is child of selected public, put it into the array of moderation
                            // Note: can't be combine with previous 'some', because excluded parent can be on different level
                            if (region.parents.some(parentCid => regionQuery.rhash[parentCid])) {
                                regionsMod.push(region);
                                regionsModUnderSelectedPubCidsSet.add(region.cid);
                            }
                        }
                    }
                }

                // Treat moderation regions that took places of some selected regions
                // in the same way as selected regions on which current user have public rights only,
                // i.e consider rs and re
                // But not moderation regions that are children to selected -
                // they don't need to consider rs and re, they affected by that options
                if (regionsMod.length) {
                    const regionQuery = regionController.buildQuery(regionsMod, rs, regionExludeAll, regionsModUnderSelectedPubCidsSet);

                    rqueryMod = regionQuery.rquery;
                    queryMod = {};
                }
            }
        }
    }

    if (queryPub) {
        if (statusesOpened.length) {
            queryPub.s = statusesOpened.length > 1 ? { $in: statusesOpened } : statusesOpened[0];
            result.s.push(...statusesOpened);

            // If rquery has not been set and request is global and array of excluded has been set,
            // for query of excluded regions, like {r1: {$ne: 3}, r2: {$nin: [7, 9]}}
            if (!rqueryPub && r === 0 && regionExludeCids) {
                const reQuery = regionController.buildGlobalReQuery(regionExludeAll);

                rqueryPub = reQuery.rquery;
            }

            if (rqueryPub) {
                Object.assign(queryPub, rqueryPub);
            }
        } else {
            // If filter specified and doesn't contain public, delete query for public
            queryPub = undefined;
        }
    }

    if (queryMod) {
        if (!queryPub && statusesOpened.length) {
            // If query for public doesn't exists, but it has to, add public to moderated
            // It happens to the admins and global moderators, because they have one queryMod
            statusesClosed.push(...statusesOpened);
        }

        if (statusesClosed.length) {
            if (statusesClosed.length < allStatuses.length) {
                // User is not selecting all statuses, specify list
                queryMod.s = statusesClosed.length > 1 ? { $in: statusesClosed } : statusesClosed[0];
            }

            result.s.push(...statusesClosed);
        }

        // If rquery has not been set and request is global and array of excluded has been set,
        // for query of excluded regions, like {r1: {$ne: 3}, r2: {$nin: [7, 9]}}
        if (!rqueryMod && r === 0 && regionExludeCids) {
            const reQuery = regionController.buildGlobalReQuery(regionExludeAll);

            rqueryMod = reQuery.rquery;
        }

        if (rqueryMod) {
            Object.assign(queryMod, rqueryMod);
        }
    }

    if (queryPub && queryMod) {
        query = { $or: [queryPub, queryMod] };
    } else {
        query = queryPub || queryMod;
    }

    if (filter.t !== null && query) {
        let types;

        if (filter.t && filter.t.length) {
            // If user selected some(not all) types
            if (filter.t.length !== typesSet.size) {
                types = filter.t;
                query.type = types.length === 1 ? types[0] : { $in: types };
            }
        } else if (iAm.photoFilterTypes.length) {
            // If user didn't select any types and has default types in settings - select them
            types = iAm.photoFilterTypes;
            Object.assign(query, iAm.photoFilterQuery);
        }

        if (types) {
            result.types = types;
        }
    }

    if (filter.y && filter.y.length === 2) {
        query.year = { $lte: filter.y[1] };
        query.year2 = { $gte: filter.y[0] };

        result.y = filter.y;
    }

    if (filter.c) {
        if (filter.c.no && filter.c.min) {
            const cquey = { $or: [{ ccount: null }, { ccount: { $gte: filter.c.min } }] };

            if (query.$or) {
                query.$and = [{ $or: query.$or }, cquey];
                delete query.$or;
            } else {
                query.$or = cquey.$or;
            }
        } else if (filter.c.no) {
            query.ccount = null;
        } else if (filter.c.min) {
            query.ccount = { $gte: filter.c.min };
        }

        result.c = filter.c;
    }

    if (random) {
        if (!query) {
            query = {};
        }

        query.r2d = { $near: [Math.random() * 100, Math.random() * 100] };
    }

    if (query) {
        result.query = query;
        result.rcids = regionsCids;
        result.rhash = regionsHash;
        result.rarr = regionsArrAll;
        result.rearr = regionExludeAll;
    }

    // console.log(JSON.stringify(result.query, null, '\t'));
    return result;
}

// Return history of photo edit
async function giveObjHist({ cid, fetchId, showDiff }) {
    if (!Number(cid) || cid < 1 || !Number(fetchId)) {
        throw new BadParamsError();
    }

    const photo = await this.call('photo.find', { query: { cid }, fieldSelect: { _id: 0 } });

    if (!photo) {
        throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
    }

    const historySelect = { _id: 0, cid: 0 };

    if (!showDiff) {
        historySelect.diff = 0;
    }

    const histories = await PhotoHistory
        .find({ cid }, historySelect, { lean: true, sort: { stamp: 1 } })
        .populate({ path: 'user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } }).exec();

    if (_.isEmpty(histories)) {
        throw new NoticeError(constantsError.HISTORY_DOESNT_EXISTS);
    }

    const reasons = new Set();
    const regions = {};
    let result = [];
    let haveDiff;
    let j;

    for (let i = 0; i < histories.length; i++) {
        const history = histories[i];

        if (!history.user || !history.stamp) {
            logger.warn('Object %d has corrupted %dth history entry', cid, i);
            continue;
        }

        const { values } = history;

        // If it first entry with empty value, skip it
        if (i === 0 && _.isEmpty(values)) {
            continue;
        }

        if (values) {
            // If selected diff-view and diff exists for this entry, assign diff value
            if (history.diff) {
                haveDiff = true;

                for (j in history.diff) {
                    if (history.diff.hasOwnProperty(j)) {
                        values[j] = history.diff[j];
                    }
                }

                delete history.diff;
            }

            if (values.geo) {
                values.geo.reverse();
            }

            // If regions changed in this entry, add each of them into hash for further selection
            if (values.regions) {
                for (const region of values.regions) {
                    regions[region] = 1;
                }
            }
        }

        // Remove years fields from removed, because 'y' field will be used
        if (!_.isEmpty(history.del)) {
            const del = history.del.filter(d => d !== 'year' && d !== 'year2');

            if (del) {
                history.del = del;
            } else {
                delete history.del;
            }
        } else if (history.del) {
            delete history.del;
        }

        if (history.hasOwnProperty('add') && _.isEmpty(history.add)) {
            delete history.add;
        }

        if (history.roleregion) {
            regions[history.roleregion] = 1;
        }

        // If this entry contains reason (not null/manual), add it to hash for further selection
        if (!_.isEmpty(history.reason) && history.reason.cid) {
            reasons.add(history.reason.cid);
        }

        history.stamp = history.stamp.getTime();

        result.push(history);
    }

    result = { hists: result, fetchId, haveDiff };

    // If regions exists, get theirs objects
    if (Object.keys(regions).length) {
        result.regions = regionController.fillRegionsHash(regions, ['cid', 'title_en']);
    }

    // If reasons exists, get theirs headers
    if (reasons.size) {
        result.reasons = getReasonHashFromCache([...reasons]);
    }

    return result;
}

async function getDownloadKey({ cid }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw new AuthorizationError();
    }

    cid = Number(cid);

    if (!cid) {
        throw new NotFoundError(constantsError.NO_SUCH_PHOTO);
    }

    const photo = await this.call('photo.find', { query: { cid }, options: { lean: true }, populateUser: true });
    const canDownload = permissions.getCan(photo, iAm).download;

    if (canDownload === 'login') {
        throw new AuthorizationError();
    }

    const origin = canDownload === true || canDownload === 'byrole';

    const key = Utils.randomString(32);
    const lossless = photo.mime === 'image/png';
    const title = `${photo.cid} ${(photo.title || '').replace(/[/|]/g, '-')}`.substr(0, 120);
    const fileName = `${title}.${lossless ? 'png' : 'jpg'}`;
    const path = (origin ? 'private/photos/' : 'public/photos/a/') + photo.path;
    // We keep only size of origin file, size with watermark must be calculated by downloader.js
    const size = origin ? photo.size : null;

    await new Download({
        key, data: { fileName, path, size, mime: photo.mime || 'image/jpeg', login: iAm.user.login, cid, origin },
    }).save();

    return { key, origin };
}

save.isPublic = true;
create.isPublic = true;
revoke.isPublic = true;
ready.isPublic = true;
toRevision.isPublic = true;
reject.isPublic = true;
rereject.isPublic = true;
approve.isPublic = true;
activateDeactivate.isPublic = true;
remove.isPublic = true;
removeIncoming.isPublic = true;
restore.isPublic = true;
giveForPage.isPublic = true;
givePublicIndex.isPublic = true;
givePublicNoGeoIndex.isPublic = true;
givePS.isPublic = true;
giveUserGallery.isPublic = true;
giveForApprove.isPublic = true;
giveUserPhotosAround.isPublic = true;
giveUserPhotosPrivate.isPublic = true;
giveFresh.isPublic = true;
giveNearestPhotos.isPublic = true;
giveCan.isPublic = true;
giveObjHist.isPublic = true;
getByBounds.isPublic = true;
convert.isPublic = true;
convertAll.isPublic = true;
convertByUser.isPublic = true;
resetIndividualDownloadOrigin.isPublic = true;
giveNewLimit.isPublic = true;
getDownloadKey.isPublic = true;

export default {
    save,
    create,
    revoke,
    ready,
    toRevision,
    reject,
    rereject,
    approve,
    activateDeactivate,
    remove,
    removeIncoming,
    restore,
    giveForPage,
    givePublicIndex,
    givePublicNoGeoIndex,
    givePS,
    giveUserGallery,
    giveForApprove,
    giveUserPhotosAround,
    giveUserPhotosPrivate,
    giveFresh,
    giveNearestPhotos,
    giveCan,
    giveObjHist,
    getByBounds,
    convert,
    convertAll,
    convertByUser,
    resetIndividualDownloadOrigin,
    giveNewLimit,
    getDownloadKey,

    find,
    give,
    givePhotos,
    update,
    getBounds,
    photoToMap,
    saveHistory,
    photoFromMap,
    prefetchForEdit,
    givePrevNextCids,
    giveCanProtected,
    changeFileProtection,
    changePublicExternality,
    fillPhotosProtection,
    putProtectedFileAccessCache,
    putProtectedFilesAccessCache,
};

// Resets the view statistics for the day and week
const planResetDisplayStat = (function () {
    async function resetStat() {
        const setQuery = { vdcount: 0 };
        const needWeek = moment.utc().day() === 1; // Week start - monday

        if (needWeek) {
            setQuery.vwcount = 0;
        }

        try {
            logger.info(`Resetting day ${needWeek ? 'and week ' : ''}display statistics...`);

            const { n: count = 0 } = await Photo.update(
                { s: { $in: [status.PUBLIC, status.DEACTIVATE, status.REMOVE] } }, { $set: setQuery }, { multi: true }
            ).exec();

            logger.info(`Reset day ${needWeek ? 'and week ' : ''}display statistics for ${count} photos complete`);
        } catch (err) {
            return logger.error(err);
        }

        planResetDisplayStat();
    }

    return function () {
        setTimeout(resetStat, moment.utc().add(1, 'd').startOf('day').diff(moment.utc()) + 2000);
    };
}());

// Every 5 minute check what photo were reconverted last time earlier than photo's chache time,
// and delete anticache url parameter 's' from file property
async function resetPhotosAnticache() {
    const photos = await Photo.find({
        converted: { $gte: new Date(Date.now() - ms('7d')), $lte: new Date(Date.now() - config.photoCacheTime) },
        $where: 'this.file !== this.path',
    }, { _id: 0, cid: 1, path: 1 }, { lean: true }).exec();

    // For each of found photo set file equals path, don't wait execution
    for (const { cid, path } of photos) {
        Photo.update({ cid }, { $set: { file: path } }).exec();
    }

    if (photos.length) {
        loggerApp.info(`Photos anticache was reset for ${photos.length} photos`);
    }

    setTimeout(resetPhotosAnticache, ms('5m'));
}

// Check that redis contains file keys that point to the corresponding photo cid for every not public photo
// This info is needed for downloader process to check client rights to serve him photo's protected file
// Do this on start and every one hour
async function syncUnpublishedPhotosWithRedis() {
    try {
        let [actualCount = 0, redisCount] = await Promise.all([
            Photo.count({ s: { $ne: status.PUBLIC } }).exec(),
            dbRedis.getAsync('notpublic:count'),
        ]);

        redisCount = Number(redisCount) || 0;

        if (actualCount !== redisCount) {
            const start = Date.now();

            const [photos] = await Promise.all([
                // Select cid and path to file for all non public photos
                Photo.find({ s: { $ne: status.PUBLIC } }, { _id: 0, cid: 1, path: 1 }, { lean: true }).exec(),

                // Remove all 'notpublic:' keys fro redis, by evaluating lua script
                dbRedis.evalAsync('for _,k in ipairs(redis.call("keys","notpublic:*")) do redis.call("del",k) end', 0),
            ]);

            // Set count first to avoid race condition,
            // if this counter is incremented from somewhare while we adding keys
            dbRedis.set('notpublic:count', photos.length);

            let multi;
            const finalCounter = photos.length - 1;

            // Accumulate several set to multi set and flush it to redis by 100 keys
            for (const [i, { cid, path }] of photos.entries()) {
                if (i % 100 === 0 || i === finalCounter) {
                    if (multi) {
                        await multi.execAsync();
                    }

                    if (i !== finalCounter) {
                        multi = dbRedis.multi();
                    }
                }

                multi.set(`notpublic:${path}`, `${cid}`);
            }

            loggerApp.info(
                `Redis unpublished photos syncing set ${photos.length} keys to redis in ${Date.now() - start}ms.`,
                `Was ${actualCount}/${redisCount}`,
            );
        } else {
            loggerApp.info('Redis unpublished photos are in sync with mongodb one');
        }
    } catch (error) {
        loggerApp.error('Redis unpublished photos syncing', error);
    }

    setTimeout(syncUnpublishedPhotosWithRedis, ms('1h'));
}

export const photosReady = waitDb.then(() => {
    planResetDisplayStat(); // Plan statistic clean up

    // Application start should wait cache and redis operations
    return Promise.all([resetPhotosAnticache(), syncUnpublishedPhotosWithRedis()]);
});
