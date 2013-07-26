/*global define:true*/
/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/User', 'model/storage', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/bootstrap-collapse' ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	ko.bindingHandlers.executeOnEnter = {
		init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
			var allBindings = allBindingsAccessor();
			$(element).keypress(function (event) {
				var keyCode = event.which || event.keyCode;
				if (keyCode === 13) {
					allBindings.executeOnEnter.call(viewModel);
					return false;
				}
				return true;
			});
		}
	};

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;

			if (this.auth.loggedIn() && (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9)) {
				this.originUser = storage.userImmediate(this.u.login()).origin;
				this.editEmail = ko.observable(false);

				this.showName = this.co.showName = ko.computed(function () {
					return this.u.disp() !== this.u.login();
				}, this);

				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			} else {
				globalVM.router.navigateToUrl('/u/' + this.u.login());
			}
		},
		show: function () {
			this.$dom.find("#accordion2 .collapse").collapse({
				toggle: false
			});
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		toggleDisp: function () {
			socket.once('changeDispNameResult', function (result) {
				if (result && !result.error && result.saved) {
					this.u.disp(result.disp);
					this.originUser.disp = result.disp;
				}
			}.bind(this));
			socket.emit('changeDispName', {login: this.u.login(), showName: !this.showName()});
		},

		saveEmail: function () {
			if (this.editEmail() === true) {
				if (this.u.email() !== this.originUser.email) {
					socket.once('changeEmailResult', function (result) {
						if (result && !result.error) {
							this.u.email(result.email);
							this.originUser.email = result.email;
							this.editEmail(false);
						} else {
							window.noty({text: result.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
						}
					}.bind(this));
					socket.emit('changeEmail', {login: this.u.login(), email: this.u.email()});
				} else {
					this.editEmail(false);
				}
			} else {
				this.editEmail(true);
			}
		}
	});
});