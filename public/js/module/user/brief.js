/*global requirejs:true, require:true, define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/storage', 'text!tpl/user/brief.jade', 'css!style/user/brief', 'bs/bootstrap-affix' ], function (_, P, ko, Cliche, globalVM, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/auth'];

			var user = globalVM.router.params().user || this.auth.iAm.login();

			storage.user(user, function (data) {
				if (data) {
					this.user = data.vm;

					this.can_pm = ko.computed({
						read: function () {
							return P.settings.LoggedIn() && (this.auth.iAm.login() !== this.user.login());
						},
						owner: this
					});
					this.can_avatar = ko.computed({
						read: function () {
							return this.auth.iAm.login() === this.user.login();
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
				}
			}, this);

		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
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