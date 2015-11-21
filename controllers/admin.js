import _ from 'lodash';
import * as regionController from './region.js';
import * as sessionController from './_session';

import { News } from '../models/News';
import { User } from '../models/User';
import { Counter } from '../models/Counter';

const msg = {
    deny: 'You do not have permission for this action'
};

function saveOrCreateNews(iAm, data = {}) {
    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }
    if (!data.txt) {
        throw { message: 'Bad params' };
    }

    return data.cid ? saveNews(iAm, data) : createNews(iAm, data);
}

async function createNews(iAm, { pdate, tdate, title, notice, txt, nocomments }) {
    const count = await Counter.increment('news');

    const novel = new News({ cid: count.next, user: iAm.user, pdate, tdate, title, notice, txt });

    if (nocomments) {
        novel.nocomments = true;
    }

    await novel.save();

    return { news: novel };
}

async function saveNews(iAm, { cid, pdate, tdate, title, notice, txt, nocomments }) {
    const novel = await News.findOne({ cid }).exec();

    if (!novel) {
        throw { message: 'No such news' };
    }

    Object.assign(novel, { pdate, tdate, title, notice, txt, nocomments: Boolean(nocomments) || undefined });

    await novel.save();

    return { news: novel };
}

function getOnlineStat(iAm) {
    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    const usersCount = _.size(sessionController.usLogin);

    let sessUserCount = 0;
    let sessUserZeroSockCount = 0;
    let sessUserNoSockCount = 0;
    let sessAnonymCount = 0;
    let sessAnonymZeroSockCount = 0;
    let sessAnonymNoSockCount = 0;
    const sessNoSockHeaders = [];

    let sessWCUserCount = 0;
    let sessWCAnonymCount = 0;
    const sessWCNoSockHeaders = [];

    let socketUserCount = 0;
    let socketAnonymCount = 0;

    _.forOwn(sessionController.sessConnected, session => {
        const isReg = Boolean(session.user);
        const sockets = session.sockets;

        if (isReg) {
            sessUserCount++;
        } else {
            sessAnonymCount++;
        }

        if (sockets) {
            const count = _.size(sockets);

            if (isReg) {
                if (count) {
                    socketUserCount += count;
                } else {
                    sessUserZeroSockCount++;
                }
            } else {
                if (count) {
                    socketAnonymCount += count;
                } else {
                    sessAnonymZeroSockCount++;
                }
            }
        } else {
            if (isReg) {
                sessUserNoSockCount++;
            } else {
                sessAnonymNoSockCount++;
            }

            sessNoSockHeaders.push({ stamp: session.stamp, header: _.get(session, 'data.headers', {}) });
        }
    });

    _.forOwn(sessionController.sessWaitingConnect, session => {
        const isReg = Boolean(session.user);

        if (isReg) {
            sessWCUserCount++;
        } else {
            sessWCAnonymCount++;
        }

        sessWCNoSockHeaders.push({ stamp: session.stamp, header: _.get(session, 'data.headers', {}) });
    });

    return Promise.resolve({
        all: usersCount + sessAnonymCount,
        users: usersCount,

        sessUC: sessUserCount,
        sessUZC: sessUserZeroSockCount,
        sessUNC: sessUserNoSockCount,
        sessAC: sessAnonymCount,
        sessAZC: sessAnonymZeroSockCount,
        sessANC: sessAnonymNoSockCount,
        sessNCHeaders: sessNoSockHeaders,

        sessWCUC: sessWCUserCount,
        sessWCAC: sessWCAnonymCount,
        sessWCNCHeaders: sessWCNoSockHeaders,

        sockUC: socketUserCount,
        sockAC: socketAnonymCount,

        cusLogin: usersCount,
        cusId: _.size(sessionController.usId),
        cusSid: _.size(sessionController.usSid),
        csessConnected: _.size(sessionController.sessConnected),
        csessWaitingConnect: _.size(sessionController.sessWaitingConnect),
        csessWaitingSelect: _.size(sessionController.sessWaitingSelect)
    });
}

async function saveUserCredentials(iAm, { login, role, regions } = {}) {
    if (!iAm.isAdmin) {
        throw { message: msg.deny };
    }

    if (!login || !_.isNumber(role) || role < 0 || role > 11) {
        throw { message: msg.badParams };
    }

    const itsMe = iAm.user.login === login;

    if (itsMe && iAm.user.role !== role) {
        throw { message: 'Administrators can not change their role :)' };
    }

    const usObjOnline = sessionController.getOnline({ login });
    const user = usObjOnline ? usObjOnline.user :
        await User.findOne({ login }).populate('mod_regions', { _id: 0, cid: 1 }).exec();

    if (!user) {
        throw { message: msg.nouser };
    }

    if (!itsMe) {
        if (user.role < 11 && role === 11) {
            throw {
                message: 'The role of the super admin can not be assigned through the user management interface'
            };
        }
        if (iAm.user.role === 10 && user.role < 10 && role > 9) {
            throw { message: 'Only super administrators can assign other administrators' };
        }
    }

    if (role === 5 && regions) {
        const existsRegions = user.mod_regions.map(function (item) {
            return item.cid;
        });

        if (!_.isEqual(regions, existsRegions)) {
            await regionController.setUserRegions(login, regions, 'mod_regions');

            if (usObjOnline) {
                await sessionController.regetUser(usObjOnline);
            }
        }
    }

    if (user.role !== role) {
        user.role = role || undefined;

        if (role !== 5) {
            user.mod_regions = undefined;
        }
    }

    await user.save();

    if (usObjOnline) {
        sessionController.emitUser({ usObj: usObjOnline, wait: true });
    }

    return {};
}

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('saveNews', function (data) {
            saveOrCreateNews(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveNewsResult', resultData);
                });
        });

        socket.on('getOnlineStat', function () {
            getOnlineStat(hs.usObj)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('takeOnlineStat', resultData);
                });
        });
        socket.on('saveUserCredentials', function (data) {
            saveUserCredentials(hs.usObj, data)
                .catch(function (err) {
                    return { message: err.message, error: true };
                })
                .then(function (resultData) {
                    socket.emit('saveUserCredentialsResult', resultData);
                });
        });
    });

};