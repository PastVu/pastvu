/*global requirejs:true, require:true, define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/storage', 'text!tpl/user/menu.jade', 'css!style/user/menu'], function (_, P, ko, Cliche, globalVM, storage, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];
            this.links = ko.observableArray();
            var user = globalVM.router.params().user || this.auth.iAm.login();

            storage.user(user, function (data) {
                if (data) {
                    this.user = data.vm;

                    this.links.push({name: 'Profile', href: "/u/" + this.user.login()});
                    this.links.push({name: 'Photo', href: "/u/" + this.user.login() + "/photo"});
                    if (P.settings.LoggedIn() && (this.auth.iAm.login() === this.user.login())) {
                        this.links.push({name: 'Upload', href: "/u/photoUpload"});
                    }
                    this.links.push({name: 'Blogs', href: "/u/" + this.user.login() + "/blogs", disable: true});
                    this.links.push({name: 'Comments', href: "/u/" + this.user.login() + "/comments", disable: true});
                    if (P.settings.LoggedIn() && (this.auth.iAm.login() === this.user.login())) {
                        this.links.push({name: 'Settings', href: "/u/" +  this.user.login() + "/settings"});
                        this.links.push({name: 'Messages', href: "/u/" + this.user.login() + '/pm', disable: true});
                    }


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
            var route = globalVM.router.root + globalVM.router.body(),
                links = this.links();

            links.forEach(function (item, index, array) {
                if (item.href === route) {
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