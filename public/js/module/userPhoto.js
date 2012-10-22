/*global requirejs:true, require:true, define:true*/
/**
 * Модель фотографий пользователя
 */
define(['underscore', 'Browser', 'Utils', 'socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'm/User', 'm/Users', 'text!tpl/userPhoto.jade', 'css!style/userPhoto'], function (_, Browser, Utils, socket, GP, ko, ko_mapping, Cliche, globalVM, renderer, User, users, jade) {
    'use strict';

    ko.observableArray['fn']['concat'] = function (arr, before) {
        var underlyingArray = this(),
            methodCallResult;

        this.valueWillMutate();
        methodCallResult = Array.prototype[(before ? 'unshift' : 'push')][(Array.isArray(arr) ? 'apply' : 'call')](underlyingArray, arr);
        this.valueHasMutated();

        return methodCallResult;
    };

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.u = null;
            this.photos = ko.observableArray();

            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                if (vm) {
                    this.u = vm;

                    ko.applyBindings(globalVM, this.$dom[0]);

                    this.show();
                }

            }, this);
        },
        show: function () {
            this.$container.fadeIn();
            this.getPhotos(0, 40);
        },
        hide: function () {
            this.$container.css('display', '');
        },
        getPhotos: function (start, limit) {
            socket.on('takeUserPhoto', function (data) {
                data.forEach(function (item, index, array) {
                    item.file = '/_photo/thumb/' + item.file;
                });
                this.photos.concat(data, false);
            }.bind(this));
            socket.emit('giveUserPhoto', {login: this.u.login(), start: start, limit: limit});
        },
        onThumbLoad: function (data, event) {
            $(event.target).parent().animate({opacity: 1});
            data = event = null;
        },
        showUpload: function (data, event) {
            $('.photoUploadModal').css({display: 'none'});
            $('.photoUploadCurtain').css({display: 'block'});
            renderer(this, [{module: 'm/userPhotoUpload', container: '.photoUploadModal'}], this.level + 1);
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            return false;
        },
        closeUpload: function (data, event) {
            $('.photoUploadModal').css({display: 'none'});
            $('.photoUploadCurtain').css({display: 'block'});
            renderer(this, [{module: 'm/userPhotoUpload', container: '.photoUploadModal'}], this.level + 1);
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            return false;
        }
    });
});