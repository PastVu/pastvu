/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/storage', 'm/User', 'text!tpl/user/brief.jade', 'css!style/user/brief', 'bs/bootstrap-affix' ], function (_, P, ko, Cliche, globalVM, storage, User, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null,
			userLogin: ''
		},
		create: function () {
			this.userInited = false;
			this.auth = globalVM.repository['m/common/auth'];

			if (this.options.userVM) {
				this.user = this.options.userVM;
				this.makeVM();
			} else {
				this.options.userLogin = this.options.userLogin || globalVM.router.params().user || (this.auth.loggedIn() && this.auth.iAm.login());
				if (this.options.userLogin) {
					this.updateUser(this.options.userLogin);
				}
			}
			this.subscriptions.userChange = undefined;
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		updateUser: function (login) {
			storage.user(login, function (data) {
				if (data) {
					if (this.subscriptions.userChange && this.subscriptions.userChange.dispose) {
						this.subscriptions.userChange.dispose();
						delete this.subscriptions.userChange;
					}
					if (this.auth.loggedIn() && data.vm.login() === this.auth.iAm.login()) {
						this.subscriptions.userChange = data.vm._v_.subscribe(function () {
							this.updateUserVM(login);
						}, this);
					}
					this.updateUserVM(login);

					if (!this.userInited) {
						this.makeVM();
					}
				}
			}, this);
		},
		updateUserVM: function (login) {
			this.user = User.vm(storage.userImmediate(login).origin, this.user);
		},
		makeVM: function () {
			this.can_pm = ko.computed({
				read: function () {
					return this.auth.loggedIn() && (this.auth.iAm.login() !== this.user.login());
				},
				owner: this
			});
			this.can_avatar = ko.computed({
				read: function () {
					return this.auth.loggedIn() && (this.auth.iAm.login() === this.user.login());
				},
				owner: this
			});

			ko.applyBindings(globalVM, this.$dom[0]);

			if (this.options.affix) {
				this.$dom.affix({
					offset: {
						top: 40
					},
					addClasses: 'span2-3'
				});
			}
			this.show();
			this.userInited = true;
		},
		onAvatarLoad: function (data, event) {
			$(event.target).animate({opacity: 1});
			data = event = null;
		},
		onAvatarError: function (data, event) {
			$(event.target).attr('src', '/img/caps/avatar.png');
			data = event = null;
		}
	});
});