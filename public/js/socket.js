/*global define*/
define(['socket.io', 'Utils'], function (io, Utils) {
    'use strict';
    console.timeStamp('Socket defining');

    var connectionType = '',
        s = io.connect(location.host);

    s.on('connect', function () { console.log('Connected with ' + connectionType); });
    s.on('connecting', function (type) { connectionType = type; });
    s.on('disconnect', function () { console.log('Disconnected', arguments); });

    s.on('newCookie', function (obj) {
        Utils.setCookie(obj.name, obj.key, {path: obj.path, expires: obj.expires, 'max-age': obj['max-age']});
    });

    return s;
});