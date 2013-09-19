/*global define:true*/
/**
 * Модель управления пользователем
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/User', 'model/storage', 'text!tpl/user/manage.jade', 'css!style/user/manage', 'bs/bootstrap-collapse'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	var ranksLang = {
		mec: 'Меценат',
		mec_silv: 'Серебряный меценат',
		mec_gold: 'Золотой меценат'
	};

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.u = this.options.userVM;

			if (this.auth.iAm.role() < 10) {
				globalVM.router.navigateToUrl('/u/' + this.u.login());
			}
			this.originUser = storage.userImmediate(this.u.login()).origin;
			this.ranks = ko.observableArray();

			this.getAllRanks(function () {
				//this.subscriptions.ranks_throttle = this.u.settings.ranks_throttle.subscribe(_.debounce(this.subscr_throttleHandler, 700), this);

				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}, this);
		},
		show: function () {
			this.$dom.find("#accordion2 .collapse").collapse({
				toggle: false
			});
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		getAllRanks: function (cb, ctx) {
			socket.once('takeUserAllRanks', function (result) {
				if (result && !result.error) {
					for (var i in result) {
						if (result.hasOwnProperty(i)) {
							this.ranks.push({key: i, desc: ranksLang[i] || i});
						}
					}
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('giveUserAllRanks');
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
		}
	});
});