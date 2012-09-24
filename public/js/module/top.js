/*global define*/
/**
 * Модель управляет верхней панелью
 */
define(['underscore', 'globalParams', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/top.jade', 'css!style/top' ], function (_, GlobalParams, ko, Cliche, globalVM, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            console.log(globalVM.repository['m/auth']);
            this.auth = globalVM.repository['m/auth'];

            this.loggedIn = ko.computed({
                read: function () {
                    return GlobalParams.LoggedIn();
                },
                owner: this
            });
            this.registrationAllowed = ko.computed({
                read: function () {
                    return GlobalParams.REGISTRATION_ALLOWED();
                },
                owner: this
            });
            this.profile = ko.computed({
                read: function () {
                    if (GlobalParams.LoggedIn()) {
                        return this.auth.iAm.fullName();
                    } else {
                        return '';
                    }
                },
                owner: this
            });
            this.profileAvatar = ko.computed({
                read: function () {
                    if (GlobalParams.LoggedIn()) {
                        return this.auth.iAm.avatar();
                    } else {
                        return '';
                    }
                },
                owner: this
            });

            this.show();
        },
        show: function () {
            this.$container.css('display', 'block');
        },
        hide: function () {
            this.$container.css('display', '');
        }
    });
});