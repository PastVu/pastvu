/*global define:true*/
/**
 * Модель содержимого основной страницы
 */
define(['underscore', 'Utils', 'Params', 'renderer', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/storage', 'm/Photo', 'text!tpl/user/userPage.jade', 'css!style/user/userPage'], function (_, Utils, P, renderer, ko, ko_mapping, Cliche, globalVM, storage, Photo, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {

			var user = globalVM.router.params().user || this.auth.iAm.login();
			storage.user(user, function (data) {
				if (data) {
					this.user = data.vm;
					this.show();
				}
			}, this);

			this.childs = [
				{
					module: 'm/user/brief', container: '#user_brief', options: {affix: true},
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
					}
				},
				{
					module: 'm/user/menu', container: '#user_menu',
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
					}
				}
			];

			ko.applyBindings(globalVM, this.$dom[0]);
			this.routeHandler();

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		routeHandler: function () {
			var params = globalVM.router.params(),
				moduleOptions = {module: 'm/user/profile', container: '#user_content'};

			if (params.section === 'photos' || params.section === 'photo') {
				moduleOptions = {module: 'm/user/gallery', container: '#user_content', options: {canAdd: true}};
			} else if (params.section === 'comments') {
				moduleOptions = {module: 'm/user/comments', container: '#user_content'};
			} else if (params.section === 'settings') {
				moduleOptions = {module: 'm/user/settings', container: '#user_content'};
			}
			renderer(
				[
					_.assign(moduleOptions, {
						callback: function (vm) {
							this.uploadVM = vm;
						}.bind(this)
					})
				],
				{
					parent: this,
					level: this.level + 2 //Чтобы не удалились модули brief и menu на уровне this.level + 1
				}
			);
		}
	});
});