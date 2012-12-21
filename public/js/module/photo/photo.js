/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/storage', 'text!tpl/user/photo.jade', 'css!style/user/photo'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.u = null;

            var cid = globalVM.router.params().photo;

            storage.photo(cid, function (vm) {
                if (vm) {

                    this.u = vm;
                    this.originUser = ko_mapping.toJS(this.u);

                    this.edit = ko.observable(false);

                    this.canBeEdit = ko.computed(function () {
                        return this.auth.iAm.login() === this.u.login() || this.auth.iAm.role_level() >= 50;
                    }, this);

                    this.edit_mode = ko.computed(function () {
                        return this.canBeEdit() && this.edit();
                    }, this);

                    ko.applyBindings(globalVM, this.$dom[0]);

                    window.setTimeout(function () {
                        this.$dom
                            .find('.birthPick')
                            .datepicker()
                            .on('changeDate', function (ev) {
                                this.u.birthdate(this.$dom.find('#inBirthdate').val());
                            }.bind(this));
                    }.bind(this), 1000);

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
        saveUser: function () {
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
        cancelUser: function () {
            _.forEach(this.originUser, function (item, key) {
                if (Utils.isObjectType('function', this.u[key]) && this.u[key]() !== item) {
                    this.u[key](item);
                }
            }.bind(this));

            this.edit(false);
        }
    });
});