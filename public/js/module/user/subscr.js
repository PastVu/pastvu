/*global define:true*/
/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/User', 'model/storage', 'text!tpl/user/subscr.jade', 'css!style/user/subscr'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
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
				this.itsMe = this.co.itsMe = ko.computed(function () {
					return this.auth.iAm.login() === this.u.login();
				}, this);

				this.getObjects(function () {
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
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		getObjects: function (cb, ctx) {
			socket.once('takeUserSubscr', function (result) {
				if (result && !result.error) {
					this.vars = result;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('giveUserSubscr');
		},
		unSubsc: function (pass) {
			socket.once('changeEmailResult', function (result) {
			}.bind(this));
			socket.emit('changeEmail', {login: this.u.login(), email: this.u.email(), pass: pass});
		}
	});
});