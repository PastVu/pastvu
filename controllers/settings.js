import { Settings } from '../models/Settings';
import { UserSettings } from '../models/UserSettings';

export const clientParams = {};
export const userSettingsDef = {};
export const userSettingsVars = {};
export const userRanksHash = {};
export let userRanks;

// Fill object for client parameters
async function fillClientParams({ serverAddr, hash, version }) {
    const settings = await Settings.findAsync({}, { _id: 0, key: 1, val: 1 }, { lean: true });

    Object.assign(clientParams, {
        server: serverAddr,
        appHash: hash,
        appVersion: version
    });

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

    for (const rank of userRanks) {
        userRanksHash[rank] = 1;
    }
}

export async function fillData(app, io) {
    await* [fillClientParams(app.get('appEnv')), fillUserSettingsDef(), fillUserRanks()];

    io.sockets.on('connection', function (socket) {
        socket.on('giveClientParams', function () {
            socket.emit('takeClientParams', clientParams);
        });

        socket.on('giveUserSettingsVars', function () {
            socket.emit('takeUserSettingsVars', userSettingsVars);
        });

        socket.on('giveUserAllRanks', function () {
            socket.emit('takeUserAllRanks', userRanks);
        });
    });
}