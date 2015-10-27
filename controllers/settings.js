import config from '../config';
import { waitDb } from './connection';
import { Settings } from '../models/Settings';
import { UserSettings } from '../models/UserSettings';

export const clientParams = {};
export const userSettingsDef = {};
export const userSettingsVars = {};
export const userRanksHash = {};
export let userRanks;

export const ready = waitDb.then(() => Promise.all([fillClientParams(), fillUserSettingsDef(), fillUserRanks()]));

const clientParamsPromise = Promise.resolve(clientParams);
const getClientParams = () => clientParamsPromise;

const userSettingsVarsPromise = Promise.resolve(userSettingsVars);
const getUserSettingsVars = () => userSettingsVarsPromise;

let userRanksPromise;
const getUserRanks = () => userRanksPromise;

// Fill object for client parameters
async function fillClientParams() {
    const settings = await Settings.find({}, { _id: 0, key: 1, val: 1 }, { lean: true }).exec();
    const { lang, client, hash } = config;

    Object.assign(clientParams, { lang, server: client, hash });

    for (const setting of settings) {
        clientParams[setting.key] = setting.val;
    }
}

// Fill object of default user settings
async function fillUserSettingsDef() {
    const settings = await UserSettings.findAsync(
        { key: { $ne: 'ranks' } },
        { _id: 0, key: 1, val: 1, vars: 1 }, { lean: true }
    );

    for (const setting of settings) {
        userSettingsDef[setting.key] = setting.val;
        userSettingsVars[setting.key] = setting.vars;
    }
}

// Fill object of user ranks
async function fillUserRanks() {
    const row = await UserSettings.findOneAsync({ key: 'ranks' }, { _id: 0, vars: 1 }, { lean: true });

    userRanks = row.vars;
    userRanksPromise = Promise.resolve(userRanks);

    for (const rank of userRanks) {
        userRanksHash[rank] = 1;
    }
}

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        socket.on('giveClientParams', function () {
            getClientParams()
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeClientParams', resultData);
                });
        });

        socket.on('giveUserSettingsVars', function () {
            getUserSettingsVars()
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserSettingsVars', resultData);
                });
        });

        socket.on('giveUserAllRanks', function () {
            getUserRanks()
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeUserAllRanks', resultData);
                });
        });
    });
}