/**
 * Модель верхнего меню админки
 */
define(['underscore', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'text!tpl/admin/menu.pug', 'css!style/admin/menu'], function (_, ko, ko_mapping, Cliche, globalVM, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];

            this.section = ko.observable('');
            this.menuItems = [
                { name: 'Common', href: '/admin', section: 'index' },
                { name: 'Map', href: '/admin/map', section: 'map' },
                { name: 'Regions', href: '/admin/region', section: 'region' },
                { name: 'Photos', href: '/admin/photo', section: 'photo' },
            ];

            ko.applyBindings(globalVM, this.$dom[0]);

            // Subscriptions
            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
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
            const params = globalVM.router.params();

            this.section(params._handler);
        },
    });
});
