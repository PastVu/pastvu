/*global define:true, ga:true*/
/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Region', 'model/User', 'model/storage', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/collapse' ], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Region, User, storage, jade) {
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
			this.$dom.find("#accordion").collapse({
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
		regionUserGal: function (data, evt) {
			this.changeSetting('r_f_user_gal', !!evt.target.classList.contains('yes'), true);
		},
		regionPhotoUserGal: function (data, evt) {
			this.changeSetting('r_f_photo_user_gal', !!evt.target.classList.contains('yes'), true);
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
		},

		saveHomeRegion: function (cid, cb, ctx) {
			socket.once('saveUserHomeRegionResult', function (data) {
				var error = !data || data.error || !data.saved;
				if (error) {
					window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				}
				cb.call(ctx, error, data);
			}.bind(this));
			socket.emit('saveUserHomeRegion', {login: this.u.login(), cid: cid});
		},
		saveFilterRegions: function (regions, cb, ctx) {
			socket.once('saveUserRegionsResult', function (data) {
				var error = !data || data.error || !data.saved;
				if (error) {
					window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				}
				cb.call(ctx, error);
			}.bind(this));
			socket.emit('saveUserRegions', {login: this.u.login(), regions: regions});
		},
		regionDrop: function (cid) {
			if (cid) {
				this.u.regions.remove(function (item) {
					return item.cid() === cid;
				});
				var regions = ko_mapping.toJS(this.u.regions);
				this.saveFilterRegions(_.pluck(regions, 'cid'), function (err) {
					if (!err) {
						this.originUser.regions = regions;
						ga('send', 'event', 'region', 'update', 'photo update success', regions.length);
					}
				}, this);
			}
		},
		regionHomeSelect: function () {
			if (!this.regHomeselectVM) {
				this.regionSelect([ko_mapping.toJS(this.u.regionHome)], 1, 1, 'Выбор домашнего региона', function (vm) {
					this.regHomeselectVM = vm;
				}, function () {
					var regions = this.regHomeselectVM.getSelectedRegions(['cid', 'title_local']);

					if (regions.length !== 1) {
						window.noty({text: 'Необходимо выбрать один регион', type: 'error', layout: 'center', timeout: 2000, force: true});
						return;
					}

					this.saveHomeRegion(regions[0].cid, function (err, data) {
						if (!err) {
							User.vm({regionHome: Region.factory(data.region, 'home')}, this.u, true); //Обновляем регионы в текущей вкладке вручную
							this.originUser.regionHome = data.region;

							this.regHomeselectVM.destroy();
							delete this.regHomeselectVM;

							ga('send', 'event', 'region', 'update', 'region update success', regions.length);
						}
					}, this);
				}, this);
			}
		},
		regionFilterSelect: function () {
			if (!this.regselectVM) {
				this.regionSelect(ko_mapping.toJS(this.u.regions), 0, 5, 'Изменение списка регионов для фильтрации по умолчанию', function (vm) {
					this.regselectVM = vm;
				}, function () {
					var regions = this.regselectVM.getSelectedRegions(['cid', 'title_local']);

					if (regions.length > 5) {
						window.noty({text: 'Допускается выбирать до 5 регионов', type: 'error', layout: 'center', timeout: 3000, force: true});
						return;
					}

					this.saveFilterRegions(_.pluck(regions, 'cid'), function (err) {
						if (!err) {
							User.vm({regions: regions}, this.u, true); //Обновляем регионы в текущей вкладке вручную
							this.originUser.regions = regions;

							this.regselectVM.destroy();
							delete this.regselectVM;

							ga('send', 'event', 'region', 'update', 'region update success', regions.length);
						}
					}, this);
				}, this);
			}
		},
		regionSelect: function (selected, min, max, title, onRender, onClose, ctx) {
			renderer(
				[
					{
						module: 'm/region/select',
						options: {
							min: min,
							max: max,
							selectedInit: selected
						},
						modal: {
							initWidth: '900px',
							maxWidthRatio: 0.95,
							fullHeight: true,
							withScroll: true,
							topic: title,
							closeTxt: 'Сохранить',
							closeFunc: function (evt) {
								evt.stopPropagation();
								onClose.call(ctx);
							}.bind(this)},
						callback: function (vm) {
							this.childModules[vm.id] = vm;
							onRender.call(ctx, vm);
						}.bind(this)
					}
				],
				{
					parent: this,
					level: this.level + 1
				}
			);
		}
	});
});