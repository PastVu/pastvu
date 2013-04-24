/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/storage', 'm/User', 'text!tpl/user/brief.jade', 'css!style/user/brief', 'bs/bootstrap-affix' ], function (_, P, ko, Cliche, globalVM, storage, User, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			user: ''
		},
		create: function () {
			this.userInited = false;
			this.auth = globalVM.repository['m/common/auth'];

			this.user = null;
			if (this.options.user) {
				this.setUser(this.options.user);
			}
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		setUser: function (login) {
			storage.user(login, function (data) {
				if (data) {
					this.user = User.vm(data.origin, this.user);

					if (!this.userInited) {
						this.makeVM();
					}
				}
			}, this);
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