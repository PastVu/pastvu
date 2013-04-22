/*global define:true*/
/**
 * Модель содержимого страницы пользователя
 */
define(['underscore', 'Utils', 'Params', 'renderer', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/storage', 'm/Photo', 'text!tpl/user/userPage.jade', 'css!style/user/userPage'], function (_, Utils, P, renderer, ko, ko_mapping, Cliche, globalVM, storage, Photo, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.contentVM = null;

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
					module: 'm/user/menu', container: '#user_menu', options: {section: globalVM.router.params().section},
					ctx: this,
					callback: function (vm) {
						this.menuVM = vm;
						this.childModules[vm.id] = vm;
					}
				}
			];

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
			this.routeHandler();
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
				module,
				moduleOptions = {container: '#user_content'};

			if (!_.isEmpty(params.section)) {
				if (params.section === 'profile') {
					module = 'm/user/profile';
				} else if (params.section === 'photos' || params.section === 'photo') {
					module = 'm/user/gallery';
					moduleOptions.options = {canAdd: true};
					if (params.photoUpload) {
						if (this.contentVM && this.contentVM.module === module) {
							this.contentVM.showUpload();
						} else {
							moduleOptions.options.goUpload = true;
						}
					}
				} else if (params.section === 'comments') {
					module = 'm/user/comments';
				} else if (params.section === 'settings') {
					module = 'm/user/settings';
				}
			} else {
				module = 'm/user/profile';
			}

			if (this.menuVM) {
				this.menuVM.setSection(params.section);
			}

			if (!this.contentVM || this.contentVM.module !== module) {
				moduleOptions.module = module;
				renderer(
					[
						_.assign(moduleOptions, {
							callback: function (vm) {
								this.contentVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						})
					],
					{
						parent: this,
						level: this.level + 2 //Чтобы не удалились модули brief и menu на уровне this.level + 1
					}
				);
			}
		}
	});
});