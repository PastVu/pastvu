/*global define:true*/
/**
 * Модель левого подменю админки
 */
define(['underscore', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'text!tpl/admin/submenu.jade', 'css!style/admin/submenu'], function (_, ko, ko_mapping, Cliche, globalVM, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];

			this.submenus = {
				index: [
					{name: 'Главная', href: "/admin", section: 'main'},
					{name: 'Новости', href: "/admin/news", section: 'news'}
				],
				map: [
					{name: 'Clusters', href: "/admin/map/cluster", section: 'cluster'}
				],
				photo: [
					{name: 'Conveyer', href: "/admin/photo/conveyer", section: 'conveyer'}
				],
				region: [
					{name: 'Regions', href: "/admin/region", section: 'region'},
					{name: 'Region check', href: "/admin/regionCheck", section: 'regionCheck'}
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
			var params = globalVM.router.params();

			this.topmenu(params._handler);
			this.section(params.section);
		}
	});
});