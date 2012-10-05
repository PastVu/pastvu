/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'm/User', 'm/Users', 'text!tpl/userPhoto.jade', 'css!style/userPhoto'], function (_, Browser, Utils, socket, GP, ko, ko_mapping, Cliche, globalVM, renderer, User, users, jade) {
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
            this.photos.push({file: '/img/1.jpg', title: 'Вид на Кремлёвскую'});
            this.photos.push({file: '/img/2.jpg', title: 'Царская(Ивановская) площадь в Кремле'});
            this.photos.push({file: '/img/3.jpg', title: 'Церковь Николая Чудотворца в Хамовниках'});
            this.photos.push({file: '/img/4.jpg', title: 'hello'});
            this.photos.push({file: '/img/5.jpg', title: 'hello'});
            this.photos.push({file: '/img/6.jpg', title: 'Церковь Николая Чудотворца в Хамовниках'});
            this.photos.push({file: '/img/7.jpg', title: 'hello'});
            this.photos.push({file: '/img/8.jpg', title: 'Церковь Николая Чудотворца в Хамовниках'});
            this.photos.push({file: '/img/9.jpg', title: 'hello'});
            this.photos.push({file: '/img/10.jpg', title: 'hello'});
            this.photos.push({file: '/img/11.jpg', title: 'hello'});
            this.photos.push({file: '/img/12.jpg', title: 'hello'});
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
        },
        onThumbLoad: function (data, event) {
            $(event.target).parent().animate({opacity: 1});
            data = event = null;
        },
        showUpload: function (data, event) {
            $('.photoUploadModal').css({display: 'none'});
            $('.photoUploadCurtain').css({display: 'block'});
            renderer(this, [{module: 'm/userPhotoUpload', container: '.photoUploadModal'}], this.level + 1);
        }
    });
});