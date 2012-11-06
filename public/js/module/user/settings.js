/*global requirejs:true, require:true, define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', '../../socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/User', 'm/Users', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/bootstrap-collapse' ], function (_, Utils, socket, GlobalParams, ko, ko_mapping, Cliche, globalVM, User, users, jade) {
    'use strict';

    ko.bindingHandlers.executeOnEnter = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            var allBindings = allBindingsAccessor();
            $(element).keypress(function (event) {
                var keyCode = (event.which ? event.which : event.keyCode);
                if (keyCode === 13) {
                    allBindings.executeOnEnter.call(viewModel);
                    return false;
                }
                return true;
            });
        }
    };

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.u = null;
            this.editEmail = ko.observable(false);

            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                if (vm) {

                    this.u = vm;
                    this.originUser = ko_mapping.toJS(this.u);

                    ko.applyBindings(globalVM, this.$dom[0]);

                    this.show();
                }
            }, this);
        },
        show: function () {
            this.$dom.find("#accordion2 .collapse").collapse({
                toggle: false
            });
            this.$container.fadeIn();
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },

        saveEmail: function () {
            if (this.editEmail() === true) {
                socket.emit('saveUser', {login: this.u.login(), email: this.u.email()});
            }
            this.editEmail(!this.editEmail());
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