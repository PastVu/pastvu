/*global define:true*/
/**
 * Модель статистики пользователя
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User', 'text!tpl/user/brief.jade', 'css!style/user/brief', 'bs/bootstrap-affix'], function (_, P, ko, Cliche, globalVM, storage, User, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			userVM: null,
			userLogin: ''
		},
		create: function () {
			this.userInited = false;
			this.auth = globalVM.repository['m/common/auth'];

			this.rn = ko.observable('');
			this.rc = ko.observable('');

			this.avaexe = ko.observable(false);
			this.avaction = ko.observable(false);
			this.avaActionToggleBind = this.avaActionToggle.bind(this);

			if (this.options.userVM) {
				this.user = this.options.userVM;
				this.updateUserDepends();
				this.makeBinding();
			} else {
				this.options.userLogin = this.options.userLogin || globalVM.router.params().user || (this.auth.loggedIn() && this.auth.iAm.login());
				if (this.options.userLogin) {
					this.updateUser(this.options.userLogin);
				}
			}
			this.subscriptions.userChange = undefined;
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			$(document).off('click', this.avaActionToggleBind);
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		updateUser: function (login) {
			storage.user(login, function (data) {
				if (data) {
					if (this.subscriptions.userChange && this.subscriptions.userChange.dispose) {
						this.subscriptions.userChange.dispose();
						delete this.subscriptions.userChange;
					}
					if (this.auth.loggedIn() && data.vm.login() === this.auth.iAm.login()) {
						this.subscriptions.userChange = data.vm._v_.subscribe(function () {
							this.updateUserVM(login);
						}, this);
					}
					this.updateUserVM(login);

					if (!this.userInited) {
						this.makeBinding();
					}
				}
			}, this);
		},
		updateUserVM: function (login) {
			this.user = User.vm(storage.userImmediate(login).origin, this.user, true);
			this.updateUserDepends();
		},
		updateUserDepends: function () {
			this.rc(this.user.role() > 9 ? 'adm' : (this.user.role() > 4 ? 'mod' : ''));
			this.rn(this.user.role() > 9 ? '[Administrator]' : (this.user.role() > 4 ? '[Moderator]' : ''));
		},
		makeBinding: function () {
			this.can_pm = this.co.can_pm = ko.computed({
				read: function () {
					return this.auth.loggedIn() && (this.auth.iAm.login() !== this.user.login());
				},
				owner: this
			});
			this.can_avatar = this.co.can_avatar = ko.computed({
				read: function () {
					return this.auth.loggedIn() && (this.auth.iAm.login() === this.user.login());
				},
				owner: this
			});

			ko.applyBindings(globalVM, this.$dom[0]);

			if (this.options.affix) {
				this.$dom.affix({
					offset: {
						top: 40
					},
					addClasses: 'span2-3'
				});
			}
			this.userInited = true;
			this.show();

			this.subscriptions.canAvatarSubscr = this.can_avatar.subscribe(this.avaUploadSwitch, this);
			this.avaUploadSwitch(this.can_avatar());
		},

		avaActionToggle: function (vm, e) {
			var event = e || vm; //Среагировав на клик vm будет событием

			this.avaction(!this.avaction());
			if (this.avaction()) {
				$(document).on('click', this.avaActionToggleBind);
			} else {
				$(document).off('click', this.avaActionToggleBind);
			}
			if (event.stopPropagation) {
				event.stopPropagation();
			}
			return false;
		},
		avaSelect: function (vm, e) {
			if (e.stopPropagation) {
				e.stopPropagation();
			}
			//Генерируем клик по инпуту, выключив перед этим клики по документу,
			//а потом опять его включив, чтобы не сработал его хендлер и не закрыл кнопки
			$(document).off('click', this.avaActionToggleBind);
			this.$dom.find('.avaInput').trigger('click');
			$(document).on('click', this.avaActionToggleBind);
			return false;
		},
		avaDel: function (vm, e) {
			if (e.stopPropagation) {
				e.stopPropagation();
			}
			return false;
		},

		avaUploadSwitch: function (val) {
			if (val && !this.$fileupload) {
				require(['jfileupload/jquery.iframe-transport', 'jfileupload/jquery.fileupload'], function () {
					this.$fileupload = this.$dom.find('.avaInput');
					this.$fileupload.fileupload();
					this.$fileupload.fileupload('option', {
						url: 'http://' + P.settings.server.domain() + ':' + P.settings.server.uport() + '/uploadava',
						dataType: 'json',
						dropZone: null,
						pasteZone: null,

						//add: this.avaAdd.bind(this),
						submit: this.avaSubmit.bind(this),
						done: this.avaDone.bind(this),
						fail: this.avaFail.bind(this)
					});
				}.bind(this));

			}
			if (!val && this.$fileupload) {
				this.$fileupload.fileupload('disable');
				this.$fileupload.fileupload('destroy');
				delete this.$fileupload;
			}
		},
		avaSubmit: function (e, data) {
			this.avaexe(true);
		},
		avaDone: function (e, data) {
			$.each(data.result.files, function (index, file) {
				console.dir(file);
			});
			this.avaexe(false);
		},
		avaFail: function (e, data) {
			$.each(data.result.files, function (index, file) {
				console.dir(file);
			});
			this.avaexe(false);
		},

		onAvaLoad: function (data, event) {
			$(event.target).animate({opacity: 1});
		},
		onAvaError: function (data, event) {
			$(event.target).attr('src', '/img/caps/avatar.png');
		}
	});
});