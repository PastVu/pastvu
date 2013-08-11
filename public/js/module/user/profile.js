/*global define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/User', 'model/storage', 'text!tpl/user/profile.jade', 'css!style/user/profile', 'bs/bootstrap-datepicker', 'css!style/bootstrap-datepicker' ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];

			this.u = this.options.userVM;
			this.originUser = storage.userImmediate(this.u.login()).origin;

			this.edit = ko.observable(false);

			this.canBeEdit = this.co.canBeEdit = ko.computed(function () {
				return this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9;
			}, this);

			this.editMode = this.co.editMode = ko.computed(function () {
				return this.canBeEdit() && this.edit();
			}, this);

			ko.applyBindings(globalVM, this.$dom[0]);

			window.setTimeout(function () {
				if (this.$dom instanceof jQuery) {
					this.$dom
						.find('.birthPick')
						.datepicker()
						.on('changeDate', function (evt) {
							this.u.birthdate(this.$dom.find('#inBirthdate').val());
						}.bind(this));
				}
			}.bind(this), 1000);

			this.show();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		saveUser: function () {
			var target = _.pick(ko_mapping.toJS(this.u), 'firstName', 'lastName', 'birthdate', 'sex', 'country', 'city', 'work', 'www', 'icq', 'skype', 'aim', 'lj', 'flickr', 'blogger', 'aboutme'),
				key;

			for (key in target) {
				if (target.hasOwnProperty(key)) {
					if (!_.isUndefined(this.originUser[key]) && _.isEqual(target[key], this.originUser[key])) {
						delete target[key];
					} else if (_.isUndefined(this.originUser[key]) && _.isEqual(target[key], User.def.full[key])) {
						delete target[key];
					}
				}
			}
			if (Utils.getObjectPropertyLength(target) > 0) {
				target.login = this.u.login();
				socket.once('saveUserResult', function (result) {
					if (result && !result.error && result.saved) {
						_.assign(this.originUser, target);
						this.edit(false);
					}
				}.bind(this));
				socket.emit('saveUser', target);
			}
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