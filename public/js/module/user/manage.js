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
				this.subscriptions.ranks = this.u.ranks.subscribe(_.debounce(this.ranksSelectedHandler, 1000), this);

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
					for (var i = 0; i < result.length; i++) {
						this.ranks.push({key: result[i], desc: ranksLang[result[i]] || i});
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

		ranksSelectedHandler: function (val) {
			this.saveUserRanks();
		},
		saveUserRanks: function (cb, ctx) {
			socket.once('saveUserRanksResult', function (result) {
				if (!result || result.error || !result.saved) {
					window.noty({text: result && result.message || 'Ошибка сохранения звания', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					this.originUser.ranks = result.ranks;
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx, result);
				}
			}.bind(this));
			socket.emit('saveUserRanks', {login: this.u.login(), ranks: this.u.ranks()});
		}
	});
});