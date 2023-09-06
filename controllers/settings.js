/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import config from '../config';
import { waitDb } from './connection';
import { Settings } from '../models/Settings';
import { UserSettings } from '../models/UserSettings';
import { Cluster } from '../models/Cluster';
import constants from './constants';
import { centerOfMass as turfCenter, points as turfPoints } from '@turf/turf';

export const clientParams = {};
export const userSettingsDef = {};
export const userSettingsVars = {};

export const ready = waitDb.then(() => Promise.all([fillClientParams(), fillUserSettingsDef()]));

const clientParamsPromise = Promise.resolve(clientParams);
const getClientParams = () => clientParamsPromise;

const userSettingsVarsPromise = Promise.resolve(userSettingsVars);
const getUserSettingsVars = () => userSettingsVarsPromise;

const getUserRanks = () => constants.user.ranks;

// Fill object for client parameters
async function fillClientParams() {
    const settings = await Settings.find({}, { _id: 0, key: 1, val: 1 }, { lean: true }).exec();
    const { lang, hash, publicApiKeys, analytics, version, docs, env } = config;

    // Calculate default map center from the clusters.
    const locDef = { lat: 27, lng: 24, z: 3 };
    const clusterPoints = await Cluster.find({ z: locDef.z }, { geo: 1 }, { lean: true }).exec();

    if (clusterPoints.length) {
        // Clusters centres are used to build convex hull polygon, its mass center is used as default map center.
        const center = turfCenter(turfPoints(clusterPoints.map(a => a.geo)));

        locDef.lng = center.geometry.coordinates[0];
        locDef.lat = center.geometry.coordinates[1];
    }

    Object.assign(clientParams, { lang, hash, publicApiKeys, analytics, version, docs, env, locDef });

    for (const setting of settings) {
        clientParams[setting.key] = setting.val;
    }
}

// Fill object of default user settings
async function fillUserSettingsDef() {
    const settings = await UserSettings.find({}, { _id: 0, key: 1, val: 1, vars: 1 }, { lean: true }).exec();

    for (const setting of settings) {
        userSettingsDef[setting.key] = setting.val;
        userSettingsVars[setting.key] = setting.vars;
    }
}

getClientParams.isPublic = true;
getUserSettingsVars.isPublic = true;
getUserRanks.isPublic = true;

export default {
    getClientParams,
    getUserSettingsVars,
    getUserRanks,
};
