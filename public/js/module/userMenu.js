/*global requirejs:true, require:true, define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'globalParams', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/Users', 'text!tpl/userMenu.jade', 'css!style/userMenu'], function (_, GlobalParams, ko, Cliche, globalVM, users, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.links = ko.observableArray();
            var user = globalVM.router.params().user || this.auth.iAm.login();

            users.user(user, function (vm) {
                if (vm) {
                    this.user = vm;

                    this.links.push({name: 'Profile', href: "/u/" + this.user.login()});
                    if (GlobalParams.LoggedIn() && (this.auth.iAm.login() === this.user.login())) {
                        this.links.push({name: 'Messages', href: "/u/" + this.user.login() + '/pm'});
                    }
                    this.links.push({name: 'Photo', href: "/u/" + this.user.login() + "/photo"});
                    this.links.push({name: 'Blogs', href: "/u/" + this.user.login() + "/photoUpload"});
                    this.links.push({name: 'Comments', href: "/u/" + this.user.login() + "/comments"});

                    globalVM.router.routeChanged.subscribe(this.routeHandler, this);
                    this.routeHandler();

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
        routeHandler: function () {
            var route = globalVM.router.base() + globalVM.router.body(),
                links = this.links();

            links.forEach(function (item, index, array) {
                if (item.href === '/' + route) {
                    item.active = true;
                } else {
                    item.active = false;
                }
            }, this);

            this.links([]);
            this.links(links);
        }
    });
});