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
			this.briefVM = null;
			this.contentVM = null;

			this.childs = [
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
			if (!this.showing) {
				globalVM.func.showContainer(this.$container);
				this.showing = true;
			}
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		routeHandler: function () {
			var params = globalVM.router.params(),
				user = params.user || this.auth.iAm.login();

			if (params.photoUpload && !this.auth.loggedIn()) {
				this.auth.show('login', function (result) {
					if (result.loggedIn) {
						this.routeHandler();
					} else {
						globalVM.router.navigateToUrl('/');
					}
				}, this);
				return;
			}

			if (this.user && this.user.login() === user) {
				this.updateSectionDepends(params.section, params.photoUpload);
				this.show();
			} else {
				storage.user(user, function (data) {
					if (data) {
						this.user = data.vm;
						this.show();
						this.updateUserDepends();
						this.updateSectionDepends(params.section, params.photoUpload);
					}
				}, this);
			}

		},

		updateUserDepends: function () {
			if (this.briefVM) {
				this.briefVM.setUser(this.user.login());
			} else {
				renderer(
					[
						{
							module: 'm/user/brief', container: '#user_brief', options: {affix: true, user: this.user.login()},
							callback: function (vm) {
								this.briefVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 1
					}
				);
			}
		},
		updateSectionDepends: function (section, upload) {
			var module,
				moduleOptions = {container: '#user_content'};

			if (section === 'profile') {
				module = 'm/user/profile';
				Utils.title.setTitle({title: this.user.fullName()});
			} else if (section === 'photos' || section === 'photo') {
				module = 'm/user/gallery';
				moduleOptions.options = {canAdd: true};
				if (upload) {
					if (this.contentVM && this.contentVM.module === module) {
						this.contentVM.showUpload();
					} else {
						moduleOptions.options.goUpload = true;
					}
				}
				Utils.title.setTitle({pre: 'Галерея - ', title: this.user.fullName()});
			} else if (section === 'comments') {
				module = 'm/user/comments';
				Utils.title.setTitle({pre: 'Комментарии - ', title: this.user.fullName()});
			} else if (section === 'settings') {
				module = 'm/user/settings';
				Utils.title.setTitle({pre: 'Настройки - ', title: this.user.fullName()});
			}

			if (this.menuVM) {
				this.menuVM.setSection(section);
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