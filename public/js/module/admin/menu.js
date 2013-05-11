/*global define:true*/
/**
 * Модель содержимого страницы пользователя
 */
define(['underscore', 'Utils', 'Params', 'renderer', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User', 'text!tpl/user/userPage.jade', 'css!style/user/userPage'], function (_, Utils, P, renderer, ko, ko_mapping, Cliche, globalVM, storage, User, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];

			this.section = ko.observable('');
			this.menuItems = [
				{name: 'Common', href: "/admin", section: 'index'},
				{name: 'Map', href: "/admin/map", section: 'map'},
				{name: 'Photos', href: "/admin/photo", section: 'photo'}
			];

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

			this.section(params._handler);
		}
	});
});