/*global define:true*/
/**
 * Модель управляет верхней панелью
 */
define(['underscore', 'Params', 'socket!', 'jquery', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/common/top.pug', 'css!style/common/top', 'm/common/auth'], function (_, P, socket, $, ko, Cliche, globalVM, pug) {
    'use strict';
    var langs = ['en', 'ru'];

    return Cliche.extend({
        pug: pug,
        create: function () {
            var self = this;
            this.auth = globalVM.repository['m/common/auth'];
            this.lang = ko.observable(P.settings.lang);
            this.langAlt = ko.observable(_.without(langs, P.settings.lang)[0]);
            this.langAltShow = ko.observable(false);
            this.langClickBinded = function (evt) {
                self.langClick(null, evt);
            };

            this.pageTitle = ko.observable();

            this.registrationAllowed = this.co.registrationAllowed = ko.computed({
                read: function () {
                    return P.settings.REGISTRATION_ALLOWED();
                },
                owner: this
            });
            this.can = {
                mod: this.co.canmod = ko.computed({
                    read: function () {
                        return this.auth.loggedIn() && this.auth.iAm.role() > 4 && this.auth.iAm.role() < 10;
                    },
                    owner: this
                }).extend({ throttle: 50 }),
                adm: this.co.canmod = ko.computed({
                    read: function () {
                        return this.auth.loggedIn() && this.auth.iAm.role() > 9;
                    },
                    owner: this
                }).extend({ throttle: 50 })
            };
            this.profile = this.co.profile = ko.computed({
                read: function () {
                    if (this.auth.loggedIn()) {
                        return this.auth.iAm.disp();
                    } else {
                        return '';
                    }
                },
                owner: this
            }).extend({ throttle: 50 });
            this.profileAvatar = this.co.profileAvatar = ko.computed({
                read: function () {
                    if (this.auth.loggedIn()) {
                        return this.auth.iAm.avatarth();
                    } else {
                        return '';
                    }
                },
                owner: this
            });

            this.msg = ko.observable('');
            this.msgCss = ko.observable('');

            this.routeHandler();
            this.subscriptions.route = globalVM.router.params.subscribe(this.routeHandler, this);

            ko.applyBindings(globalVM, this.$dom[0]);
        },
        show: function () {
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

            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        routeHandler: function () {
            var params = globalVM.router.params();

            this.pageTitle("Retro View of Mankind's Habitat" + (params._handler === 'gallery' ? '&ensp;–&ensp;Gallery' : ''));
        },

        langClick: function (data, evt) {
            var langAltShow = !this.langAltShow();

            evt.stopPropagation();
            evt.preventDefault();

            this.langAltShow(langAltShow);
            $(window)[langAltShow ? 'on' : 'off']('click', this.langClickBinded);
        },

        langAltClick: (function () {
            var changing;

            return function () {
                if (changing) {
                    return;
                }

                changing = true;
                ga('send', 'event', 'lang', 'lang change');

                var lang = this.langAlt();
                this.lang();

                this.lang(lang);
                this.langAlt(this.lang());
                socket.emit('session.langChange', { lang: lang });
            };
        }())
    });
});