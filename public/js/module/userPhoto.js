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
            this.uploadVM = null;

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
            this.getPage(0, 40);
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },
        getPhotos: function (start, limit, cb, ctx) {
            var socketCb = function (data) {
                socket.removeListener('takeUserPhoto', socketCb);
                data.forEach(function (item, index, array) {
                    item.pfile = '/_photo/thumb/' + item.file;
                });
                if (Utils.isObjectType('function', cb)) {
                    cb.call(ctx, data);
                }
            }.bind(this);
            socket.on('takeUserPhoto', socketCb);
            socket.emit('giveUserPhoto', {login: this.u.login(), start: start, limit: limit});
        },
        getPage: function (start, limit) {
            this.getPhotos(start, limit, function (data) {
                this.photos.concat(data, false);
            }, this);
        },
        onThumbLoad: function (data, event) {
            $(event.target).parent().animate({opacity: 1});
            data = event = null;
        },
        showUpload: function (data, event) {
            this.$dom.find('span.modalCaption').text('Upload photo');
            $('.photoUploadCurtain').fadeIn(400, function () {
                renderer(this, [
                    {module: 'm/userPhotoUpload', container: '.modalContainer', callback: function (vm) {
                        this.uploadVM = vm;
                    }.bind(this)}
                ], this.level + 1);
            }.bind(this));
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            return false;
        },
        closeUpload: function (data, event) {
            $('.photoUploadCurtain').fadeOut(400, function () {
                this.uploadVM.destroy();
                var oldFirst = this.photos()[0] ? this.photos()[0].file : 0;
                this.getPhotos(0, 10, function (data) {
                    if (oldFirst === 0) {
                        this.photos.concat(data, false);
                    } else {
                        var intersectionIndex = data.reduce(function (previousValue, currentValue, index, array) {
                            if (previousValue === 0 && currentValue.file === oldFirst) {
                                return index;
                            } else {
                                return previousValue;
                            }
                        }.bind(this), 0);
                        if (intersectionIndex > 0) {
                            this.photos.concat(data.slice(0, intersectionIndex), true);
                        }
                    }

                }, this);
            }.bind(this));
        }
    });
});