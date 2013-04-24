/*global define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'socket', 'm/User', 'm/Photo'], function ($, _, ko, ko_mapping, Utils, socket, User, Photo) {
    'use strict';

    var storage = {
        users: {},
        photos: {},
        waitings: {},
        user: function (login, callback, context) {
            if (storage.users[login]) {
                callback.call(context, storage.users[login]);
            } else if (storage.waitings['u' + login]) {
                storage.waitings['u' + login].push({cb: callback, ctx: context});
            } else {
                storage.waitings['u' + login] = [{cb: callback, ctx: context}];
                socket.once('takeUser', function (data) {
                    if (!data.error && data.login === login) {
                        User.factory(data, 'full');
                        storage.users[login] = {origin: data, vm: User.vm(data, undefined, true)};
                    }
                    if (storage.waitings['u' + login]) {
                        storage.waitings['u' + login].forEach(function (item, index, collection) {
                            item.cb.call(item.ctx, !data.error && data.login === login && storage.users[login]);
                        });
                        delete storage.waitings['u' + login];
                    }
                });
                socket.emit('giveUser', {login: login});
            }
        },
        photo: function (cid, callback, context) {
            if (storage.photos[cid]) {
                callback.call(context, storage.photos[cid]);
            } else if (storage.waitings['p' + cid]) {
                storage.waitings['p' + cid].push({cb: callback, ctx: context});
            } else {
                storage.waitings['p' + cid] = [{cb: callback, ctx: context}];
                socket.once('takePhoto', function (data) {
                    if (!data.error && data.cid === cid) {
                        Photo.factory(data, 'full', 'standard');
                        storage.photos[cid] = {origin: data, vm: Photo.vm(data, undefined, true)};
                    }
                    if (storage.waitings['p' + cid]) {
                        storage.waitings['p' + cid].forEach(function (item, index, collection) {
                            item.cb.call(item.ctx, !data.error && storage.photos[cid]);
                        });
                        delete storage.waitings['p' + cid];
                    }
                });
                socket.emit('givePhoto', {cid: cid});
            }
        }
    };

    return storage;
});