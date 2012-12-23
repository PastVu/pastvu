/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/storage', 'text!tpl/photo/photo.jade', 'css!style/photo/photo'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, jade) {
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

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.p = null;

            var cid = globalVM.router.params().photo;

            storage.photo(cid, function (vm) {
                if (vm) {

                    this.p = vm;
                    this.origin = ko_mapping.toJS(this.p);

                    this.edit = ko.observable(false);

                    this.canBeEdit = ko.computed(function () {
                        return this.auth.iAm.login() === this.p.user.login() || this.auth.iAm.role_level() >= 50;
                    }, this);

                    this.edit_mode = ko.computed(function () {
                        return this.canBeEdit() && this.edit();
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
        www: function () {
            console.log(9);
        },

        save: function () {
            var targetUser = ko_mapping.toJS(this.u),
                key;

            for (key in targetUser) {
                if (targetUser.hasOwnProperty(key) && key !== 'login') {
                    if (this.originUser[key] && (targetUser[key] === this.originUser[key])) {
                        delete targetUser[key];
                    } else if (!this.originUser[key] && (targetUser[key] === User.def[key])) {
                        delete targetUser[key];
                    }
                }
            }
            if (Utils.getObjectPropertyLength(targetUser) > 1) {
                socket.emit('saveUser', targetUser);
                this.originUser = targetUser;
            }
            this.edit(false);

            targetUser = key = null;
        },
        cancel: function () {
            _.forEach(this.originUser, function (item, key) {
                if (Utils.isObjectType('function', this.u[key]) && this.u[key]() !== item) {
                    this.u[key](item);
                }
            }.bind(this));

            this.edit(false);
        }
    });
});