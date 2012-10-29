/*global requirejs:true, require:true, define:true*/
define(['jquery', 'Utils', '../socket', 'globalParams', 'knockout', 'm/_moduleCliche', 'globalVM', 'm/User', 'KeyHandler', 'text!tpl/auth.jade', 'css!style/auth'], function ($, Utils, socket, globalParams, ko, Cliche, globalVM, User, keyTarget, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.iAm = User.VM();

            this.mode = ko.observable('login');
            this.working = ko.observable(false);

            this.msg = ko.observable('');

            this.mode.subscribe(function () {
                this.formFocus();
            }, this);

            ko.applyBindings(globalVM, this.$dom[0]);
        },
        show: function (mode) {
            if (mode) {
                this.mode(mode);
            }

            //this.$container.css('display', 'block');
            this.$container.fadeIn(300, function () {
                this.showing = true;
                this.formFocus();

                keyTarget.push({
                    id: 'authOverlay',
                    stopFurther: false,
                    onEsc: this.formClose.bind(this)
                });
            }.bind(this));
        },
        hide: function () {
            keyTarget.pop();
            this.formReset();
            this.$container.css('display', '');
            this.showing = false;
        },

        LoadMe: function () {
            var dfd = $.Deferred();
            socket.on('youAre', function (user) {
                globalParams.LoggedIn(!!user);
                this.iAm = User.VM(user, this.iAm);
                console.log(this.iAm.fullName());
                dfd.resolve();
            }.bind(this));
            socket.emit('whoAmI');
            return dfd.promise();
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
            this.$dom.find(".mess").height(0).text('').removeClass('text-error text-warning text-info text-success muted');
            this.formWorking(false);
        },
        formClose: function () {
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
        submit: function () {
            var form = this.$dom.find('form:visible');
            form.find(':focus').blur();

            try {
                if (this.mode() === 'login') {
                    this.doLogin(
                        $.extend(form.serializeObject(), {'remember': form[0].querySelector('#remember').classList.contains('checked')}),
                        function (data) {
                            if (data.error) {
                                this.setMessage(data.message, 'error');
                                window.setTimeout(function () {
                                    this.formWorking(false);
                                    this.formFocus();
                                }.bind(this), 420);
                            } else {
                                this.formClose();
                            }
                        }.bind(this)
                    );

                } else if (this.mode() === 'reg') {
                    this.doRegister(
                        $.extend(form.serializeObject(), {}),
                        function (data) {
                            if (data.error) {
                                this.setMessage(data.message, 'error');
                                window.setTimeout(function () {
                                    this.formFocus();
                                    this.formWorking(false);
                                }.bind(this), 420);
                            } else {
                                form.find('button').css('display', 'none');
                                form.find('.formfinish').css('display', '');
                                this.setMessage(data.message, 'success');
                                window.setTimeout(function () {
                                    this.formWorking(false);
                                }.bind(this), 420);
                            }
                        }.bind(this)
                    );
                } else if (this.mode() === 'recall') {
                    this.doPassRecall(
                        $.extend(form.serializeObject(), {}),
                        function (data) {
                            if (data.error) {
                                this.setMessage(data.message, 'error');
                                window.setTimeout(function () {
                                    this.formFocus();
                                    this.formWorking(false);
                                }.bind(this), 420);
                            } else {
                                form.find('button').css('display', 'none');
                                form.find('.formfinish').css('display', '');
                                this.setMessage(data.message, 'success');
                                window.setTimeout(function () {
                                    this.formWorking(false);
                                }.bind(this), 420);
                            }
                        }.bind(this)
                    );
                }

                this.formWorking(true);
            } catch (e) {
                this.setMessage(e.message, 'error');
                this.formWorking(false);
            }

            return false;
        },
        doLogin: function (data, callback) {
            try {
                socket.on('loginResult', function (json) {
                    socket.removeAllListeners('loginResult');
                    if (!json.error) {
                        this.LoadMe();
                    }

                    if (Utils.isObjectType('function', callback)) {
                        callback(json);
                    }
                }.bind(this));
                socket.emit('loginRequest', data);
            } catch (e) {
                if (Utils.isObjectType('function', callback)) {
                    callback(e.message);
                }
            }
        },
        doLogout: function (callback) {
            try {
                socket.on('logoutResult', function (json) {
                    socket.removeAllListeners('logoutResult');
                    if (json.error) {
                        console.log('Logout error' + json.message);
                    } else {
                        document.location = json.logoutPath;
                    }
                });
                socket.emit('logoutRequest', {});
            } catch (e) {
                if (Utils.isObjectType('function', callback)) {
                    callback(e.message);
                }
            }
        },
        doRegister: function (data, callback) {
            try {
                socket.on('registerResult', function (json) {
                    socket.removeAllListeners('registerResult');
                    if (Utils.isObjectType('function', callback)) {
                        callback(json);
                    }
                });
                socket.emit('registerRequest', data);
            } catch (e) {
                if (Utils.isObjectType('function', callback)) {
                    callback(e.message);
                }
            }
        },
        doPassRecall: function (data, callback) {
            try {
                socket.on('recallResult', function (json) {
                    socket.removeAllListeners('recallResult');
                    if (Utils.isObjectType('function', callback)) {
                        callback(json);
                    }
                });
                socket.emit('recallRequest', data);
            } catch (e) {
                if (Utils.isObjectType('function', callback)) {
                    callback(e.message);
                }
            }
        }

    });
});