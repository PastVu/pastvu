/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/Photo', 'm/storage', 'text!tpl/photo/photo.jade', 'css!style/photo/photo'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, jade) {
    'use strict';

    // https://groups.google.com/forum/#!topic/knockoutjs/Mh0w_cEMqOk
    ko.bindingHandlers.htmlValue = {
        init: function (element, valueAccessor, allBindingsAccessor) {
            ko.utils.registerEventHandler(element, "blur", function () {
                var modelValue = valueAccessor(),
                    elementValue = element.innerHTML,
                    allBindings;

                if (ko.isWriteableObservable(modelValue)) {
                    modelValue(elementValue);
                } else { //handle non-observable one-way binding
                    allBindings = allBindingsAccessor();
                    if (allBindings._ko_property_writers && allBindings._ko_property_writers.htmlValue) {
                        allBindings._ko_property_writers.htmlValue(elementValue);
                    }
                }
            });
        },
        update: function (element, valueAccessor) {
            var value = ko.utils.unwrapObservable(valueAccessor()) || "";
            element.innerHTML = value;
        }
    };

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
                        return this.auth.iAm.login() === this.p.user.login() || this.auth.iAm.role_level() >= 0;
                    }, this);

                    this.canBeApprove = ko.computed(function () {
                        return this.p.fresh() && this.auth.iAm.role_level() >= 0;
                    }, this);

                    this.canBeActive = ko.computed(function () {
                        return !this.p.fresh() && this.auth.iAm.role_level() >= 0;
                    }, this);

                    this.canBeRemove = ko.computed(function () {
                        return this.auth.iAm.role_level() >= 0;
                    }, this);

                    // Если фото новое и есть права, открываем его на редактирование
                    this.edit = ko.observable(this.p.fresh() && this.canBeEdit());

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
        toggleActive: function (data, event) {
            if (this.canBeActive()) {
                //TODO: Активация только через запрос
            }
        },
        remove: function (data, event) {
            if (this.canBeRemove()) {
                //TODO: Удаление только через запрос
            }
        },

        www: function () {
            console.dir(ko_mapping.toJS(this.p));
            this.p.address(String(Math.random() * 100 >> 0));
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
})
;