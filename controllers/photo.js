import fs from 'fs';
import ms from 'ms';
import _ from 'lodash';
import path from 'path';
import log4js from 'log4js';
import moment from 'moment';
import config from '../config';
import Bluebird from 'bluebird';
import Utils from '../commons/Utils';
import { waitDb } from './connection';
import constants from './constants.js';
import * as session from './_session';
import * as regionController from './region';
import * as converter from './converter';
import * as userObjectRelController from './userobjectrel';
import { getReasonHashFromCache } from './reason';
import { userSettingsDef, userSettingsVars } from './settings';

import { User } from '../models/User';
import { Counter } from '../models/Counter';
import { Comment } from '../models/Comment';
import { Download } from '../models/Download';
import { Photo, PhotoMap, PhotoHistory } from '../models/Photo';

const shift10y = ms('10y');
const maxNewPhotosLimit = 1e4;
const logger = log4js.getLogger('photo.js');
const incomeDir = path.join(config.storePath, 'incoming');
const privateDir = path.join(config.storePath, 'private/photos');

const msg = {
    deny: 'У вас нет прав на это действие',
    noUser: 'Запрашиваемый пользователь не существует',
    noPhoto: 'Запрашиваемой фотографии не существует или не доступна',
    noRegion: 'Такого региона не существует',
    badParams: 'Неверные параметры запроса',
    needReason: 'Необходимо указать причину операции',
    // Две кнопки: "Посмотреть", "Продолжить <сохранение|изменение статуса>"
    changed: 'С момента обновления вами страницы, информация на ней была кем-то изменена',
    anotherStatus: 'Фотография уже в другом статусе, обновите страницу',
    mustCoord: 'Фотография должна иметь координату или быть привязана к региону вручную'
};

const {
    photo: {
        status,
        parsingFields,
        historyFields,
        historyFieldsDiff,
        watersignLength,
        watersignPattern
    },
    region: {
        maxLevel: maxRegionLevel
    }
} = constants;

const parsingFieldsSet = new Set(parsingFields);
const historyFieldsDiffHash = historyFieldsDiff.reduce(function (result, field) {
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
    ready: 1
};
const compactFieldsForReg = {
    _id: 1,
    cid: 1,
    file: 1,
    s: 1,
    ucdate: 1,
    title: 1,
    year: 1,
    ccount: 1,
    conv: 1,
    convqueue: 1,
    ready: 1
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
            // download: [true, byrole, withwater, login]
        };
        const s = photo.s;

        if (usObj.registered) {
            if (typeof ownPhoto !== 'boolean') {
                ownPhoto = !!photo.user && User.isEqual(photo.user, usObj.user);
            }

            if (canModerate !== undefined && canModerate !== null) {
                canModerate = !!canModerate;
            } else {
                canModerate = !!permissions.canModerate(photo, usObj);
            }

            const userSettings = photo.user.settings || userSettingsDef;

            if (// If setted individual that photo has now watersing
            photo.watersignIndividual && photo.watersignOption === false ||
                // If no individual watersign option and setted by profile that photo has now watersing
            !photo.watersignIndividual && userSettings.photo_watermark_add_sign === false ||
                // If individually setted allow to download origin
            photo.disallowDownloadOriginIndividual && !photo.disallowDownloadOrigin ||
                // If no individual downloading setting and setted by profile that photo has now watersing
                // or by profile allowed to download origin
            !photo.disallowDownloadOriginIndividual &&
            (userSettings.photo_watermark_add_sign === false || !userSettings.photo_disallow_download_origin)) {
                // Let download origin
                can.download = true;
            } else if (ownPhoto || usObj.isAdmin) {
                // Or if it photo owner or admin then allow to download origin with special sign on button
                can.download = 'byrole';
            } else {
                // Otherwise registered user can download full-size photo only with watermark
                can.download = 'withwater';
            }

            // Редактировать может модератор и владелец, если оно не удалено и не отозвано. Администратор - всегда
            can.edit = usObj.isAdmin || s !== status.REMOVE && s !== status.REVOKE && (canModerate || ownPhoto) || undefined;
            // Отправлять на премодерацию может владелец и фото новое или на доработке
            can.ready = (s === status.NEW || s === status.REVISION) && ownPhoto || undefined;
            // Отозвать может только владелец пока фото новое
            can.revoke = s < status.REVOKE && ownPhoto || undefined;
            // Модератор может отклонить не свое фото пока оно новое
            can.reject = s < status.REVOKE && canModerate && !ownPhoto || undefined;
            // Administrator can resore rejected photo
            can.rereject = s === status.REJECT && usObj.isAdmin || undefined;
            // Восстанавливать из удаленных может только администратор
            can.restore = s === status.REMOVE && usObj.isAdmin || undefined;
            // Отправить на конвертацию может только администратор
            can.convert = usObj.isAdmin || undefined;
            // Комментировать опубликованное может любой зарегистрированный, или модератор и владелец снятое с публикации
            can.comment = s === status.PUBLIC || s > status.PUBLIC && canModerate || undefined;
            // Change watermark sign and download setting can administrator and owner/moderator
            // if administrator didn't prohibit it for this photo or entire owner
            can.watersign = usObj.isAdmin || (ownPhoto || canModerate) &&
                (!photo.user.nowaterchange && !photo.nowaterchange || photo.nowaterchange === false) || undefined;
            // Administrator can prohibit watesign changing by owner/moderator
            can.nowaterchange = usObj.isAdmin || undefined;

            if (canModerate) {
                // Модератор может отправить на доработку
                can.revision = s === status.READY || undefined;
                // Модератор может одобрить новое фото
                can.approve = s < status.REJECT || undefined;
                // Модератор может активировать только деактивированное
                can.activate = s === status.DEACTIVATE || undefined;
                // Модератор может деактивировать только опубликованное
                can.deactivate = s === status.PUBLIC || undefined;
                // Модератор может удалить уже опубликованное и не удаленное фото
                can.remove = s >= status.PUBLIC && s !== status.REMOVE || undefined;
            }
        } else {
            can.download = 'login';
        }

        return can;
    },
    canSee(photo, usObj) {
        if (photo.s === status.PUBLIC) {
            return true;
        }

        if (usObj.registered && photo.user) {
            // Owner always can see his photos
            if (User.isEqual(photo.user, usObj.user)) {
                return true;
            }
            // Admin can see removed photos
            if (photo.s === status.REMOVE) {
                return usObj.isAdmin;
            }

            return permissions.canModerate(photo, usObj);
        }

        return false;
    }
};

/**
 * Find photo considering user rights
 * @param query
 * @param fieldSelect Field select (mandatory are: user, s, r0-rmaxRegionLevel)
 * @param options For example, { lean: true }
 * @param populateUser Flag, that user object needed
 */
export async function find({ query, fieldSelect, options, populateUser }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        query.s = status.PUBLIC; // Anonyms can see only public
    }

    let photo = Photo.findOne(query, fieldSelect || {}, options || {});

    if (populateUser) {
        photo = photo.populate({ path: 'user' });
    }

    photo = await photo.exec();

    if (!photo || !photo.user || !permissions.canSee(photo, iAm)) {
        throw { message: msg.noPhoto };
    }

    if (populateUser) {
        photo.user.settings = _.defaults(photo.user.settings || {}, userSettingsDef);
    }

    return photo;
}

function getNewPhotosLimit(user) {
    let canCreate = 0;
    const pfcount = user.pfcount;

    if (user.rules && _.isNumber(user.rules.photoNewLimit)) {
        canCreate = Math.max(0, Math.min(user.rules.photoNewLimit, maxNewPhotosLimit) - pfcount);
    } else if (user.ranks && (user.ranks.includes('mec_silv') || user.ranks.includes('mec_gold'))) {
        // Silver and Gold metsenats have the maximum possible limit
        canCreate = maxNewPhotosLimit - pfcount;
    } else if (user.ranks && user.ranks.includes('mec')) {
        // Metsenat has a limit of 100
        canCreate = Math.max(0, 100 - pfcount);
    } else if (user.pcount < 25) {
        canCreate = Math.max(0, 3 - pfcount);
    } else if (user.pcount < 50) {
        canCreate = Math.max(0, 5 - pfcount);
    } else if (user.pcount < 200) {
        canCreate = Math.max(0, 10 - pfcount);
    } else if (user.pcount < 1000) {
        canCreate = Math.max(0, 50 - pfcount);
    } else if (user.pcount >= 1000) {
        canCreate = Math.max(0, 100 - pfcount);
    }

    return canCreate;
}

async function getBounds(data) {
    const { bounds, z, year, year2 } = data;

    // Determine whether fetch by years needed
    const years = _.isNumber(year) && _.isNumber(year2) && year >= 1826 && year <= 2000 && year2 >= year && year2 <= 2000;
    let clusters;
    let photos;

    if (z < 17) {
        ({ photos, clusters } = await this.call(`cluster.${years ? 'getBoundsByYear' : 'getBounds'}`, data));
    } else {
        const yearCriteria = years ? year === year2 ? year : { $gte: year, $lte: year2 } : false;

        photos = await* bounds.map(bound => {
            const criteria = { geo: { $geoWithin: { $box: bound } } };

            if (yearCriteria) {
                criteria.year = yearCriteria;
            }

            return PhotoMap.find(criteria, { _id: 0 }, { lean: true }).exec();
        });

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
    _.defaults(fieldNoSelect, { sign: 0, sdate: 0 });
    if (fieldNoSelect.frags === undefined) {
        fieldNoSelect['frags._id'] = 0;
    }

    let photo = await Photo.findOne({ cid }, fieldNoSelect).exec();

    if (!photo || !permissions.canSee(photo, iAm)) {
        throw { message: msg.noPhoto, noPhoto: true };
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
            throw { message: msg.noUser, noPhoto: true };
        }
    }

    const regionFields = photo.geo ? ['cid', 'title_local'] :
        // If photo has no coordinates, additionally take home position of regions
        { _id: 0, cid: 1, title_local: 1, center: 1, bbox: 1, bboxhome: 1 };

    const regions = await this.call('region.getObjRegionList', { obj: photo, fields: regionFields, fromDb: !photo.geo });

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
        sex: owner.sex
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

    delete photo._id;

    return { photo, can };
}

async function giveNewLimit({ login }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered || iAm.user.login !== login && !iAm.isAdmin) {
        throw { message: msg.deny };
    }

    const userObj = session.getOnline({ login });
    const user = userObj ? userObj.user : await User.findOne({ login }).exec();

    if (!user) {
        throw { message: msg.noUser };
    }

    return { limit: getNewPhotosLimit(user) };
};

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
// var dirs = ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'];
async function create({ files }) {
    const { socket, handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }
    if (!Array.isArray(files) && !_.isObject(files)) {
        throw { message: msg.badParams };
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

    await* files.map(function (item) {
        item.fullfile = item.file.replace(/((.)(.)(.))/, '$2/$3/$4/$1');
        return fs.renameAsync(path.join(incomeDir, item.file), path.join(privateDir, item.fullfile));
    });

    const count = await Counter.incrementBy('photo', files.length);

    if (!count) {
        throw { message: 'Increment photo counter error' };
    }

    const now = Date.now();
    const next = count.next - files.length + 1;

    await* files.map((item, i) => {
        const photo = new Photo({
            user,
            s: 0,
            cid: next + i,
            file: item.fullfile,
            ldate: new Date(now + i * 10), // Increase loading time of each file  by 10 ms for proper sorting
            sdate: new Date(now + i * 10 + shift10y), // New photos must be always on top
            type: item.type,
            size: item.size,
            geo: undefined,
            title: item.name ? item.name.replace(/(.*)\.[^.]+$/, '$1') : undefined, // Cut off file extension
            frags: undefined,
            watersignText: getUserWaterSign(user),
            convqueue: true
            // geo: [_.random(36546649, 38456140) / 1000000, _.random(55465922, 56103812) / 1000000],
            // dir: dirs[_.random(0, dirs.length - 1)],
        });

        cids.push({ cid: photo.cid });
        return photo.save();
    });

    converter.addPhotos(cids, 1);

    user.pfcount = user.pfcount + files.length;

    await session.saveEmitUser({ usObj: iAm, wait: true, excludeSocket: socket });

    return { message: `${files.length} photo successfully saved`, cids };
};

// Add photo onto map
async function photoToMap({ photo, geoPhotoOld, yearPhotoOld }) {
    const $update = {
        $setOnInsert: { cid: photo.cid },
        $set: {
            geo: photo.geo,
            file: photo.file,
            title: photo.title,
            year: photo.year,
            year2: photo.year2 || photo.year
        }
    };

    if (_.isString(photo.dir) && photo.dir.length) {
        $update.$set.dir = photo.dir;
    } else {
        $update.$unset = { dir: 1 };
    }

    await* [
        PhotoMap.update({ cid: photo.cid }, $update, { upsert: true }).exec(),
        this.call('cluster.clusterPhoto', { photo, geoPhotoOld, yearPhotoOld }) // Send to clusterization
    ];
}

// Remove photo from map
async function photoFromMap({ photo }) {
    return await* [
        this.call('cluster.declusterPhoto', { photo }),
        PhotoMap.remove({ cid: photo.cid }).exec()
    ];
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
    };

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
            del: undefined
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
    newEntry.add = add.length ? add : undefined;
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

    return await* promises;
};

/**
 * Выборка объекта фотографии для редактирования с проверкой прав на указанный can
 * Проверяет не редактировался ли объект после указанного времени cdate. Если да - бросит { changed: true }
 * Возвращает объект и свойство canModerate
 */
async function prefetchForEdit({ data: { cid, s, cdate, ignoreChange }, can }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    cid = Number(cid);

    if (isNaN(cid) || cid < 1) {
        throw { message: msg.badParams };
    }

    const photo = await this.call('photo.find', { query: { cid }, populateUser: true });

    if (_.isNumber(s) && s !== photo.s) {
        throw { message: msg.anotherStatus };
    }

    const canModerate = permissions.canModerate(photo, iAm);

    if (can && permissions.getCan(photo, iAm, null, canModerate)[can] !== true) {
        throw { message: msg.deny };
    }

    // Если фотография изменилась после отображения и не стоит флаг игнорирования изменения,
    // то возвращаем статус, что изменено
    if (ignoreChange !== true && _.isDate(photo.cdate) && (!cdate || !_.isEqual(new Date(cdate), photo.cdate))) {
        throw { message: msg.changed, changed: true };
    }

    return { photo, canModerate };
};

/**
 * Сохраняем объект фотографии с подъемом времени просмотра пользователем объекта
 * @param [stamp] Принудительно устанавливает время просмотра
 */
async function update({ photo, stamp }) {
    const { handshake: { usObj: iAm } } = this;

    const [, rel] = await* [
        photo.save(),
        userObjectRelController.setObjectView(photo._id, iAm.user._id, 'photo', stamp)
    ];

    return { photo, rel };
};

// Change amount of photos of user
function userPCountUpdate(user, newDelta = 0, publicDelta = 0, inactiveDelta = 0) {
    const userId = user._id || user;
    const ownerObj = session.getOnline({ userId });

    if (ownerObj) {
        ownerObj.user.pfcount = ownerObj.user.pfcount + newDelta;
        ownerObj.user.pcount = ownerObj.user.pcount + publicDelta;
        ownerObj.user.pdcount = ownerObj.user.pdcount + inactiveDelta;
        return session.saveEmitUser({ usObj: ownerObj, wait: true });
    } else {
        return User.update({ _id: userId }, {
            $inc: {
                pfcount: newDelta || 0,
                pcount: publicDelta || 0,
                pdcount: inactiveDelta || 0
            }
        }).exec();
    }
};

const changePublicExternality = async function (photo, makePublic) {
    return await* [
        // Show or hide comments and recalculate it amount of users
        this.call('comment.changeObjCommentsVisibility', { obj: photo, hide: !makePublic }),
        // Recalculate number of photos of owner
        userPCountUpdate(photo.user, 0, makePublic ? 1 : -1, makePublic ? -1 : 1),
        // If photo has coordinates, means that need to do something with map
        Utils.geo.check(photo.geo) ? this.call(makePublic ? 'photo.photoToMap' : 'photo.photoFromMap', { photo }) : null
    ];
};

// Revoke own photo
async function revoke(data) {
    const { photo } = await this.call('photo.prefetchForEdit', { data, can: 'revoke' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REVOKE;
    photo.sdate = photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Compute amount of photos of user
    userPCountUpdate(photo.user, -1, 0, 1);

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate: false });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Say that photo is ready for premoderation
async function ready(data) {
    const { handshake: { usObj: iAm } } = this;
    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'ready' });
    const oldPhotoObj = photo.toObject();

    photoCheckPublickRequired(photo);

    photo.s = status.READY;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Save previous status to history
    await this.call('photo.saveHistory', {
        oldPhotoObj, photo, canModerate: User.isEqual(oldPhotoObj.user, iAm.user) ? false : canModerate
    });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Send a photo, awaiting publication, to the author for revision
async function toRevision(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw { message: msg.needReason };
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'revision' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REVISION;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Reject waiting photo by moderator/administrator
async function reject(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw { message: msg.needReason };
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'reject' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REJECT;
    photo.sdate = photo.stdate = photo.cdate = new Date(); // TODO: При возврате на доработку возвращать sdate +shift10y

    const { rel } = await this.call('photo.update', { photo });

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
        throw { message: msg.needReason };
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'rereject' });

    const oldPhotoObj = photo.toObject();

    photo.s = status.READY;
    photo.sdate = photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Recalculate the number of photos of the owner
    userPCountUpdate(photo.user, 1, 0, -1);

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Publication (confirmation) of a new photo
async function approve(data) {
    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'approve' });

    photoCheckPublickRequired(photo);

    const oldPhotoObj = photo.toObject();

    photo.s = status.PUBLIC;
    photo.stdate = photo.cdate = photo.adate = photo.sdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    await* [
        // Recalculate the number of photos of the owner
        userPCountUpdate(photo.user, -1, 1, 0),
        // Subscribe photo's owner to it and set to him stamp of comments view,
        // to correctly count the number of new comments until he'll enter the page next time
        this.call(
            'subscr.subscribeUserByIds',
            { user: photo.user, objId: photo._id, setCommentView: true, type: 'photo' }
        )
    ];

    // Add photo to map
    if (Utils.geo.check(photo.geo)) {
        await this.call('photo.photoToMap', { photo });
    }

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Activation/deactivation of photo
async function activateDeactivate(data) {
    const { reason, disable } = data;

    if (disable && _.isEmpty(reason)) {
        throw { message: msg.needReason };
    }

    const { photo, canModerate } = await this.call(
        'photo.prefetchForEdit', { data, can: disable ? 'deactivate' : 'activate' }
    );

    if (!disable) {
        photoCheckPublickRequired(photo);
    }

    const oldPhotoObj = photo.toObject();

    photo.s = status[disable ? 'DEACTIVATE' : 'PUBLIC'];
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    await this.call('photo.changePublicExternality', { photo, makePublic: !disable });

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason: disable && reason });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Remove from 'incoming' directory uploaded but not created photo
const removeIncoming = function ({ file }) {
    const { handshake: { usObj: iAm } } = this;

    if (!file) {
        throw { message: msg.badParams };
    }
    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    return fs.unlinkAsync(path.join(incomeDir, file));
};

// Photo removal
async function remove(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw { message: msg.needReason };
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'remove' });
    const oldPhotoObj = photo.toObject();

    photo.s = status.REMOVE;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    // Unsubscribe all users from this photo
    await this.call('subscr.unSubscribeObj', { objId: photo._id });

    if (oldPhotoObj.s === status.PUBLIC) {
        await this.call('photo.changePublicExternality', { photo, makePublic: false });
    }

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Restore removed photo
async function restore(data) {
    const { reason } = data;

    if (_.isEmpty(reason)) {
        throw { message: msg.needReason };
    }

    const { photo, canModerate } = await this.call('photo.prefetchForEdit', { data, can: 'restore' });

    photoCheckPublickRequired(photo);

    const oldPhotoObj = photo.toObject();

    photo.s = status.PUBLIC;
    photo.stdate = photo.cdate = new Date();

    const { rel } = await this.call('photo.update', { photo });

    // Save previous status to history
    await this.call('photo.saveHistory', { oldPhotoObj, photo, canModerate, reason });

    await this.call('photo.changePublicExternality', { photo, makePublic: true });

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel });
};

// Give photo for its page
export async function giveForPage({ cid, forEdit }) {
    cid = Number(cid);

    if (!cid || cid < 1) {
        throw ({ message: msg.badParams });
    }

    const { photo, can } = await this.call('photo.give', { cid, fullView: true, countView: !forEdit, forEdit });

    return { photo, can, forEdit: !!photo.user.settings };
};

async function givePrevNextCids({ cid }) {
    const [prev, next] = await* [
        Photo.findOne({ cid: { $lt: cid }, s: 5 }, { _id: 0, cid: 1 }, { lean: true }).sort({ cid: -1 }).exec(),
        Photo.findOne({ cid: { $gt: cid }, s: 5 }, { _id: 0, cid: 1 }, { lean: true }).sort({ cid: 1 }).exec()
    ];

    return { prev: prev && prev.cid, next: next && next.cid };
};

/**
 * Return full gallery based of user's rights and filters in compact view
 * @param filter Filter object (parsed)
 * @param userId _id of user, if we need gallery by user
 */
async function givePhotos({ filter, options: { skip = 0, limit = 40 }, userId }) {
    const { handshake: { usObj: iAm } } = this;

    skip = Math.abs(Number(skip)) || 0;
    limit = Math.min(Math.abs(Number(limit)), 100) || 40;

    const buildQueryResult = buildPhotosQuery(filter, userId, iAm);
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

        // To calculate new comments we need '_id', for checking of changes - 'ucdate'
        const fieldsSelect = iAm.registered ? compactFieldsForRegWithRegions : compactFieldsWithRegions;

        [photos, count] = await* [
            Photo.find(query, fieldsSelect, { lean: true, skip, limit, sort: { sdate: -1 } }).exec(),
            Photo.count(query).exec()
        ];

        // If user is logged, fill amount of new comments for each object
        if (iAm.registered && photos.length) {
            await userObjectRelController.fillObjectByRels(photos, iAm.user._id, 'photo');
        }

        if (photos.length) {
            if (iAm.registered) {
                for (const photo of photos) {
                    delete photo._id;
                    delete photo.vdate;
                    delete photo.ucdate;
                }
            }

            // For each photo fill short regions and hash of this regions
            const shortRegionsParams = regionController.getShortRegionsParams(buildQueryResult.rhash);
            shortRegionsHash = regionController.genObjsShortRegionsArr(photos, shortRegionsParams.lvls, true);
        }
    }

    return {
        skip, count, photos, rhash: shortRegionsHash,
        filter: { r: buildQueryResult.rarr, rp: filter.rp, s: buildQueryResult.s, geo: filter.geo }
    };
};

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

const filterProps = { geo: [], r: [], rp: [], s: [] };
const delimeterParam = '_';
const delimeterVal = '!';
export function parseFilter(filterString) {
    const filterParams = filterString && filterString.split(delimeterParam);
    const result = {};
    let filterParam;
    let filterVal;
    let filterValItem;

    if (!filterParams) {
        return result;
    }

    for (filterParam of filterParams) {
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
                    if (Array.isArray(filterVal) && filterVal.length) {
                        result.r = [];
                        for (filterValItem of filterVal) {
                            if (filterValItem) {
                                result.r.unshift(filterValItem);
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
                if (Array.isArray(filterVal) && filterVal.length) {
                    result.rp = [];
                    for (filterValItem of filterVal.length) {
                        if (filterValItem) {
                            result.rp.unshift(filterValItem);
                        }
                    }
                    if (!result.rp.length) {
                        delete result.rp;
                    }
                }
            } else if (filterParam === 's') {
                filterVal = filterVal.split(delimeterVal);
                if (Array.isArray(filterVal) && filterVal.length) {
                    result.s = [];
                    for (filterValItem of filterVal) {
                        if (filterValItem) {
                            filterValItem = Number(filterValItem);
                            if (!isNaN(filterValItem)) { // 0 must be included, that is why check for NaN
                                result.s.unshift(filterValItem);
                            }
                        }
                    }
                    if (!result.s.length) {
                        delete result.s;
                    }
                }
            } else if (filterParam === 'geo') {
                filterVal = filterVal.split(delimeterVal);
                if (Array.isArray(filterVal) && filterVal.length === 1) {
                    result.geo = filterVal;
                }
            }
        }
    }

    return result;
}

// Return general gallery
function givePS(options) {
    const filter = options.filter ? parseFilter(options.filter) : {};

    if (!filter.s) {
        filter.s = [status.PUBLIC];
    }

    return this.call('photo.givePhotos', { filter, options });
};

// Returns user's gallery
async function giveUserGallery({ login, filter, skip, limit }) {
    if (!login) {
        throw { message: msg.badParams };
    }

    const { handshake: { usObj: iAm } } = this;
    const userId = await User.getUserID(login);

    if (!userId) {
        throw { message: msg.noUser };
    }

    filter = filter ? parseFilter(filter) : {};

    // If regions filter is not set, this is another's gallery, current user has own regions and
    // exists setting not filter gallery by own regions, then set whole world
    if (filter.r === undefined && iAm.registered && iAm.user.login !== login &&
        iAm.user.regions && iAm.user.regions.length && iAm.user.settings && !iAm.user.settings.r_f_user_gal) {
        filter.r = 0;
    }

    return this.call('photo.givePhotos', { filter, options: { skip, limit }, userId });
};

// Returns last photos for approve
async function giveForApprove(data) {
    const { handshake: { usObj: iAm } } = this;
    const query = { s: status.READY };

    if (!iAm.registered || iAm.user.role < 5) {
        throw { message: msg.deny };
    }
    if (iAm.isModerator) {
        _.assign(query, iAm.mod_rquery);
    }

    const photos = await Photo.find(query, compactFieldsWithRegions, {
        lean: true,
        sort: { sdate: -1 },
        skip: data.skip || 0,
        limit: Math.min(data.limit || 20, 100)
    }).exec();

    const shortRegionsHash = regionController.genObjsShortRegionsArr(photos, iAm.mod_rshortlvls, true);

    return { photos, rhash: shortRegionsHash };
};

// Returns array before and after specified photo (with specified length)
async function giveUserPhotosAround({ cid, limitL, limitR }) {
    const { handshake: { usObj: iAm } } = this;

    cid = Number(cid);
    limitL = Math.min(Math.abs(Number(limitL)), 100);
    limitR = Math.min(Math.abs(Number(limitR)), 100);

    if (!cid || (!limitL && !limitR)) {
        throw { message: msg.badParams };
    }

    const photo = await this.call('photo.find', { query: cid });

    const filter = iAm.registered && iAm.user.settings && !iAm.user.settings.r_f_photo_user_gal ? { r: 0 } : {};
    const query = buildPhotosQuery(filter, photo.user, iAm).query;
    const promises = new Array(2);

    query.user = photo.user;

    if (limitL) {
        query.sdate = { $gt: photo.sdate };
        promises[0] = Photo.find(query, compactFields, { lean: true, sort: { sdate: 1 }, limit: limitL }).exec();
    }

    if (limitR) {
        query.sdate = { $lt: photo.sdate };
        promises[1] = Photo.find(query, compactFields, { lean: true, sort: { sdate: -1 }, limit: limitR }).exec();
    }

    const [left = [], right = []] = await* promises;

    return { left, right };
};

// Returns array of nearest photos
async function giveNearestPhotos({ geo, except, distance, limit, skip }) {
    if (!Utils.geo.checkLatLng(geo)) {
        throw { message: msg.badParams };
    }

    geo.reverse();

    const query = { geo: { $near: geo }, s: status.PUBLIC };
    const options = { lean: true };

    if (_.isNumber(except) && except > 0) {
        query.cid = { $ne: except };
    }

    if (_.isNumber(distance) && distance > 0 && distance < 100000) {
        query.geo.$maxDistance = distance;
    } else {
        query.geo.$maxDistance = 2000;
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
};

// Returns not public photos of user
async function giveUserPhotosPrivate({ login, startTime, endTime }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered || (iAm.user.role < 5 && iAm.user.login !== login)) {
        throw { message: msg.deny };
    }

    const userId = await User.getUserID(login);

    if (!userId) {
        throw { message: msg.noUser };
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
};

// Returns new photos
async function giveFresh({ login, after, skip, limit }) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.registered ||
        (!login && iAm.user.role < 5) ||
        (login && iAm.user.role < 5 && iAm.user.login !== login)) {
        throw { message: msg.deny };
    }

    const userId = login ? await User.getUserID(login) : null;

    const query = { s: status.NEW };
    const asModerator = iAm.user.login !== login && iAm.isModerator;

    if (asModerator) {
        _.assign(query, iAm.mod_rquery);
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
};

// Return 'can' object for photo
async function giveCan({ cid }) {
    const { handshake: { usObj: iAm } } = this;

    cid = Number(cid);

    if (!cid) {
        throw { message: msg.noPhoto };
    }

    // Need to get can for anonymous too, but there is nothing to check with owner in this case, so do not populate him
    const photo = await this.call('photo.find', { query: { cid }, populateUser: iAm.registered ? true : false });

    return { can: permissions.getCan(photo, iAm) };
};

function photoCheckPublickRequired(photo) {
    if (!photo.r0) {
        throw { message: msg.mustCoord };
    }

    if (_.isEmpty(photo.title)) {
        throw { message: 'Необходимо заполнить название фотографии' };
    }

    if (!_.isNumber(photo.year) || !_.isNumber(photo.year2) ||
        photo.year < 1826 || photo.year > 2000 || photo.year2 < photo.year && photo.year2 > 2000) {
        throw {
            message: 'Опубликованные фотографии должны иметь предполагаемую датировку в интервале 1826—2000гг.'
        };
    }

    return true;
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

    if (_.isNumber(newValues.region) && newValues.region > 0) {
        result.region = newValues.region;
    } else if (newValues.region === null) {
        result.region = undefined;
    }

    // Both year fields must be felled and 1826-2000
    if (_.isNumber(newValues.year) && _.isNumber(newValues.year2) &&
        newValues.year >= 1826 && newValues.year <= 2000 &&
        newValues.year2 >= newValues.year && newValues.year2 <= 2000) {
        result.year = newValues.year;
        result.year2 = newValues.year2;
    } else if (newValues.year === null) {
        result.year = undefined;
        result.year2 = undefined;
    }

    if (_.isString(newValues.dir) && newValues.dir.length) {
        result.dir = newValues.dir.trim();
    } else if (newValues.dir === null) {
        result.dir = undefined;
    }

    // Trim and remove last dot in title, if it is not part of ellipsis
    if (_.isString(newValues.title) && newValues.title.length) {
        result.title = newValues.title.trim().substr(0, 120).replace(/([^\.])\.$/, '$1');
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
};

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
            'geo', 'year', 'year2', 'dir', 'title', 'address', 'desc', 'source', 'author',
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
                throw { message: msg.noRegion };
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

    // If photo is public, check that all required fields is filled
    if (photo.s === status.READY || photo.s === status.PUBLIC) {
        photoCheckPublickRequired(photo);
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

    if (photo.s === status.PUBLIC) {
        if (geoToNull) {
            // If coordinates has been nullified and photo is public, means it was on map, and we should remove it from map.
            // We must do it before coordinates removal, because clusterization looks on it
            await this.call('photo.photoFromMap', { photo: oldPhotoObj });

        } else if (!_.isEmpty(photo.geo)) {
            // Old values of changing properties
            const oldValues = _.transform(newValues, (result, val, key) => {
                result[key] = oldPhotoObj[key];
            }, {});

            if (newGeo || !_.isEmpty(_.pick(oldValues, 'dir', 'title', 'year', 'year2'))) {
                // If coordinates have been added/changed or cluster's poster might be changed, then recalculate map.
                // Coordinates must be get exactly from 'photo.geo', not from 'newGeo',
                // because 'newGeo' can be 'undefined' and this case could mean, that coordinates haven't been changed,
                // but data for poster might have been changed
                await this.call('photo.photoToMap', { photo, geoPhotoOld: oldGeo, yearPhotoOld: oldPhotoObj.year });
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
            model: Comment, criteria: { obj: photo._id }, regions: newRegions, additionalUpdate: commentAdditionUpdate
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

    // Reselect the data to display
    return this.call('photo.give', { cid: photo.cid, rel }).then(result => ({ reconvert, ...result }));
};

// Фотографии и кластеры по границам
// {z: Масштаб, bounds: [[]]}
function getByBounds(data) {
    const { bounds, z, startAt } = data;

    if (!Array.isArray(bounds) || !_.isNumber(z) || z < 1) {
        throw { message: msg.badParams };
    }

    // Reverse bound's borders
    for (const bound of bounds) {
        bound[0].reverse();
        bound[1].reverse();
    }

    return this.call('photo.getBounds', data).then(result => ({ startAt, z, ...result}));
};

// Sends selected photos for convert (By admin, whom pressed reconvert button on photo page)
var convert = Bluebird.method(function (data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!Array.isArray(data) || !data.length) {
        throw { message: msg.badParams };
    }

    var cids = [];

    for (var i = 0; i < data.length; i++) {
        data[i].cid = Number(data[i].cid);
        if (data[i].cid > 0) {
            cids.push(data[i].cid);
        }
    }
    if (!cids.length) {
        throw { message: msg.badParams };
    }

    return Photo
        .find({ cid: { $in: cids } }, { cid: 1, user: 1, watersignOption: 1, watersignCustom: 1 }, { lean: true })
        .populate({ path: 'user', select: { _id: 0, login: 1, watersignCustom: 1, settings: 1 } })
        .exec()
        .then(function (photos) {
            var converterData = photos.map(function (photo) {
                return { cid: photo.cid, watersign: getUserWaterSign(photo.user, photo) };
            });

            if (converterData.length) {
                Photo.update({ cid: { $in: cids } }, { $set: { convqueue: true } }, { multi: true }).exec();
            }

            return converter.addPhotos(converterData, 3);
        });
});

// Sends all photo for convert
var convertAll = Bluebird.method(function (data) {
    const { handshake: { usObj: iAm } } = this;

    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!_.isObject(data)) {
        throw { message: msg.badParams };
    }

    var params = { priority: 4 };
    var region;

    if (_.isNumber(data.min) && data.min > 0) {
        params.min = data.min;
    }
    if (_.isNumber(data.max) && data.max > 0 && (!params.min || data.max >= params.min)) {
        params.max = data.max;
    }
    if (_.isNumber(data.r) && data.r > 0) {
        region = regionController.getRegionFromCache(data.r);
        if (region) {
            params.region = { level: _.size(region.parents), cid: region.cid };
        }
    }

    return converter.addPhotosAll(params);
});

// Sends user's photo for convert
var usersWhoConvertingNonIndividualPhotos = {};
var convertByUser = Bluebird.method(function (data = {}) {
    const { handshake: { usObj: iAm } } = this;

    if (!data.login) {
        throw { message: msg.badParams };
    }
    if (!iAm.registered || iAm.user.login !== data.login && !iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (usersWhoConvertingNonIndividualPhotos[data.login]) {
        throw { message: 'Вы уже отправили запрос и он еще выполняется. Попробуйте позже' };
    }

    var stampStart = new Date();
    var region;
    if (_.isNumber(data.r) && data.r > 0) {
        region = regionController.getRegionFromCache(data.r);

        if (region) {
            region = { level: _.size(region.parents), cid: region.cid };
        }
    }

    var historyCalls = [];

    return User.findOne({ login: data.login }, { login: 1, watersignCustom: 1, settings: 1 }, { lean: true }).exec()
        .bind({})
        .then(function (user) {
            if (!user) {
                throw { message: msg.noUser };
            }

            usersWhoConvertingNonIndividualPhotos[data.login] = true;
            logger.info('Starting sending to convert ' + (data.resetIndividual ? '' : 'non ') + 'individual photos of user %s %s %s', user.login, region ? 'in region ' + region.cid : '', 'Invoked by ' + iAm.user.login);

            this.query = { user: user._id };

            if (region) {
                this.query['r' + region.level] = region.cid;
            }

            if (data.resetIndividual) {
                this.query.watersignIndividual = true;
            } else {
                this.query.$or = [{ watersignIndividual: null }, { watersignIndividual: false }];
            }

            this.user = user;

            return Photo.findAsync(this.query, {
                _id: 0,
                cid: 1,
                s: 1,
                user: 1,
                ldate: 1,
                cdate: 1,
                ucdate: 1,
                watersignText: 1
            }, { lean: true, sort: { sdate: -1 } });
        })
        .then(function (photos) {

            if (_.isEmpty(photos)) {
                return { added: 0, time: 0 };
            }

            var photo;
            var photoOld;
            var canModerate;
            var stamp = new Date();
            var count = photos.length;
            var itsMe = this.user.login === iAm.user.login;
            var watersignText = getUserWaterSign(this.user);

            this.count = count;

            for (var i = 0; i < photos.length; i++) {
                photoOld = photos[i];

                if (photoOld.s === status.NEW || watersignText === photoOld.watersignText) {
                    // New photo has no history yet, so don't need to write history row about watersign
                    // If watersignText did not really changed, do not save history, only reconvert
                    continue;
                }

                photo = _.clone(photoOld);
                photo.cdate = stamp;
                photo.watersignText = watersignText;

                if (data.resetIndividual) {
                    photo.watersignIndividual = undefined;
                }

                canModerate = itsMe ? null : permissions.canModerate(photoOld, iAm);

                if (!itsMe && !canModerate) {
                    // If at least for one photo user have no rights, deny whole operation
                    photos = null;
                    throw { message: msg.deny };
                }

                historyCalls.push([iAm, photoOld, photo, itsMe ? false : canModerate]);
            }

            var update = { $set: {}, $unset: { watersignTextApplied: 1 } };

            if (data.resetIndividual) {
                update.$unset.watersignIndividual = 1;
            }

            // New photos don't have to update cdate and ucdate
            var updateNew = _.cloneDeep(update);
            var queryNew = _.clone(this.query);
            queryNew.s = status.NEW;

            this.query.s = { $ne: status.NEW };
            update.$set.cdate = stamp;

            if (watersignText) {
                update.$set.watersignText = updateNew.$set.watersignText = watersignText;
            } else {
                update.$unset.watersignText = updateNew.$unset.watersignText = 1;
            }

            if (_.isEmpty(updateNew.$set)) {
                delete updateNew.$set;
            }

            photos = null;

            return Bluebird.join(
                Photo.updateAsync(this.query, update, { multi: true }),
                Photo.updateAsync(queryNew, updateNew, { multi: true }),
                Bluebird.all(historyCalls.map(function (hist) {
                    return savePhotoHistory.apply(undefined, hist);
                }))
                )
                .then(function () {
                    return converter.addPhotosAll({
                        login: data.login,
                        priority: 2,
                        region: region,
                        onlyWithoutTextApplied: true
                    });
                })
                .then(function (conveyorResult) {
                    return {
                        updated: count,
                        conveyorAdded: conveyorResult.conveyorAdded,
                        time: Date.now() - stampStart
                    };
                });
        })
        .finally(function () {
            delete usersWhoConvertingNonIndividualPhotos[data.login];
            historyCalls = null;
            logger.info('Finish in %ds sending to convert %d ' + (data.resetIndividual ? '' : 'non ') + 'individual photos of user %s %s. %s', (Date.now() - stampStart) / 1000, this.count, data.login, region ? 'in region ' + region.cid : '', 'Invoked by ' + iAm.user.login);
        });
});

var resetIndividualDownloadOrigin = Bluebird.method(function (data) {
    const { handshake: { usObj: iAm } } = this;

    if (!data.login) {
        throw { message: msg.badParams };
    }
    if (!iAm.registered || iAm.user.login !== data.login && !iAm.isAdmin) {
        throw { message: msg.deny };
    }

    var stampStart = new Date();
    var region;
    if (_.isNumber(data.r) && data.r > 0) {
        region = regionController.getRegionFromCache(data.r);

        if (region) {
            region = { level: _.size(region.parents), cid: region.cid };
        }
    }

    return User.findOneAsync({ login: data.login }, { login: 1, settings: 1 }, { lean: true })
        .bind({})
        .then(function (user) {
            if (!user) {
                throw { message: msg.noUser };
            }

            var query = { user: user._id, disallowDownloadOriginIndividual: true };

            if (region) {
                query['r' + region.level] = region.cid;
            }

            return Photo.updateAsync(query, { $unset: { disallowDownloadOriginIndividual: 1 } }, { multi: true });
        })
        .spread(function (updated) {
            var spent = Date.now() - stampStart;

            logger.info(
                'Resetting individual download setting in %d photos has finished in %ds of user %s %s. %s', updated,
                spent / 1000, data.login, region ? 'in region ' + region.cid : '', 'Invoked by ' + iAm.user.login
            );

            return { updated: updated, time: spent };
        });
});

/**
 * Строим параметры запроса (query) для запроса фотографий с фильтром с учетом прав на статусы и регионы
 * @param filter
 * @param forUserId
 * @param iAm Объект пользователя сессии
 */
export function buildPhotosQuery(filter, forUserId, iAm) {
    var query, //Результирующий запрос
        query_pub, //Запрос в рамках публичных регионов
        query_mod, //Запрос в рамках модерируемых регионов
        rquery_pub,
        rquery_mod,

        regions_cids = [],
        regions_arr = [],
        regions_arr_all = [],//Массив объектов регионов, включая неактивные (phantom в фильтре)
        regions_hash = {},

        squery_public_have = !filter.s || !filter.s.length || filter.s.includes(5),
        squery_public_only = !iAm.registered || filter.s && filter.s.length === 1 && filter.s[0] === status.PUBLIC,

        region,
        contained,
        result = { query: null, s: [], rcids: [], rarr: [] },

        someVar,
        i,
        j;

    if (!squery_public_only && filter.s && filter.s.length) {
        //Если есть публичный, убираем, так как непубличный squery будет использован только в rquery_mod
        filter.s = _.without(filter.s, status.PUBLIC, !iAm.isAdmin ? status.REMOVE : undefined);
    }

    if (Array.isArray(filter.r) && filter.r.length) {
        regions_arr_all = regionController.getRegionsArrFromCache(filter.r);

        if (Array.isArray(filter.rp) && filter.rp.length) {
            //Если есть массив неактивных (phantom) регионов фильтра, берем разницу
            regions_cids = _.difference(filter.r, filter.rp);
            regions_arr = regionController.getRegionsArrFromCache(regions_cids);
        } else {
            regions_cids = filter.r;
            regions_arr = regions_arr_all;
        }

        someVar = regionController.buildQuery(regions_arr);
        rquery_pub = rquery_mod = someVar.rquery;
        regions_hash = someVar.rhash;
    } else if (filter.r === undefined && iAm.registered && iAm.user.regions.length && (!forUserId || !forUserId.equals(iAm.user._id))) {
        regions_hash = iAm.rhash;
        regions_cids = _.pluck(iAm.user.regions, 'cid');
        regions_arr = regions_arr_all = regionController.getRegionsArrFromHash(regions_hash, regions_cids);
    }
    if (regions_cids.length) {
        regions_cids = regions_cids.map(Number);
    }

    if (squery_public_only) {
        query_pub = {};  //Анонимам или при фильтрации для публичных отдаем только публичные

        if (filter.r === undefined && iAm.registered && iAm.user.regions.length) {
            rquery_pub = iAm.rquery; //Если фильтр не указан - отдаем по собственным регионам
        }
    } else if (forUserId && forUserId.equals(iAm.user._id)) {
        //Собственную галерею отдаем без удаленных(не админам) и без регионов в настройках, только по filter.r
        query_mod = {};
    } else {
        if (filter.r === undefined && iAm.user.regions.length) {
            rquery_pub = rquery_mod = iAm.rquery; //Если фильтр не указан - отдаем по собственным регионам
        }

        if (iAm.isAdmin) {
            //Админам отдаем все статусы
            query_mod = {};
        } else if (!iAm.user.role || iAm.user.role < 5) {
            //Ниже чем модераторам региона отдаем только публичные
            query_pub = {};
        } else if (iAm.isModerator) {
            //Региональным модераторам отдаем в своих регионах без удаленных, в остальных - только публичные

            if (!iAm.user.mod_regions.length || iAm.mod_regions_equals) {
                //Глобальным модераторам и региональным, у которых совпадают регионы модерирования с собственными,
                //(т.е. область модерирования включает в себя пользовательскую)
                //отдаем пользовательскую область как модерируемую
                query_mod = {};
            } else if (filter.r === 0 || !iAm.user.regions.length) {
                //Если запрашиваются все пользовательские регионы (т.е. весь мир),
                //то делаем глобальный запрос по публичным, а со статусами по модерируемым
                query_pub = {};
                query_mod = {};
                rquery_mod = iAm.mod_rquery;
            } else {
                //В случае, когда массив пользовательских и модерируемых регионов различается,
                //"вычитаем" публичные из модерируемых, получая два новых чистых массива

                var regions_pub = [], //Чистый массив публичных регионов
                    regions_mod = []; //Чистый массив модерируемых регионов

                //Если сам пользовательский регион или один из его родителей является модерируемым,
                //то включаем его в массив модерируемых
                for (i = regions_arr.length; i--;) {
                    region = regions_arr[i];
                    contained = false;

                    if (iAm.mod_rhash[region.cid]) {
                        contained = true;
                    } else if (region.parents) {
                        for (j = region.parents.length; j--;) {
                            if (iAm.mod_rhash[region.parents[j]]) {
                                contained = true;
                                break;
                            }
                        }
                    }
                    if (contained) {
                        regions_mod.push(region);
                    } else {
                        regions_pub.push(region);
                    }
                }

                //Если один из модерируемых регионов является дочерним какому-либо пользовательскому региону,
                //то включаем такой модерируемый регион в массив модерируемых,
                //несмотря на то, что родительский лежит в массиве публичных
                for (i = iAm.user.mod_regions.length; i--;) {
                    region = iAm.mod_rhash[iAm.user.mod_regions[i].cid];
                    if (region.parents) {
                        for (j = region.parents.length; j--;) {
                            if (regions_hash[region.parents[j]]) {
                                regions_mod.push(region);
                            }
                        }
                    }
                }

                if (regions_pub.length) {
                    query_pub = {};
                    someVar = regionController.buildQuery(regions_pub);
                    rquery_pub = someVar.rquery;
                }
                if (regions_mod.length) {
                    query_mod = {};
                    someVar = regionController.buildQuery(regions_mod);
                    rquery_mod = someVar.rquery;
                }
            }
        }
    }

    if (query_pub && squery_public_have) {
        query_pub.s = status.PUBLIC;
        if (rquery_pub) {
            _.assign(query_pub, rquery_pub);
        }
        result.s.push(status.PUBLIC);
    }
    if (!squery_public_have) {
        //Если указан фильтр и в нем нет публичных, удаляем запрос по ним
        query_pub = undefined;
    }
    if (query_mod) {
        if (filter.s && filter.s.length) {
            if (!query_pub && squery_public_have) {
                //Если запроса по публичным нет, но должен, то добавляем публичные в модерируемые
                //Это произойдет с админами и глобальными модераторами, так как у них один query_mod
                filter.s.push(status.PUBLIC);
            }
            if (filter.s.length === 1) {
                query_mod.s = filter.s[0];
            } else {
                query_mod.s = { $in: filter.s };
            }
            Array.prototype.push.apply(result.s, filter.s);
        } else if (!iAm.isAdmin) {
            query_mod.s = { $ne: status.REMOVE };
        }

        if (rquery_mod) {
            _.assign(query_mod, rquery_mod);
        }
    }

    if (query_pub && query_mod) {
        query = {
            $or: [
                query_pub,
                query_mod
            ]
        };
    } else {
        query = query_pub || query_mod;
    }

    if (query) {
        result.query = query;
        result.rcids = regions_cids;
        result.rhash = regions_hash;
        result.rarr = regions_arr_all;
    }

    //console.log(JSON.stringify(query));
    return result;
}

// Обнуляет статистику просмотров за день и неделю
const planResetDisplayStat = (function () {
    function resetStat() {
        var setQuery = { vdcount: 0 },
            needWeek = moment.utc().day() === 1; // Начало недели - понедельник

        if (needWeek) {
            setQuery.vwcount = 0;
        }
        Photo.update({ s: { $in: [status.PUBLIC, status.DEACTIVATE, status.REMOVE] } }, { $set: setQuery }, { multi: true }, function (err, count) {
            planResetDisplayStat();
            if (err) {
                return logger.error(err);
            }
            logger.info('Reset day' + (needWeek ? ' and week ' : ' ') + 'display statistics for %s photos', count.n);
        });
    }

    return function () {
        setTimeout(resetStat, moment.utc().add(1, 'd').startOf('day').diff(moment.utc()) + 2000);
    };
}());

/**
 * Возвращает историю редактирования объекта (фотографии)
 * @param iAm Объект пользователя сессии
 * @param data Объект
 */
var giveObjHist = Bluebird.method(function (data = {}) {
    if (!Number(data.cid) || !Number(data.fetchId)) {
        throw { message: msg.badParams };
    }

    const { handshake: { usObj: iAm } } = this;
    var cid = Number(data.cid);
    var showDiff = !!data.showDiff;

    return this.call('photo.find', { query: { cid }, fieldSelect: { _id: 0 } })
        .bind({})
        .then(function (photo) {
            var historySelect = { _id: 0, cid: 0 };

            if (!showDiff) {
                historySelect.diff = 0;
            }

            return Bluebird.join(
                User.findOneAsync({ _id: photo.user }, { _id: 0, login: 1, avatar: 1, disp: 1 }, { lean: true }),
                PhotoHistory
                    .find({ cid }, historySelect, { lean: true, sort: { stamp: 1 } })
                    .populate({ path: 'user', select: { _id: 0, login: 1, avatar: 1, disp: 1 } })
                    .execAsync()
            );
        })
        .spread(function (photoUser, histories) {
            if (_.isEmpty(histories)) {
                throw { message: 'Для объекта еще нет истории' };
            }
            var haveDiff;

            var regions = {};
            var reasons = {};
            var result = [];
            var history;
            var values;
            var del;
            var i;
            var j;

            for (i = 0; i < histories.length; i++) {
                history = histories[i];

                if (!history.user || !history.stamp) {
                    logger.warn('Object %d has corrupted %dth history entry', cid, i);
                    continue;
                }

                values = history.values;

                // Если это первая запись с пустыми значениям - пропускаем
                if (i === 0 && _.isEmpty(values)) {
                    continue;
                }

                if (values) {
                    // Если выбран режим показа разницы и в этой записи она есть, присваиваем значения из разницы
                    if (history.diff) {
                        haveDiff = true;
                        for (j in history.diff) {
                            values[j] = history.diff[j];
                        }
                        delete history.diff;
                    }

                    if (values.geo) {
                        values.geo.reverse();
                    }

                    // Если в этой записи измененись регионы, добавляем каждый из них в хэш для последующей выборки
                    if (values.regions) {
                        for (j = values.regions.length; j--;) {
                            regions[values.regions[j]] = 1;
                        }
                    }
                }

                // Убираем из удаленных поля year, т.к. будет выведено поле y
                if (!_.isEmpty(history.del)) {
                    del = history.del;
                    history.del = [];
                    for (j = 0; j < del.length; j++) {
                        if (del[j] !== 'year' && del[j] !== 'year2') {
                            history.del.push(del[j]);
                        }
                    }
                    if (!history.del.length) {
                        delete history.del;
                    }
                }

                if (history.roleregion) {
                    regions[history.roleregion] = 1;
                }

                // Если в этой записи есть причина (не нулевая/свободная), добавляем её в хэш для последующей выборки
                if (!_.isEmpty(history.reason) && history.reason.cid) {
                    reasons[history.reason.cid] = 1;
                }

                history.stamp = history.stamp.getTime();

                result.push(history);
            }

            result = { hists: result, fetchId: data.fetchId, haveDiff: haveDiff };

            // Если есть регионы, запрашиваем их объекты
            if (Object.keys(regions).length) {
                result.regions = regionController.fillRegionsHash(regions, ['cid', 'title_local']);
            }

            // Если есть причины, запрашиваем их заголовки
            reasons = Object.keys(reasons);
            if (reasons.length) {
                result.reasons = getReasonHashFromCache(reasons);
            }

            return result;
        });
});

var getDownloadKey = Bluebird.method(function (data = {}) {
    const { handshake: { usObj: iAm } } = this;

    var cid = Number(data.cid);

    if (!iAm.registered) {
        throw { message: msg.deny };
    }

    if (!cid) {
        throw { message: msg.noPhoto };
    }

    return this.call('photo.find', { query: { cid }, options: { lean: true }, populateUser: true })
        .bind({})
        .then(function (photo) {
            var canDownload = permissions.getCan(photo, iAm).download;

            if (canDownload === 'login') {
                throw { message: msg.deny };
            }

            this.origin = canDownload === true || canDownload === 'byrole';

            var key = Utils.randomString(32);
            var path = (this.origin ? 'private/photos/' : 'public/photos/a/') + photo.file;
            var fileName = photo.cid + ' ' + (photo.title || '').replace(/[\/|]/g, '-') + '.jpg';
            // We keep only size of origin file, size with watermark must be calculated by downloader.js
            var size = this.origin ? photo.size : null;

            return new Download({
                key,
                data: {
                    fileName, path, size, type: 'image/jpeg',
                    login: iAm.user.login, cid: photo.cid, origin: this.origin
                }
            }).saveAsync();
        })
        .spread(function (download) {
            return { key: download.key, origin: this.origin || undefined };
        });

    return {};
});

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
    changePublicExternality
};

waitDb.then(planResetDisplayStat); // Plan statistic clean up