/*global define:true, ga:true*/
define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User', 'KeyHandler', 'text!tpl/common/auth.jade', 'css!style/common/auth'], function (_, $, Utils, socket, P, ko, Cliche, globalVM, storage, User, keyTarget, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.loggedIn = ko.observable(false);

			if (P.iAm) {
				this.processMe(P.iAm);
				delete P.iAm;
			} else {
				this.iAm = User.vm();
			}

			this.mode = ko.observable('');
			this.working = ko.observable(false);
			this.finish = ko.observable(false);

			this.login = ko.observable('');
			this.key = ko.observable('');

			this.avatar = ko.observable('');
			this.name = ko.observable('');


			this.msg = ko.observable('');
			this.caps = ko.observable(false);

			this.subscriptions.mode = this.mode.subscribe(function () {
				this.formFocus();
			}, this);

			//При изменении данных профиля на сервере, обновляем его на клиенте
			socket.on('youAre', this.processMe.bind(this));

			socket.on('command', this.commandHandler.bind(this));
			socket.on('connectData', this.reconnectHandler.bind(this));
			ko.applyBindings(globalVM, this.$dom[0]);
		},
		show: function (mode, callback, ctx) {
			if (mode) {
				this.mode(mode);
			}

			if (callback) {
				this.callback = callback;
				this.ctx = ctx || window;
			}

			globalVM.func.showContainer(this.$container, function () {
				this.showing = true;
				this.formFocus();

				keyTarget.push({
					id: 'authOverlay',
					stopFurther: false,
					onEsc: this.formClose.bind(this)
				});
			}, this);
		},
		hide: function () {
			keyTarget.pop();
			this.formReset();
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},

		showRecallRequest: function (login, callback, ctx) {
			this.login(login);
			this.show('recallRequestForMe', callback, ctx);
		},
		showPassChangeRecall: function (data, key, callback, ctx) {
			this.login(data.login);
			this.name(data.disp);
			this.avatar(data.avatar);
			this.key(key);
			this.show('passChangeRecall', callback, ctx);
		},

		pressHandler: function (vm, event) {
			this.caps(Utils.capsLockDetect(event));
			return true;
		},

		formFocus: function () {
			window.setTimeout(function () {
				try {
					this.$dom.children('form:visible')[0].querySelector('input:first-child:not([disabled])').focus();
				} catch (e) {
				}
			}.bind(this), 200);
		},
		formReset: function () {
			this.$dom.find(':focus').blur();
			this.$dom.find("input").val(null);
			this.$dom.find(".mess").height(0).removeClass('text-error text-warning text-info text-success muted');
			this.mode('');
			this.login('');
			this.name('');
			this.avatar('');
			this.key('');
			this.msg('');
			delete this.callback;
			delete this.ctx;
			this.formWorking(false);
			this.finish(false);
			this.caps(false);
		},
		formClose: function () {
			if (Utils.isType('function', this.callback)) {
				if (this.mode() === 'passInput') {
					this.callback.call(this.ctx, null, true);
				} else {
					this.callback.call(this.ctx, {loggedIn: false});
				}
			}
			this.hide();
		},
		formWorking: function (param) {
			this.working(param);
			this.$dom.find('form:visible').find('input, button').attr('disabled', param);
		},
		setMessage: function (text, type) {
			var css = '';
			switch (type) {
			case 'error':
				css = 'text-error';
				break;
			case 'warn':
				css = 'text-warning';
				break;
			case 'info':
				css = 'text-info';
				break;
			case 'success':
				css = 'text-success';
				break;
			default:
				css = 'muted';
				break;
			}

			this.msg(text);
			this.$dom.find('form:visible .mess')
				.addClass(css)
				.css({height: 5 + this.$dom.find('form:visible .mess > div').height()});

			text = type = css = null;
		},

		commandHandler: function (data) {
			if (!Array.isArray(data)) {
				return;
			}

			try {
				_.forEach(data, function (command) {
					if (command.name === 'clearCookie') {
						Utils.cookie.removeItem('pastvu.sid', '/');
					} else if (command.name === 'location') {
						if (command.path) {
							document.location = command.path;
						} else {
							location.reload();
						}
					}
				});
			} catch (e) {
				console.log(e.message);
			}

			socket.emit('commandResult', data);
		},

		submit: function (data, evt) {
			var $form = $(evt.target),
				formData = $form.serializeObject();
			$form.find(':focus').blur();

			try {
				if (this.mode() === 'login') {
					this.doLogin(
						$.extend(formData, {'remember': $form[0].querySelector('#remember').classList.contains('checked')}),
						function (data) {
							if (data.error) {
								this.setMessage(data.message, 'error');
								window.setTimeout(function () {
									this.formWorking(false);
									this.formFocus();
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'login', 'auth login error');
							} else {
								if (Utils.isType('function', this.callback)) {
									this.callback.call(this.ctx, {loggedIn: true});
								}
								this.hide();
								ga('send', 'event', 'auth', 'login', 'auth login success');
							}
						}.bind(this)
					);
				} else if (this.mode() === 'reg') {
					this.doRegister(
						$.extend(formData, {}),
						function (data) {
							if (data.error) {
								this.setMessage(data.message, 'error');
								window.setTimeout(function () {
									this.formFocus();
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'register', 'auth register error');
							} else {
								this.finish(true);
								this.setMessage(data.message, 'success');
								window.setTimeout(function () {
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'register', 'auth register success');
							}
						}.bind(this)
					);
				} else if (this.mode() === 'recallRequest') {
					this.doPassRecall(
						$.extend(formData, {}),
						function (data) {
							if (data.error) {
								this.setMessage(data.message, 'error');
								window.setTimeout(function () {
									this.formFocus();
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'passRecall', 'auth passRecall error');
							} else {
								this.finish(true);
								this.setMessage(data.message, 'success');
								window.setTimeout(function () {
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'passRecall', 'auth passRecall success');
							}
						}.bind(this)
					);
				} else if (this.mode() === 'passChangeRecall') {
					this.doPassRecallChange(
						$.extend(formData, {key: this.key()}),
						function (data) {
							if (data.error) {
								this.setMessage(data.message, 'error');
								window.setTimeout(function () {
									this.formFocus();
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'passChangeRecall', 'auth passChangeRecall error');
							} else {
								this.finish(true);
								this.setMessage(data.message, 'success');
								window.setTimeout(function () {
									this.formWorking(false);

									//Если не залогинен, производим автоматический вход пользователем,
									//для которого восстанавливали пароль
									if (!this.loggedIn()) {
										this.doLogin(
											{login: this.login(), pass: formData.pass, remember: true},
											function (data) {
												if (!data.error) {
													ga('send', 'event', 'auth', 'login', 'auth login success');
												}
											}.bind(this)
										);
									}
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'passChangeRecall', 'auth passChangeRecall success');
							}
						}.bind(this)
					);
				} else if (this.mode() === 'recallRequestForMe') {
					this.doPassRecall(
						$.extend(formData, {login: this.login() || this.iAm.login()}),
						function (data) {
							if (data.error) {
								this.setMessage(data.message, 'error');
								window.setTimeout(function () {
									this.formFocus();
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'recallRequestFor', 'auth recallRequestFor error');
							} else {
								this.finish(true);
								this.setMessage(data.message, 'success');
								window.setTimeout(function () {
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'recallRequestFor', 'auth recallRequestFor success');
							}
						}.bind(this)
					);
				} else if (this.mode() === 'passChange') {
					this.doPassChange(
						$.extend(formData, {login: this.iAm.login()}),
						function (data) {
							if (data.error) {
								this.setMessage(data.message, 'error');
								window.setTimeout(function () {
									this.formFocus();
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'passChange', 'auth passChange error');
							} else {
								this.finish(true);
								this.setMessage(data.message, 'success');
								window.setTimeout(function () {
									this.formWorking(false);
								}.bind(this), 420);
								ga('send', 'event', 'auth', 'passChange', 'auth passChange success');
							}
						}.bind(this)
					);
				} else if (this.mode() === 'passInput') {
					this.callback.call(this.ctx, formData.pass);
				}

				this.formWorking(true);
			} catch (e) {
				this.setMessage(e.message, 'error');
				this.formWorking(false);
			}

			return false;
		},

		//Обновляться значения свойств другими модулями в iAm должны через этот метод,
		//чтобы обновлялись зависимости в страницах, зависимых от storage, например, userPage
		setProps: function (props) {
			if (this.loggedIn() && !Utils.isObjectEmpty(props)) {
				var myLogin = this.iAm.login(),
					reallyChanged,
					p;

				for (p in props) {
					if (props[p] !== undefined && Utils.isType('function', this.iAm[p]) && props[p] !== this.iAm[p]()) {
						this.iAm[p](props[p]);
						storage.users[myLogin].origin[p] = props[p];
						reallyChanged = true;
					}
				}
				if (reallyChanged) {
					this.iAm._v_(this.iAm._v_() + 1);
				}
			}
		},

		//Обновляет пользователя при реконнекте, на случай, если пока он был оффлайн, пользователь изменился
		reconnectHandler: function (data) {
			console.log('user reconnect');
			if (Utils.isType('object', data.u)) {
				this.processMe(data.u);
			}
		},
		//Обновление модели залогиненного пользователя с сервера при логине или emitUser
		processMe: function (user) {
			if (user) {
				user.online = true; //Залогиненный пользователь всегда онлайн
				this.iAm = User.vm(user, this.iAm);

				if (this.loggedIn()) {
					storage.users[user.login].origin = user;
					this.iAm._v_(this.iAm._v_() + 1);
				} else {
					storage.users[user.login] = {origin: user, vm: this.iAm};
					this.loggedIn(true);
				}
			}
		},
		reloadMe: function () {
			socket.emit('whoAmI');
		},
		doLogin: function (data, callback) {
			try {
				socket.once('loginResult', function (json) {
					if (!json.error && json.youAre) {
						this.processMe(json.youAre);
					}

					if (Utils.isType('function', callback)) {
						callback(json);
					}
				}.bind(this));
				socket.emit('loginRequest', data);
			} catch (e) {
				if (Utils.isType('function', callback)) {
					callback(e.message);
				}
			}
		},
		doLogout: function (callback) {
			ga('send', 'event', 'auth', 'logout');
			try {
				socket.once('logoutCommand', function (json) {
					if (json.error) {
						console.log('Logout error: ' + json.message);
					} else {
						location.reload();
					}
				});
				socket.emit('logoutRequest');
			} catch (e) {
				if (Utils.isType('function', callback)) {
					callback(e.message);
				}
			}
		},
		doRegister: function (data, callback) {
			try {
				socket.once('registerResult', function (json) {
					if (Utils.isType('function', callback)) {
						callback(json);
					}
				});
				socket.emit('registerRequest', data);
			} catch (e) {
				if (Utils.isType('function', callback)) {
					callback(e.message);
				}
			}
		},
		doPassRecall: function (data, callback) {
			try {
				socket.once('recallResult', function (json) {
					if (Utils.isType('function', callback)) {
						callback(json);
					}
				});
				socket.emit('recallRequest', data);
			} catch (e) {
				if (Utils.isType('function', callback)) {
					callback(e.message);
				}
			}
		},
		doPassRecallChange: function (data, callback) {
			try {
				socket.once('passChangeRecallResult', function (json) {
					if (Utils.isType('function', callback)) {
						callback(json);
					}
				});
				socket.emit('passChangeRecall', data);
			} catch (e) {
				if (Utils.isType('function', callback)) {
					callback(e.message);
				}
			}
		},
		doPassChange: function (data, callback) {
			try {
				socket.once('passChangeResult', function (json) {
					if (Utils.isType('function', callback)) {
						callback(json);
					}
				});
				socket.emit('passChangeRequest', data);
			} catch (e) {
				if (Utils.isType('function', callback)) {
					callback(e.message);
				}
			}
		},
		passInputSet: function (data) {
			if (data.error) {
				this.setMessage(data.message, 'error');
				window.setTimeout(function () {
					this.formWorking(false);
					this.formFocus();
				}.bind(this), 420);
			} else {
				this.hide();
			}
		}

	});
});