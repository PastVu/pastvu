/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/User', 'm/Users', 'text!tpl/userPhoto.jade', 'css!style/userPhoto'], function (_, Browser, Utils, socket, GP, ko, ko_mapping, Cliche, globalVM, User, users, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.u = null;
            this.photos = ko.observableArray();

            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                this.u = vm;

                ko.applyBindings(globalVM, this.$dom[0]);

                this.show();

            }, this);
        },
        show: function () {
            this.$container.fadeIn();
            this.getPhotos(0, 20);
        },
        hide: function () {
            this.$container.css('display', '');
        },
        getPhotos: function (start, length) {
            socket.on('takeUserPhoto', function (data) {
                console.dir(data);
            });
            socket.emit('giveUserPhoto', {login: this.u.login(), start: start, length: length});
        }
    });
});