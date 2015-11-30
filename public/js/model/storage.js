define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'socket!', 'globalVM', 'model/User', 'model/Photo'], function ($, _, ko, ko_mapping, Utils, socket, globalVM, User, Photo) {
    var storage = {
        users: {},
        photos: {},
        waitings: {},
        timeouts: {},
        user: function (login, callback, context) {
            if (storage.users[login]) {
                callback.call(context, storage.users[login]);
            } else if (storage.waitings['u' + login]) {
                storage.waitings['u' + login].push({ cb: callback, ctx: context });
            } else {
                storage.waitings['u' + login] = [
                    { cb: callback, ctx: context }
                ];

                socket.run('profile.giveUser', { login: login }, true)
                    .then(function (data) {
                        if (_.get(data, 'user.login') === login) {
                            User.factory(data.user, 'full');
                            storage.users[login] = { origin: data.user, vm: User.vm(data.user, undefined, true) };

                            _.forEach(storage.waitings['u' + login], function (item) {
                                item.cb.call(item.ctx, storage.users[login]);
                            });
                            delete storage.waitings['u' + login];
                        }
                    });
            }
        },
        userImmediate: function (login) {
            return storage.users[login];
        },
        photo: function (cid, callback, context) {
            if (storage.photos[cid]) {
                callback.call(context, storage.photos[cid]);
            } else if (storage.waitings['p' + cid]) {
                storage.waitings['p' + cid].push({ cb: callback, ctx: context });
            } else {
                storage.waitings['p' + cid] = [
                    { cb: callback, ctx: context }
                ];

                socket.emit('photo.giveForPage', { cid: cid }, true)
                    .then(function (data) {
                        if (data.photo.cid === cid) {
                            Photo.factory(data.photo, 'full', 'd');
                            storage.photos[cid] = {
                                vm: Photo.vm(data.photo, undefined, true),
                                origin: data.photo,
                                can: data.can || Photo.canDef
                            };
                            storage.timeouts[cid] = setTimeout(function () {
                                delete storage.photos[cid];
                                delete storage.timeouts[cid];
                            }, 8000); // Через 8s отбрасываем из storage, чтобы запросить при необходимости заново
                        }

                        if (Array.isArray(storage.waitings['p' + cid])) {
                            storage.waitings['p' + cid].forEach(function (item) {
                                item.cb.call(item.ctx, storage.photos[cid]);
                            });
                            delete storage.waitings['p' + cid];
                        }
                    });
            }
        },
        photoCan: function (cid, callback, context) {
            if (storage.photos[cid] === undefined) {
                storage.photo(cid, function (data) {
                    storage.photoCan(cid, callback, context);
                });
                return;
            }

            socket.once('takeCanPhoto', function (data) {
                if (!data.error) {
                    storage.photos[cid].can = data.can || Photo.canDef;
                }
                if (callback) {
                    callback.call(context, data);
                }
            });
            socket.emit('photo.giveCan', { cid: cid });
        }
    };

    return storage;
});