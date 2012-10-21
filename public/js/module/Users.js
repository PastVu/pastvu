/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'socket', 'm/User'], function ($, _, ko, ko_mapping, Utils, socket, User) {
    'use strict';

    var Users = {
        users: {},
        waitings: {},
        user: function (login, callback, context) {
            if (Users.users[login]) {
                callback.call(context, Users.users[login]);
            } else if (Users.waitings[login]) {
                Users.waitings[login].push({cb: callback, ctx: context});
            } else {
                Users.waitings[login] = [{cb: callback, ctx: context}];
                socket.on('takeUser', function (data) {
                    if (!data.error && data.login === login) {
                        Users.users[login] = User.VM(data);
                    }
                    if (Users.waitings[login]) {
                        Users.waitings[login].forEach(function (item, index, collection) {
                            item.cb.call(item.ctx, !data.error && data.login === login && Users.users[login]);
                        });
                        delete Users.waitings[login];
                    }
                });
                socket.emit('giveUser', {login: login});
            }
        }
    };

    return Users;
});