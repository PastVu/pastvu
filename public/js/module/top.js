/*global define*/
/**
 * Модель управляет верхней панелью
 */
define(['underscore', 'globalParams', 'knockout', 'm/_moduleCliche', 'm/auth', 'text!tpl/top.jade', 'css!style/top' ], function (_, GlobalParams, ko, Cliche, auth, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = auth;

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
        }
    });
});