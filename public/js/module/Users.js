/*global requirejs:true, require:true, define:true*/
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'Utils', 'socket', 'm/User'], function ($, _, ko, ko_mapping, Utils, socket, User) {
    'use strict';

    var Users = {
        users: {},
        user: function (login, callback, context) {
            if (Users.users[login]) {
                callback.call(context, Users.users[login]);
            } else {
                socket.on('takeUser', function (user) {
                    Users.users[login] = User.VM(user);
                    callback.call(context, Users.users[login]);
                });
                socket.emit('giveUser', {login: login});
            }
        }
    };

    return Users;
});