'use strict';

var ms = require('ms');
var _ = require('lodash');
var log4js = require('log4js');
var Bluebird = require('bluebird');
var Reason;
var UserAction;
var logger;

var reasonsHash = {};
var timeout;

// Периодически выбираем все причины из базы и храним их в памяти
function periodicFetchReasons() {
    clearTimeout(timeout);

    return Reason.findAsync({}, { _id: 0 }, { lean: true })
        .then(function (rsns) {
            if (_.isEmpty(rsns)) {
                reasonsHash = {};
            } else {
                reasonsHash = rsns.reduce(function (result, reason) {
                    result[reason.cid] = reason;
                    return result;
                }, {});
            }

            module.exports.reasonsHash = reasonsHash;
            timeout = setTimeout(periodicFetchReasons, ms('30s'));

            return rsns;
        });
}

/**
 *
 * @param cids Массив cid причин
 */
function getReasonHashFromCache(cids) {
    var result = {};
    var reason;

    for (var i = cids.length; i--;) {
        reason = reasonsHash[cids[i]];
        if (reason !== undefined) {
            result[reason.cid] = reason;
        }
    }

    return result;
}

var giveActionReasons = Bluebird.method(function (params) {
    if (!_.isObject(params) || !_.isString(params.action) || !params.action.length) {
        throw { message: 'Need user action' };
    }

    return UserAction.findOneAsync({ key: params.action }, { _id: 0, reasons: 1, reason_text: 1 }, { lean: true })
        .then(function (action) {
            if (!action || _.isEmpty(action.reasons)) {
                return null;
            }

            var actionsReasons = action.reasons.map(function (cid) {
                return reasonsHash[cid];
            });

            return { reasons: actionsReasons, reason_text: action.reason_text };
        });
});

var giveReasonTitle = function (params) {
    if (reasonsHash[params.cid] && reasonsHash[params.cid].title) {
        return reasonsHash[params.cid].title;
    } else {
        periodicFetchReasons();
    }
};

module.exports.loadController = function (app, db, io) {
    logger = log4js.getLogger('reason.js');

    Reason = db.model('Reason');
    UserAction = db.model('UserAction');

    periodicFetchReasons();

    io.sockets.on('connection', function (socket) {

        socket.on('giveActionReasons', function (data) {
            giveActionReasons(data)
                .then(function (result) {
                    socket.emit('takeActionReasons', result);
                })
                .catch(function (err) {
                    socket.emit('takeActionReasons', { message: err.message, error: true });
                });
        });

    });
};

module.exports.reasonsHash = reasonsHash;
module.exports.giveReasonTitle = giveReasonTitle;
module.exports.getReasonHashFromCache = getReasonHashFromCache;