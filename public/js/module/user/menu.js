/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/storage', 'text!tpl/user/menu.jade', 'css!style/user/menu'], function (_, P, ko, Cliche, globalVM, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			section: 'profile'
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.activeSection = ko.observable(this.options.section);

			var user = globalVM.router.params().user || this.auth.iAm.login();
			storage.user(user, function (data) {
				if (data) {
					this.user = data.vm;

					this.links = ko.computed(function () {
						var loggedIn = this.auth.loggedIn(),
							result = [
							{name: 'Profile', href: "/u/" + this.user.login(), section: 'profile'},
							{name: 'Photos', href: "/u/" + this.user.login() + "/photo", section: 'photo'},
							{name: 'Comments', href: "/u/" + this.user.login() + "/comments/", section: 'comments'}
						];

						if (loggedIn && (this.auth.iAm.login() === this.user.login())) {
							result.push({name: 'Settings', href: "/u/" + this.user.login() + "/settings", section: 'settings'});
							result.push({name: 'Messages', href: "/u/" + this.user.login() + '/pm', disable: true, section: 'pm'});
						}
						return result;
					}, this);

					ko.applyBindings(globalVM, this.$dom[0]);
					this.show();
				}
			}, this);

		},
		show: function () {
			this.showing = true;
		},
		hide: function () {
			this.showing = false;
		},
		setSection: function (section) {
			this.activeSection(section);
		}
	});
});