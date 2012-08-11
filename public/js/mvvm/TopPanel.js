/*global define*/
/**
 * Модель управляет верхней панелью
 */
define(['mvvm/GlobalParams', 'mvvm/i18n', 'knockout', 'auth'], function (GlobalParams, i18nVM, ko, auth) {

    function TopPanelVM(dom) {
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
        this.login = ko.computed({
            read: function () {
                return i18nVM.login();
            },
            owner: this
        });
        this.logout = ko.computed({
            read: function () {
                return i18nVM.logout();
            },
            owner: this
        });
        this.register = ko.computed({
            read: function () {
                return i18nVM.register();
            },
            owner: this
        });
        this.admin = ko.computed({
            read: function () {
                return i18nVM.admin();
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
        this.uploadPhoto = ko.computed({
            read: function () {
                if (GlobalParams.LoggedIn()) {
                    return i18nVM.image_upload();
                } else {
                    return '';
                }
            },
            owner: this
        });

        ko.applyBindings(this, document.getElementById(dom));
    }

    return TopPanelVM;
});