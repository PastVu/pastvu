var User,
    Role,
    Step = require('step'),
    errS = require('./errors.js').err,
    Utils = require('../commons/Utils.js'),
    app, io, memcashed;

function cashedSession(id, neoStore, callback) {
    if (neoStore) {
        memcashed.set('sess' + id, JSON.stringify(neoStore), {flags: 0, exptime: Utils.time.hour / 1000}, function (err, status) {
            if (!err) {
                if (callback) callback(null);
            }
        });
    } else {
        memcashed.get('sess' + id, function (err, response) {
            if (!err) {
                if (callback) callback(null, JSON.parse(response['sess' + id]));
            } else {
                if (callback) callback(err);
            }
        });
    }
}
function mongoSession(id, neoStore, callback) {

}
function getNeoStore(id, login, callback) {
    var neoStore;
    if (!id) {
        neoStore = {};
        if (callback) callback.call(null, neoStore);
        return;
    }

    cashedSession(id, null, function (err, store) {
        neoStore = store || {};

        if (!login || neoStore.user) {
            if (callback) callback.call(null, neoStore);
            return;
        }

        Step(
            function () {
                User.getUserPublic(login, this);
            },
            function (err, user) {
                neoStore.user = user.toObject();
                Role.find({name: {$in: neoStore.user.roles}}).select({_id: 0}).sort('level', -1).exec(this);
            },
            function (err, roles) {
                neoStore.roles = roles;
                cashedSession(id, neoStore);
                if (callback) callback.call(null, neoStore);
            }
        );
    });
}

module.exports.cashedSession = cashedSession;
module.exports.getNeoStore = getNeoStore;

function cashedSessionDel(id, cb) {
    console.dir(memcashed);
    if (memcashed && memcashed.del) {
        memcashed.del('sess' + id, cb || function () {
        });
    } else {
        cb && cb();
    }
}
module.exports.cashedSessionDel = cashedSessionDel;


module.exports.loadController = function (a, db, io, mc) {
    app = a;
    memcashed = mc;
    User = db.model('User');
    Role = db.model('Role');

    app.get('*', function (req, res, next) {
        var sessionId = req.cookies['oldmos.sid'];
        getNeoStore(sessionId, req.session.login, function (neoStore) {
            req.session.neoStore = neoStore;
            next();
        });
    });

    io.sockets.on('connection', function (socket) {
        //var address = socket.handshake.address;
        //console.log("New connection from " + address.address + ":" + address.port);

        var session = socket.handshake.session,
            sessionId = socket.handshake.sessionID;

        getNeoStore(sessionId, session.login, function (neoStore) {
            session.neoStore = neoStore;
        });
    });
};