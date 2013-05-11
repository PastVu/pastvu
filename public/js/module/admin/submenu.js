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

			this.section = ko.observable('');
			this.menuItems = ko.observableArray();
			this.submenus = {
				index: [
					{name: 'News', href: "/admin/news", section: 'news'}
				],
				map: [
					{name: 'Clusters', href: "/admin/map/cluster", section: 'cluster'}
				],
				photo: [
					{name: 'Conveyer', href: "/admin/photo/conveyer", section: 'conveyer'}
				]
			};

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
			this.routeHandler();
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

			this.menuItems(this.submenus[params._handler]);
			this.section(params.section);
		}
	});
});