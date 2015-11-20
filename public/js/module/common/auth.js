define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User', 'text!tpl/common/auth.jade', 'css!style/common/auth'], function (_, $, Utils, socket, P, ko, Cliche, globalVM, storage, User, jade) {
    'use strict';

    //Обновляет куки сессии переданным объектом с сервера
    function updateCookie(obj) {
        Utils.cookie.setItem(obj.key, obj.value, obj['max-age'], obj.path, obj.domain, null);
    }

    return Cliche.extend({
        jade: jade,
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

            //Подписываемся на получение новых первоначальных данных (пользователя, куки), на случай, если пока он был оффлайн, пользователь изменился
            socket.on('takeInitData', function (data) {
                if (data) {
                    if (_.isObject(data.cook)) {
                        updateCookie(data.cook); //Обновляем куки
                    }
                    if (_.isObject(data.u)) {
                        this.processMe({ user: data.u, registered: data.registered });
                    }
                }
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
            var css = '';
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
            var result = {};

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
            var $form = $(evt.target);
            var formData = $form.serializeObject();
            $form.find(':focus').blur();

            try {
                if (this.mode() === 'login') {
                    this.doLogin(
                        formData,
                        function (data) {
                            if (_.isFunction(this.callback)) {
                                this.callback.call(this.ctx, { loggedIn: true });
                            }

                            this.hide();
                            ga('send', 'event', 'auth', 'login', 'auth login success');
                        }.bind(this),
                        function (error) {
                            this.setMessage(error.message, 'error');
                            setTimeout(function () {
                                this.formWorking(false);
                                this.formFocus();
                            }.bind(this), 420);

                            ga('send', 'event', 'auth', 'login', 'auth login error');
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
                        $.extend(formData, { key: this.key() }),
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

                                    // Если не залогинен, производим автоматический вход пользователем,
                                    // для которого восстанавливали пароль
                                    if (!this.loggedIn()) {
                                        this.doLogin(
                                            { login: this.login(), pass: formData.pass },
                                            function () {
                                                ga('send', 'event', 'auth', 'login', 'auth login success');
                                            }
                                        );
                                    }
                                }.bind(this), 420);
                                ga('send', 'event', 'auth', 'passChangeRecall', 'auth passChangeRecall success');
                            }
                        }.bind(this)
                    );
                } else if (this.mode() === 'recallRequestForMe') {
                    this.doPassRecall(
                        $.extend(formData, { login: this.login() || this.iAm.login() }),
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
                        $.extend(formData, { login: this.iAm.login() }),
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

        //Обновление модели пользователя с сервера при логине или emitUser
        processMe: function (usObj) {
            var user = usObj.user,
                loggedIn = !!usObj.registered || this.loggedIn(),
                storageUser = storage.users[user.login];

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
            socket.emit('whoAmI');
        },
        doLogin: function (data, callbackSuccess, callbackError) {
            socket.run('auth.login', data)
                .catch(function (error) {
                    if (_.isFunction(callbackError)) {
                        callbackError(error.message);
                    }
                })
                .then(function (result) {
                    if (result.youAre) {
                        this.processMe({ user: result.youAre, registered: true });
                    }

                    if (_.isFunction(callbackSuccess)) {
                        callbackSuccess(result);
                    }
                }.bind(this));
        },
        doLogout: (function () {
            var logouting;
            return function (callback) {
                if (logouting) {
                    return;
                }
                logouting = true;
                ga('send', 'event', 'auth', 'logout');

                socket.run('auth.logout', undefined, true)
                    .catch(function (error) {
                        if (_.isFunction(callback)) {
                            callback(error.message);
                        }
                    })
                    .then(function (data) {
                        logouting = false;
                    });
            };
        }()),
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