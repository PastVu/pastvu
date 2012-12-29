/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/Photo', 'm/storage', 'text!tpl/photo/photo.jade', 'css!style/photo/photo'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, jade) {
    'use strict';

    /**
     * Редактирование содержимого элементов с помошью contenteditable
     * Inspired by https://groups.google.com/forum/#!topic/knockoutjs/Mh0w_cEMqOk
     * @type {Object}
     */
    ko.bindingHandlers.cEdit = {
        init: function (element, valueAccessor, allBindingsAccessor) {
        },
        update: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var obj = ko.utils.unwrapObservable(valueAccessor()),
                $element = $(element);

            $element.text(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val);

            if (obj.edit) {
                if (!$element.attr('contenteditable')) {
                    $element
                        .css({display: ''})
                        .attr('contenteditable', "true")
                        .on('blur', function () {
                            console.log('blur');
                            var modelValue = obj.val,
                                elementValue = $.trim($element.text());

                            $element.text(elementValue);
                            if (ko.isWriteableObservable(modelValue)) {
                                if (elementValue === modelValue()) {
                                    checkForCap();
                                } else {
                                    modelValue(elementValue);
                                }
                            }
                        })
                        .on('focus', function () {
                            console.log('focus');
                            $element.removeClass('cap');
                            if (_.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
                                $element.html('&nbsp;');
                            }
                        });
                    checkForCap();
                } else {
                    checkForCap();
                }
            } else {
                if ($element.attr('contenteditable') === 'true') {
                    $element.off('blur').off('focus').removeAttr('contenteditable').removeClass('cap');
                }
                if (_.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
                    $element.css({display: 'none'});
                }
            }

            function checkForCap() {
                if (obj.edit && obj.cap && _.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
                    $element.addClass('cap');
                    $element.text(obj.cap);
                } else {
                    $element.removeClass('cap');
                }
            }
        }
    };

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.p = null;
            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу

            var cid = globalVM.router.params().photo;

            storage.photo(cid, function (vm) {
                if (vm) {

                    this.p = vm;
                    this.originData = ko_mapping.toJS(this.p);

                    this.canBeEdit = ko.computed(function () {
                        return P.settings.LoggedIn() && (this.auth.iAm.login() === this.p.user.login() || this.auth.iAm.role_level() >= 0);
                    }, this);

                    this.canBeApprove = ko.computed(function () {
                        return P.settings.LoggedIn() && (this.p.fresh() && this.auth.iAm.role_level() >= 0);
                    }, this);

                    this.canBeDisable = ko.computed(function () {
                        return P.settings.LoggedIn() && (!this.p.fresh() && this.auth.iAm.role_level() >= 0);
                    }, this);

                    this.canBeRemove = ko.computed(function () {
                        return P.settings.LoggedIn() && (this.auth.iAm.role_level() >= 0);
                    }, this);

                    // Если фото новое и есть права, открываем его на редактирование
                    this.edit = ko.observable(this.p.fresh() && this.canBeEdit());

                    this.msgByStatus =  ko.computed(function () {
                        if (this.edit()) {
                            globalVM.pb.publish('/top/message', ['Photo is in edit mode. Please fill in the underlying fields and save the changes', 'warn']);
                        } else if (this.p.fresh()) {
                            globalVM.pb.publish('/top/message', ['Photo is new. Administrator must approve it', 'warn']);
                        } else if (this.p.disabled()) {
                            globalVM.pb.publish('/top/message', ['Photo is disabled by Administrator. Only You and other Administrators can see and edit it', 'warn']);
                        } else if (this.p.del()) {
                            globalVM.pb.publish('/top/message', ['Photo is deleted by Administrator', 'error']);
                        } else {
                            globalVM.pb.publish('/top/message', ['', 'muted']);
                        }
                    }, this);

                    this.p.year.subscribe(function (val) {
                        var v = parseInt(val, 10);
                        if (!v || isNaN(v)) {
                            v = Photo.def.year;
                        }
                        if (String(val) !== String(v)) {
                            this.p.year(v);
                            return;
                        }
                        if (v > parseInt(this.p.year2(), 10)) {
                            this.p.year2(v);
                        }
                    }, this);
                    this.p.year2.subscribe(function (val) {
                        var v = parseInt(val, 10);
                        if (!v || isNaN(v)) {
                            v = Photo.def.year;
                        }
                        if (String(val) !== String(v)) {
                            this.p.year2(v);
                            return;
                        }
                        if (v < this.p.year()) {
                            this.p.year2(this.p.year());
                            return;
                        }
                    }, this);

                    ko.applyBindings(globalVM, this.$dom[0]);

                    this.show();
                }
            }, this);
        },
        show: function () {
            this.$container.fadeIn();
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
            globalVM.pb.publish('/top/message', ['', 'muted']);
        },

        editSave: function (data, event) {
            if (this.canBeEdit()) {
                if (!this.edit()) {
                    this.edit(true);
                } else {
                    this.exe(true);
                    this.save(function (data) {
                        if (!data.error) {
                            this.edit(false);
                        } else {
                            window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
                        }
                        this.exe(false);
                    }, this);

                }
            }
        },
        editCancel: function (data, event) {
            if (this.canBeEdit() && this.edit()) {
                this.cancel();
                this.edit(false);
            }
        },
        setApprove: function (data, event) {
            if (this.canBeApprove()) {
                this.exe(true);
                socket.once('approvePhotoResult', function (data) {
                    if (data && !data.error) {
                        this.p.fresh(false);
                        this.originData.fresh = false;
                    } else {
                        window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
                    }
                    this.exe(false);
                }.bind(this));
                socket.emit('approvePhoto', this.p.cid());
            }
        },
        toggleDisable: function (data, event) {
            if (this.canBeDisable()) {
                this.exe(true);
                socket.once('disablePhotoResult', function (data) {
                    if (data && !data.error) {
                        this.p.disabled(data.disabled || false);
                        this.originData.disabled = data.disabled || false;
                    } else {
                        window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
                    }
                    this.exe(false);
                }.bind(this));
                socket.emit('disablePhoto', this.p.cid());
            }
        },
        remove: function (data, event) {
            if (!this.canBeRemove()) {
                return false;
            }

            var that = this;

            this.exe(true);
            window.noty(
                {
                    text: 'The photo will be removed permanently.<br>Confirm the delete operation?',
                    type: 'confirm',
                    layout: 'center',
                    modal: true,
                    force: true,
                    animation: {
                        open: {height: 'toggle'},
                        close: {},
                        easing: 'swing',
                        speed: 500
                    },
                    buttons: [
                        {addClass: 'btn-strict btn-strict-danger', text: 'Ok', onClick: function ($noty) {
                            // this = button element
                            // $noty = $noty element
                            if ($noty.$buttons && $noty.$buttons.find) {
                                $noty.$buttons.find('button').attr('disabled', true).addClass('disabled');
                            }

                            socket.once('removePhotoCallback', function (data) {
                                $noty.$buttons.find('.btn-strict-danger').remove();
                                var okButton = $noty.$buttons.find('button')
                                    .attr('disabled', false)
                                    .removeClass('disabled')
                                    .off('click');

                                if (data && !data.error) {
                                    this.p.del(true);
                                    this.originData.del = true;

                                    $noty.$message.children().html('Photo successfully removed');

                                    okButton
                                        .text('Ok (4)')
                                        .on('click', function () {
                                            document.location.href = '/u/' + this.p.user.login() + '/photo';
                                        }.bind(this));

                                    Utils.timer(
                                        5000,
                                        function (timeleft) {
                                            okButton.text('Ok (' + timeleft + ')');
                                        },
                                        function () {
                                            okButton.trigger('click');
                                        }
                                    );
                                } else {
                                    $noty.$message.children().html(data.message || 'Error occurred');
                                    okButton
                                        .text('Close')
                                        .on('click', function () {
                                            $noty.close();
                                            this.exe(false);
                                        }.bind(this));
                                }
                            }.bind(that));
                            socket.emit('removePhotos', that.p.file());

                        }},
                        {addClass: 'btn-strict', text: 'Cancel', onClick: function ($noty) {
                            $noty.close();
                            that.exe(false);
                        }}
                    ]
                }
            );
        },

        save: function (cb, ctx) {
            var target = _.pick(ko_mapping.toJS(this.p), 'lat', 'lng', 'dir', 'title', 'year', 'year2', 'address', 'desc', 'source', 'author'),
                key;

            for (key in target) {
                if (target.hasOwnProperty(key)) {
                    if (this.originData[key] && (target[key] === this.originData[key])) {
                        delete target[key];
                    } else if (!this.originData[key] && (target[key] === Photo.def[key])) {
                        delete target[key];
                    }
                }
            }
            if (Utils.getObjectPropertyLength(target) > 0) {
                target.cid = this.p.cid();
                socket.once('savePhotoResult', function (data) {
                    if (data && !data.error) {
                        _.assign(this.originData, target);
                    }
                    if (cb) {
                        cb.call(ctx, data);
                    }
                }.bind(this));
                socket.emit('savePhoto', target);
            } else {
                if (cb) {
                    cb.call(ctx, {message: 'Nothing to save'});
                }
            }
        },
        cancel: function () {
            _.forEach(this.originData, function (item, key) {
                if (Utils.isObjectType('function', this.p[key]) && this.p[key]() !== item) {
                    this.p[key](item);
                }
            }.bind(this));
        }
    });
});