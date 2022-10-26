/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/*global init:true */
define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User', 'text!tpl/common/auth.pug', 'css!style/common/auth'], function (_, $, Utils, socket, P, ko, Cliche, globalVM, storage, User, pug) {
    'use strict';

    //Обновляет куки сессии переданным объектом с сервера
    function updateCookie(obj) {
        Utils.cookie.setItem(obj.key, obj.value, obj['max-age'], obj.path, obj.domain, null);
    }

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.loggedIn = ko.observable(!!init.registered);
            this.processMe({ user: init.user });

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

            // При изменении данных профиля на сервере, обновляем его на клиенте
            socket.on('youAre', this.processMe, this);
            // Подписываемся на команды с сервера
            socket.on('command', this.commandHandler, this);
            // После реконнекта заново запрашиваем initData
            socket.on('reconnect', function () {
                socket.emit('session.giveInitData', { path: location.pathname });
            }, this);
            // Подписываемся на получение новых первоначальных данных (пользователя, куки),
            // на случай, если пока он был оффлайн, пользователь изменился
            socket.on('takeInitData', function (data) {
                updateCookie(data.cook); // Обновляем куки
                this.processMe({ user: data.u, registered: data.registered });
            }, this);

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
            }, this);
        },
        hide: function () {
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
                    this.$dom.children('form:visible')[0].querySelector('.form-control:not([disabled])').focus();
                } catch (e) {
                }
            }.bind(this), 200);
        },
        formReset: function () {
            this.$dom.find(':focus').blur();
            this.$dom.find('input').val(null);
            this.$dom.find('.mess').height(0).removeClass('text-error text-warning text-info text-success muted');
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
                    this.callback.call(this.ctx, { loggedIn: false });
                }
            }

            this.hide();
        },
        formWorking: function (param) {
            this.working(param);
            this.$dom.find('form:visible').find('input, button').attr('disabled', param);
        },
        setMessage: function (text, type) {
            let css = '';

            switch (type) {
                case 'error':
                    css = 'text-danger';
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
                .css({ height: 5 + this.$dom.find('form:visible .mess > div').height() });

            text = type = css = null;
        },

        commandHandler: function (data, acknowledgementCallback) {
            if (!Array.isArray(data)) {
                return;
            }

            const result = {};

            try {
                _.forEach(data, function (command) {
                    if (command.name === 'clearCookie') {
                        Utils.cookie.removeItem('past.sid', '/');
                    } else if (command.name === 'updateCookie' && _.isObject(command.data)) {
                        updateCookie(command.data);
                    } else if (command.name === 'location') {
                        setTimeout(function () {
                            if (command.path) {
                                document.location = command.path;
                            } else {
                                location.reload();
                            }
                        }, 10);
                    } else {
                        result.error = { message: 'Unknown command' };
                    }
                });
            } catch (err) {
                console.error(err);
                result.error = err;
            }

            if (_.isFunction(acknowledgementCallback)) {
                acknowledgementCallback(result);
            }
        },

        submit: function (data, evt) {
            const self = this;
            const $form = $(evt.target);
            const formData = $form.serializeObject();

            $form.find(':focus').blur();

            try {
                if (self.mode() === 'login') {
                    self.doLogin(
                        formData,
                        function () {
                            if (_.isFunction(self.callback)) {
                                self.callback.call(self.ctx, { loggedIn: true });
                            }

                            self.hide();
                            ga('send', 'event', 'auth', 'login', 'auth login success');
                        },
                        function (error) {
                            self.setMessage(error.message, 'error');
                            setTimeout(function () {
                                self.formWorking(false);
                                self.formFocus();
                            }, 420);

                            ga('send', 'event', 'auth', 'login', 'auth login error');
                        }
                    );
                } else if (self.mode() === 'reg') {
                    self.doRegister(
                        $.extend(formData, {}),
                        function (data) {
                            self.finish(true);
                            self.setMessage(data.message, 'success');
                            setTimeout(function () {
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'register', 'auth register success');
                        },
                        function (data) {
                            self.setMessage(data.message, 'error');
                            setTimeout(function () {
                                self.formFocus();
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'register', 'auth register error');
                        }
                    );
                } else if (self.mode() === 'recallRequest') {
                    self.doPassRecall(
                        $.extend(formData, {}),
                        function (data) {
                            self.finish(true);
                            self.setMessage(data.message, 'success');
                            setTimeout(function () {
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'passRecall', 'auth passRecall success');
                        },
                        function (data) {
                            self.setMessage(data.message, 'error');
                            setTimeout(function () {
                                self.formFocus();
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'passRecall', 'auth passRecall error');
                        }
                    );
                } else if (self.mode() === 'passChangeRecall') {
                    self.doPassRecallChange(
                        $.extend(formData, { key: self.key() }),
                        function (data) {
                            self.finish(true);
                            self.setMessage(data.message, 'success');
                            setTimeout(function () {
                                self.formWorking(false);

                                // Если не залогинен, производим автоматический вход пользователем,
                                // для которого восстанавливали пароль
                                if (!self.loggedIn()) {
                                    self.doLogin(
                                        { login: self.login(), pass: formData.pass },
                                        function () {
                                            ga('send', 'event', 'auth', 'login', 'auth login success');
                                        }
                                    );
                                }
                            }, 420);
                            ga('send', 'event', 'auth', 'passChangeRecall', 'auth passChangeRecall success');
                        },
                        function (data) {
                            self.setMessage(data.message, 'error');
                            setTimeout(function () {
                                self.formFocus();
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'passChangeRecall', 'auth passChangeRecall error');
                        }
                    );
                } else if (self.mode() === 'recallRequestForMe') {
                    self.doPassRecall(
                        $.extend(formData, { login: self.login() || self.iAm.login() }),
                        function (data) {
                            self.finish(true);
                            self.setMessage(data.message, 'success');
                            setTimeout(function () {
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'recallRequestFor', 'auth recallRequestFor success');
                        },
                        function (data) {
                            self.setMessage(data.message, 'error');
                            setTimeout(function () {
                                self.formFocus();
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'recallRequestFor', 'auth recallRequestFor error');
                        }
                    );
                } else if (self.mode() === 'passChange') {
                    self.doPassChange(
                        $.extend(formData, { login: self.iAm.login() }),
                        function (data) {
                            self.finish(true);
                            self.setMessage(data.message, 'success');
                            setTimeout(function () {
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'passChange', 'auth passChange success');
                        },
                        function (data) {
                            self.setMessage(data.message, 'error');
                            setTimeout(function () {
                                self.formFocus();
                                self.formWorking(false);
                            }, 420);
                            ga('send', 'event', 'auth', 'passChange', 'auth passChange error');
                        }
                    );
                } else if (self.mode() === 'passInput') {
                    self.callback.call(self.ctx, formData.pass);
                }

                self.formWorking(true);
            } catch (e) {
                self.setMessage(e.message, 'error');
                self.formWorking(false);
            }

            return false;
        },

        //Обновляться значения свойств другими модулями в iAm должны через этот метод,
        //чтобы обновлялись зависимости в страницах, зависимых от storage, например, userPage
        setProps: function (props) {
            if (this.loggedIn() && !Utils.isObjectEmpty(props)) {
                const myLogin = this.iAm.login();
                let reallyChanged;
                let p;

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

        // Обновление модели пользователя с сервера при логине или emitUser
        processMe: function (usObj) {
            const user = usObj.user;
            const loggedIn = !!usObj.registered || this.loggedIn();
            const storageUser = storage.users[user.login];

            user.online = loggedIn; //Залогиненный пользователь всегда онлайн

            if (this.iAm) {
                user._v_ = this.iAm._v_(); //Оригинальную версию надо сохранить, в противном случае подставится 0
            }

            this.iAm = User.vm(user, this.iAm);

            if (!storageUser) {
                storage.users[user.login] = { origin: user, vm: this.iAm };
            } else {
                storageUser.origin = user;
            }

            if (loggedIn) {
                this.loggedIn(loggedIn); //loggedIn должен изменятся после обновления storage, так как на него есть зависимые подписки
            }

            //Поднимаем версию пользователя, с помощью которой есть подписки на обновление iAm
            this.iAm._v_(user._v_ + 1);
        },
        reloadMe: function () {
            socket.emit('auth.whoAmI');
        },
        doLogin: function (data, callbackSuccess, callbackError) {
            socket.run('auth.login', data)
                .then(function (result) {
                    if (result.youAre) {
                        this.processMe({ user: result.youAre, registered: true });
                    }

                    if (_.isFunction(callbackSuccess)) {
                        callbackSuccess(result);
                    }
                }.bind(this))
                .catch(function (error) {
                    if (_.isFunction(callbackError)) {
                        callbackError(error);
                    }
                });
        },
        doLogout: (function () {
            let logouting;

            return function (callback) {
                if (logouting) {
                    return;
                }

                logouting = true;
                ga('send', 'event', 'auth', 'logout');

                socket.run('auth.logout', undefined, true)
                    .then(function () {
                        logouting = false;
                    })
                    .catch(function (error) {
                        if (_.isFunction(callback)) {
                            callback(error);
                        }
                    });
            };
        }()),
        doRegister: function (data, callbackSuccess, callbackError) {
            socket.run('auth.register', data).then(callbackSuccess).catch(callbackError);
        },
        doPassRecall: function (data, callbackSuccess, callbackError) {
            socket.run('auth.recall', data).then(callbackSuccess).catch(callbackError);
        },
        doPassRecallChange: function (data, callbackSuccess, callbackError) {
            socket.run('auth.passChangeRecall', data).then(callbackSuccess).catch(callbackError);
        },
        doPassChange: function (data, callbackSuccess, callbackError) {
            socket.run('auth.passChange', data).then(callbackSuccess).catch(callbackError);
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
        },

    });
});
