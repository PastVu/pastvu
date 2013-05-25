/*global define:true*/
/**
 * Модель профиля пользователя
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
			this.originUser = storage.userImmediate(this.u.login()).origin;
			this.editEmail = ko.observable(false);

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
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

		saveEmail: function () {
			if (this.editEmail() === true) {
				socket.emit('saveUser', {login: this.u.login(), email: this.u.email()});
			}
			this.editEmail(!this.editEmail());
		},

		saveUser: function () {
			var targetUser = ko_mapping.toJS(this.u),
				key;

			for (key in targetUser) {
				if (targetUser.hasOwnProperty(key) && key !== 'login') {
					if (this.originUser[key] && (targetUser[key] === this.originUser[key])) {
						delete targetUser[key];
					} else if (!this.originUser[key] && (targetUser[key] === User.def.full[key])) {
						delete targetUser[key];
					}
				}
			}
			if (Utils.getObjectPropertyLength(targetUser) > 1) {
				socket.emit('saveUser', targetUser);
			}
			this.edit(false);

			targetUser = key = null;
		},
		cancelUser: function () {
			_.forEach(this.originUser, function (item, key) {
				if (Utils.isType('function', this.u[key]) && this.u[key]() !== item) {
					this.u[key](item);
				}
			}.bind(this));

			this.edit(false);
		}
	});
});