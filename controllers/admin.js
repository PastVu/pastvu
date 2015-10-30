import _ from 'lodash';
import step from 'step';
import Utils from '../commons/Utils';
import * as session from './_session';
import * as regionController from './region.js';

import { News } from '../models/News';
import { User } from '../models/User';
import { Counter } from '../models/Counter';

const msg = {
    deny: 'You do not have permission for this action'
};

function createNews(iAm, data, cb) {
    if (!_.isObject(data)) {
        return cb({ message: 'Bad params', error: true });
    }

    step(
        function () {
            Counter.increment('news', this);
        },
        function (err, count) {
            if (err || !count) {
                return cb({ message: err && err.message || 'Increment comment counter error', error: true });
            }

            var novel = new News({
                cid: count.next,
                user: iAm.user,
                pdate: data.pdate,
                tdate: data.tdate,
                title: data.title,
                notice: data.notice,
                txt: data.txt
            });
            novel.save(this);
        },
        function (err, novel) {
            if (err || !novel) {
                return cb({ message: err && err.message || 'Save error', error: true });
            }
            cb({ news: novel });
        }
    );
}
function saveNews(iAm, data, cb) {
    if (!_.isObject(data)) {
        return cb({ message: 'Bad params', error: true });
    }

    step(
        function () {
            News.findOne({ cid: data.cid }, this);
        },
        function (err, novel) {
            if (err || !novel) {
                return cb({ message: err && err.message || 'No such news', error: true });
            }
            novel.pdate = data.pdate;
            novel.tdate = data.tdate;
            novel.title = data.title;
            novel.notice = data.notice;
            novel.txt = data.txt;
            novel.nocomments = data.nocomments ? true : undefined;
            novel.save(this);
        },
        function (err, novel) {
            if (err || !novel) {
                return cb({ message: err && err.message || 'Save error', error: true });
            }
            cb({ news: novel });
        }
    );
}

function getOnlineStat(iAm, cb) {
    if (!iAm.isAdmin) {
        return cb({ message: msg.deny, error: true });
    }

    var usersCount = Utils.getObjectPropertyLength(session.usLogin);
    var sessions = session.sessConnected;

    var sessUserCount = 0;
    var sessUserZeroSockCount = 0;
    var sessUserNoSockCount = 0;
    var sessAnonymCount = 0;
    var sessAnonymZeroSockCount = 0;
    var sessAnonymNoSockCount = 0;
    var sessNoSockHeaders = [];

    var sessionsWaitingConnect = session.sessWaitingConnect;
    var sessWCUserCount = 0;
    var sessWCAnonymCount = 0;
    var sessWCNoSockHeaders = [];

    var socketUserCount = 0;
    var socketAnonymCount = 0;

    var sockets;
    var isReg;
    var count;
    var i;

    for (i in sessions) {
        if (sessions[i] !== undefined) {
            isReg = !!sessions[i].user;
            if (isReg) {
                sessUserCount++;
            } else {
                sessAnonymCount++;
            }
            sockets = sessions[i].sockets;
            if (sockets) {
                count = Object.keys(sockets).length || 0;
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
                sessNoSockHeaders.push({
                    stamp: sessions[i].stamp,
                    header: (sessions[i].data && sessions[i].data.headers) || {}
                });
            }
        }
    }

    for (i in sessionsWaitingConnect) {
        if (sessionsWaitingConnect[i] !== undefined) {
            isReg = !!sessionsWaitingConnect[i].user;
            if (isReg) {
                sessWCUserCount++;
            } else {
                sessWCAnonymCount++;
            }
            sessWCNoSockHeaders.push({
                stamp: sessionsWaitingConnect[i].stamp,
                header: (sessionsWaitingConnect[i].data && sessionsWaitingConnect[i].data.headers) || {}
            });
        }
    }
    cb(null, {
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

        cusSid: Utils.getObjectPropertyLength(session.usSid),
        cusLogin: usersCount,
        cusId: Utils.getObjectPropertyLength(session.usId),
        csessConnected: Utils.getObjectPropertyLength(session.sessConnected),
        csessWaitingConnect: Utils.getObjectPropertyLength(session.sessWaitingConnect),
        csessWaitingSelect: Utils.getObjectPropertyLength(session.sessWaitingSelect)
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

    const usObjOnline = session.getOnline(login);
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
                await session.regetUser(usObjOnline);
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
        session.emitUser(usObjOnline);
    }

    return {};
}

export function loadController(io) {
    io.sockets.on('connection', function (socket) {
        const hs = socket.handshake;

        socket.on('saveNews', function (data) {
            if (!hs.usObj.isAdmin) {
                return result({ message: msg.deny, error: true });
            }
            if (data.cid) {
                saveNews(hs.usObj, data, result);
            } else {
                createNews(hs.usObj, data, result);
            }
            function result(resultData) {
                socket.emit('saveNewsResult', resultData);
            }
        });

        socket.on('getOnlineStat', function () {
            getOnlineStat(hs.usObj, function (err, resultData) {
                if (err) {
                    console.log(err);
                }
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