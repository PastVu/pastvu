/*global define:true*/
/**
 * Модель управления пользователем
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/User', 'model/storage', 'text!tpl/user/manage.jade', 'css!style/user/manage', 'bs/collapse'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, User, storage, jade) {
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
			this.u_origin = storage.userImmediate(this.u.login()).origin;

			if (this.auth.iAm.role() < 10) {
				globalVM.router.navigateToUrl('/u/' + this.u.login());
			}

			this.role = ko.observable(String(this.u.role()));
			this.roles = [
				{cat: 'reg', name: 'Обычный пользователь'},
				{cat: 'mod', name: 'Модератор'},
				{cat: 'adm', name: 'Администратор'},
				{cat: 'sadm', name: 'Суперадминистратор'}
			];
			this.roleCategory = ko.computed({
				read: function () {
					switch (Number(this.role())) {
					case 4:
					case 5:
						return 'mod';
					case 10:
						return 'adm';
					case 11:
						return 'sadm';
					case 0:
						return 'reg';
					default:
						return 'reg';
					}
				},
				write: function (value) {
					switch (value) {
					case 'mod':
						this.role('5');
						break;
					case 'adm':
						this.role('10');
						break;
					case 'sadm':
						this.role('11');
						break;
					case 'reg':
						this.role('0');
						break;
					default:
						this.role('0');
					}
				},
				owner: this
			});
			this.newRegions = ko.observableArray(this.u_origin.mod_regions);
			this.credentialsChanged = this.co.credentialsChanged = ko.computed(function () {
				return Number(this.role()) !== this.u.role() || !_.isEqual(this.u_origin.mod_regions, this.newRegions());
			}, this);

			this.ranks = ko.observableArray();

			this.getAllRanks(function () {
				this.subscriptions.ranks = this.u.ranks.subscribe(_.debounce(this.ranksSelectedHandler, 1000), this);

				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}, this);
		},
		show: function () {
			this.$dom.find("#accordion").collapse({
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

		saveCredentials: function (data, event) {
			var regions, role = Number(this.role());
			if (role === 5 && !_.isEqual(this.u_origin.mod_regions, this.newRegions())) {
				regions = _.pluck(this.newRegions(), 'cid');
			}
			socket.once('saveUserCredentialsResult', function (data) {
				var error = !data || data.error || !data.saved;
				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					User.vm({mod_regions: regions}, this.u, true);
				}
			}.bind(this));
			socket.emit('saveUserCredentials', {login: this.u.login(), role: role, regions: regions});
		},
		cancelCredentials: function (data, event) {

		},
		regionSelect: function () {
			if (!this.regselectVM) {
				renderer(
					[
						{
							module: 'm/region/select',
							options: {
								min: 0,
								max: 20,
								selectedInit: this.newRegions()
							},
							modal: {
								initWidth: '900px',
								maxWidthRatio: 0.95,
								fullHeight: true,
								withScroll: true,
								topic: 'Изменение списка регионов для отслеживания',
								closeTxt: 'Сохранить',
								closeFunc: function (evt) {
									evt.stopPropagation();
									var regions = this.regselectVM.getSelectedRegions(['cid', 'title_local']);

									if (regions.length > 20) {
										window.noty({text: 'Допускается выбирать до 20 регионов', type: 'error', layout: 'center', timeout: 3000, force: true});
										return;
									}
									this.newRegions(regions);
									this.closeRegionSelect();
								}.bind(this)},
							callback: function (vm) {
								this.regselectVM = vm;
								this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 1
					}
				);
			}
		},
		closeRegionSelect: function () {
			if (this.regselectVM) {
				this.regselectVM.destroy();
				delete this.regselectVM;
			}
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