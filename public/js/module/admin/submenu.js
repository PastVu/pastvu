/**
 * Модель левого подменю админки
 */
define(['underscore', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/admin/submenu.pug', 'css!style/admin/submenu'], function (_, ko, Cliche, globalVM, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        create: function () {
            var self = this;
            this.auth = globalVM.repository['m/common/auth'];

            this.submenus = {
                index: [
                    { name: 'Main', href: '/admin', section: 'main' },
                    { name: 'News', href: '/admin/news', section: 'news' }
                ],
                map: [
                    { name: 'Clusters', href: '/admin/map/cluster', section: 'cluster' }
                ],
                photo: [
                    { name: 'Conversions conveyor', href: '/admin/photo/conveyer', section: 'conveyer' }
                ],
                region: [
                    { name: 'List and view', href: '/admin/region', section: 'region' },
                    { name: 'Check by point', href: '/admin/region/check', section: 'regionCheck' }
                ]
            };

            this.topmenu = ko.observable('');
            this.section = ko.observable('');
            this.menuItems = this.co.menuItems = ko.computed({
                read: function () {
                    return this.submenus[this.topmenu()] || [];
                },
                owner: this
            });

            // Subscriptions
            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);

            // Hack for route params
            setTimeout(function () {
                self.routeHandler();
                ko.applyBindings(globalVM, self.$dom[0]);
            }, 300);
        },
        show: function () {
            if (!this.showing) {
                globalVM.func.showContainer(this.$container);
                this.showing = true;
            }
        },
        hide: function () {
            if (this.showing) {
                globalVM.func.hideContainer(this.$container);
                this.showing = false;
            }
        },
        routeHandler: function () {
            var params = globalVM.router.params();

            this.topmenu(params._handler);
            this.section(params.section);
        }
    });
});