/*global define:true, ga:true*/
/**
 * Модель содержимого страницы пользователя
 */
define(['underscore', 'Utils', 'Params', 'renderer', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User', 'text!tpl/user/userPage.jade', 'css!style/user/userPage'], function (_, Utils, P, renderer, ko, ko_mapping, Cliche, globalVM, storage, User, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.briefVM = null;
			this.contentVM = null;

			this.user = null;
			this.section = null;
			this.menuItems = null;

			// Subscriptions
			this.subscriptions.userChange = undefined;
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}
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
		makeBinding: function () {
			if (!this.userInited) {
				this.section = ko.observable('');
				this.menuItems = this.co.menuItems = ko.computed(function () {
					var login = this.user.login(),
						result = [
							{name: 'Профиль', href: "/u/" + login, section: 'profile'},
							{name: 'Фотографии', href: "/u/" + login + "/photo", section: 'photo'},
							{name: 'Комментарии', href: "/u/" + login + "/comments", section: 'comments'}
						];

					if (this.auth.loggedIn() && (this.auth.iAm.login() === login)) {
						result.push({name: 'Настройки', href: "/u/" + login + "/settings", section: 'settings'});
						result.push({name: 'Messages', href: "/u/" + login + '/pm', disable: true, section: 'pm'});
					}
					return result;
				}, this);

				ko.applyBindings(globalVM, this.$dom[0]);
				this.userInited = true;
			}
		},
		routeHandler: function () {
			var params = globalVM.router.params(),
				login = params.user || this.auth.iAm.login();

			// Если перешли на url загрузки, проверяем залогиненность.
			// Если не залогинен выводим форму авторизации и по успешному коллбеку запускаем page заново
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

			if (this.user && this.user.login() === login) {
				// Если юзер уже есть и не поменялся, значит надо просто обновить секцию
				this.updateSectionDepends(params.section, params.photoUpload);
			} else {
				// Если пользователя нет или он сменлился, то обрабатываем его и по завершении обновляем секцию
				this.processStorageUser(login, function () {
					this.updateSectionDepends(params.section, params.photoUpload);
				}, this);
			}
		},
		processStorageUser: function (login, cb, ctx) {
			storage.user(login, function (data) {
				if (data) {
					// Если от предыдущего осталась подписка на изменение - удаляем ее
					if (this.subscriptions.userChange && this.subscriptions.userChange.dispose) {
						this.subscriptions.userChange.dispose();
						delete this.subscriptions.userChange;
					}
					// Если пользователь равен залогиненому, то подписываемся на изменение его оригинальной модели
					if (this.auth.loggedIn() && data.vm.login() === this.auth.iAm.login()) {
						this.subscriptions.userChange = data.vm._v_.subscribe(function () {
							this.updateUserVM(login);
						}, this);
					}
					this.updateUserVM(login);

					// При первой инициализации юзера мы должны забайндить модель до запроса зависимых модулей
					this.makeBinding();
					this.show();

					this.updateUserDepends();

					if (Utils.isType('function', cb)) {
						cb.call(ctx || window);
					}
				}
			}, this);
		},
		loggedInHandler: function () {
			// После логина приверяем если мы находимся на своем юзере, тогда апдейтим и подписываемся
			if (this.user && this.auth.iAm.login() === this.user.login()) {
				this.processStorageUser(this.user.login());
			}
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		updateUserVM: function (login) {
			this.user = User.vm(storage.userImmediate(login).origin, this.user, true);
		},
		updateUserDepends: function () {
			if (!this.briefVM) {
				renderer(
					[
						{
							module: 'm/user/brief', container: '#user_brief', options: {affix: true, userVM: this.user},
							callback: function (vm) {
								this.briefVM = this.childModules[vm.id] = vm;
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
				moduleOptions = {container: '#user_content', options: {userVM: this.user}};

			if (section === 'profile') {
				module = 'm/user/profile';
				Utils.title.setTitle({title: this.user.disp()});
			} else if (section === 'photos' || section === 'photo') {
				module = 'm/user/gallery';
				moduleOptions.options.canAdd = true;
				if (upload) {
					if (this.contentVM && this.contentVM.module === module) {
						this.contentVM.showUpload();
					} else {
						moduleOptions.options.goUpload = true;
					}
					Utils.title.setTitle({pre: 'Загрузка - ', title: this.user.disp()});
				} else {
					Utils.title.setTitle({pre: 'Галерея - ', title: this.user.disp()});
				}
			} else if (section === 'comments') {
				module = 'm/user/comments';
				Utils.title.setTitle({pre: 'Комментарии - ', title: this.user.disp()});
			} else if (section === 'settings') {
				module = 'm/user/settings';
				Utils.title.setTitle({pre: 'Настройки - ', title: this.user.disp()});
			}

			this.section(section);
			ga('send', 'pageview');

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