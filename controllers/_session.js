var Session,
    User,
    Role,
    Utils = require('../commons/Utils.js'),
    ms =  require('ms'), // Tiny milisecond conversion utility
    app,
    cookieMaxAgeRegisteredRemember = ms('14d') / 1000,
    cookieMaxAgeAnonimouse = ms('14d') / 1000;

function generate(user, data, cb) {
    'use strict';

    var session = new Session({
        key: Utils.randomString(12),
        stamp: new Date()
    });

    if (user) {
        session.user = user;
    }
    if (data) {
        session.extend(data);
    }

    session.save().populate('user').exec(function (err, session) {
        if (cb) {
            cb(err, session);
        }
    });
}
module.exports.generate = generate;

function destroy(session, cb) {
    'use strict';

    if (session) {
        session.remove(cb);
    }
}
module.exports.destroy = destroy;

function setUser(socket, user, data, cb) {
    'use strict';

    socket.handshake.session.user = user;
    if (data) {
        socket.handshake.session.extend(data);
    }
    socket.handshake.session.save(function (err, session) {
        socket.handshake.session = session;
        if (cb) {
            cb(err);
        }
    });
}
module.exports.setUser = setUser;

function setData(socket, data, cb) {
    'use strict';

    socket.handshake.session.extend(data);
    socket.handshake.session.save(function (err, session) {
        socket.handshake.session = session;
        if (cb) {
            cb(err);
        }
    });
}
module.exports.setData = setData;

function emitCookie(socket) {
    'use strict';

    var newCoockie = {name: 'pastvu.sid', key: socket.handshake.session.key, path: '/'};

    if (socket.handshake.session.user) {
        if (socket.handshake.session.data && socket.handshake.session.data.remember) {
            newCoockie['max-age'] = cookieMaxAgeRegisteredRemember;
        }
    } else {
        newCoockie['max-age'] = cookieMaxAgeAnonimouse;
    }
    //newCoockie.expires = new Date(Date.now() + ms('14d')).toGMTString();

    socket.emit('newCookie', newCoockie);
}
module.exports.emitCookie = emitCookie;


module.exports.loadController = function (a, db, io) {
    app = a;
    Session = db.model('Session');
    User = db.model('User');
    Role = db.model('Role');

    io.sockets.on('connection', function (socket) {
        emitCookie(socket);
    });
};