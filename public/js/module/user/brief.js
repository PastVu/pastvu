/*global requirejs:true, require:true, define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/Users', 'text!tpl/user/brief.jade', 'css!style/user/brief', 'bs/bootstrap-affix' ], function (_, P, ko, Cliche, globalVM, users, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];

            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                if (vm) {
                    this.user = vm;

                    this.can_pm = ko.computed({
                        read: function () {
                            return P.settings.LoggedIn() && (this.auth.iAm.login() !== this.user.login());
                        },
                        owner: this
                    });
                    this.can_avatar = ko.computed({
                        read: function () {
                            return this.auth.iAm.login() === this.user.login();
                        },
                        owner: this
                    });

                    ko.applyBindings(globalVM, this.$dom[0]);

                    this.$dom.affix({
                        offset: {
                            top: 40
                        }
                    });

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
        }
    });
});