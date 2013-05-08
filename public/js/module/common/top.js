/*global define:true*/
/**
 * Модель управляет верхней панелью
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/common/top.jade', 'css!style/common/top', 'm/common/auth' ], function (_, P, ko, Cliche, globalVM, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];

			this.registrationAllowed = this.co.registrationAllowed = ko.computed({
				read: function () {
					return P.settings.REGISTRATION_ALLOWED();
				},
				owner: this
			});
			this.profile = this.co.profile = ko.computed({
				read: function () {
					if (this.auth.loggedIn()) {
						return this.auth.iAm.fullName();
					} else {
						return '';
					}
				},
				owner: this
			}).extend({ throttle: 50 });
			this.profileAvatar = this.co.profileAvatar = ko.computed({
				read: function () {
					if (this.auth.loggedIn()) {
						return this.auth.iAm.avatarth();
					} else {
						return '';
					}
				},
				owner: this
			});

			this.msg = ko.observable('');
			this.msgCss = ko.observable('');

			ko.applyBindings(globalVM, this.$dom[0]);
		},
		show: function () {
			globalVM.pb.subscribe('/top/message', function (text, type) {
				var css = '';
				switch (type) {
				case 'error':
					css = 'text-error';
					break;
				case 'warn':
					css = 'text-warning';
					break;
				case 'info':
					css = 'text-info';
					break;
				case 'success':
					css = 'text-success';
					break;
				default:
					css = 'muted';
					break;
				}

				this.msg(text);
				this.msgCss(css);

				text = type = css = null;
			}.bind(this));

			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		}
	});
});