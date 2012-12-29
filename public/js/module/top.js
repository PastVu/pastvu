/*global requirejs:true, require:true, define:true*/
/**
 * Модель управляет верхней панелью
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/top.jade', 'css!style/top' ], function (_, P, ko, Cliche, globalVM, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];

            this.loggedIn = ko.computed({
                read: function () {
                    return P.settings.LoggedIn();
                },
                owner: this
            });
            this.registrationAllowed = ko.computed({
                read: function () {
                    return P.settings.REGISTRATION_ALLOWED();
                },
                owner: this
            });
            this.profile = ko.computed({
                read: function () {
                    if (P.settings.LoggedIn()) {
                        return this.auth.iAm.fullName();
                    } else {
                        return '';
                    }
                },
                owner: this
            }).extend({ throttle: 50 });
            this.profileAvatar = ko.computed({
                read: function () {
                    if (P.settings.LoggedIn()) {
                        return this.auth.iAm.avatar();
                    } else {
                        return '';
                    }
                },
                owner: this
            });

            this.msg = ko.observable('');
            this.msgCss = ko.observable('');

            ko.applyBindings(globalVM, this.$dom[0]);
            this.show();
        },
        show: function () {
            this.$container.fadeIn();
            this.showing = true;

            globalVM.pb.subscribe('/top/message', function (text, type) {
                var css = '';
                switch (type) {
                case 'error':
                    css = 'text-error';
                    break;
                case 'warn':
                    css = 'text-warning';
                    break;
                case 'info':
                    css = 'text-info';
                    break;
                case 'success':
                    css = 'text-success';
                    break;
                default:
                    css = 'muted';
                    break;
                }

                this.msg(text);
                this.msgCss(css);

                text = type = css = null;
            }.bind(this));
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        }
    });
});