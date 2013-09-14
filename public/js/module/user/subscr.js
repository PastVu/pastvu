/*global define:true*/
/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/User', 'model/storage', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/bootstrap-collapse' ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

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

				this.itsMe = this.co.itsMe = ko.computed(function () {
					return this.auth.iAm.login() === this.u.login();
				}, this);

				this.showName = this.co.showName = ko.computed(function () {
					return this.u.disp() !== this.u.login();
				}, this);

				this.getSettingsVars(function () {
					this.subscriptions.subscr_throttle = this.u.settings.subscr_throttle.subscribe(_.debounce(this.subscr_throttleHandler, 700), this);

					ko.applyBindings(globalVM, this.$dom[0]);
					this.show();
				}, this);
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
		getSettingsVars: function (cb, ctx) {
			socket.once('takeUserSettingsVars', function (result) {
				if (result && !result.error) {
					this.vars = result;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('giveUserSettingsVars');
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		autoReply: function (data, evt) {
			this.changeSetting('subscr_auto_reply', !!evt.target.classList.contains('yes'), true);
		},
		subscr_throttleHandler: function (val) {
			//Изначальное значение число. А во время изменения radio в knockout это всегда будет строка
			//Соответственно нам нужно отправлять на изменение только когда строка
			//Если число, значит установилось в callback после отправки серверу
			if (typeof val === 'string') {
				this.changeSetting('subscr_throttle', Number(val));
			}
		},
		changeSetting: function (key, val, checkValChange, cb, ctx) {
			if (!this.u.settings[key] || (checkValChange && val === this.u.settings[key]())) {
				return;
			}
			socket.once('changeUserSettingResult', function (result) {
				if (result && !result.error && result.saved) {
					this.u.settings[result.key](result.val);
					this.originUser.settings[result.key] = result.val;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('changeUserSetting', {login: this.u.login(), key: key, val: val});
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
			if (this.editEmail()) {
				if (this.u.email() !== this.originUser.email) {
					this.sendEmail();
				} else {
					this.editEmail(false);
				}
			} else {
				this.editEmail(true);
			}
		},
		sendEmail: function (pass) {
			socket.once('changeEmailResult', function (result) {
				if (result && !result.error) {
					if (result.confirm === 'pass') {
						this.auth.show('passInput', function (pass, cancel) {
							if (!cancel) {
								this.sendEmail(pass);
							}
						}, this);
					} else if (result.email) {
						this.u.email(result.email);
						this.originUser.email = result.email;
						this.editEmail(false);
						this.auth.passInputSet(result);
					}
				} else {
					if (pass) {
						this.auth.passInputSet(result);
					} else {
						window.noty({text: result.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					}
				}
			}.bind(this));
			socket.emit('changeEmail', {login: this.u.login(), email: this.u.email(), pass: pass});

		},
		cancelEmail: function () {
			if (this.editEmail()) {
				this.u.email(this.originUser.email);
				this.editEmail(false);
			}
		}
	});
});