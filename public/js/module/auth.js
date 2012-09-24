/*global requirejs:true, require:true, define:true*/
define(['jquery', 'Utils', '../socket', 'globalParams', 'knockout', 'm/_moduleCliche', 'm/User', 'KeyHandler', 'text!tpl/auth.jade', 'css!style/auth'], function ($, Utils, socket, globalParams, ko, Cliche, User, keyTarget, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.iAm = User.VM(User.def);

            this.showing = ko.observable(false);
            this.mode = ko.observable('login');
            this.working = ko.observable(false);

            this.msg = ko.observable('');

            this.mode.subscribe(function () {
                this.formFocus();
            }, this);

            this.show();
        },
        show: function (mode) {
            if (mode) {
                this.mode(mode);
            }
            this.$container.css('display', 'block');
            this.showing(true);
            this.formFocus();

            keyTarget.push({
                id: 'authOverlay',
                stopFurther: false,
                onEsc: this.formClose.bind(this)
            });
        },
        hide: function () {
            keyTarget.pop();
            this.formReset();
            this.$container.css('display', '');
            this.showing(false);
        },

        LoadMe: function () {
            var dfd = $.Deferred();
            socket.on('youAre', function (user) {
                globalParams.LoggedIn(!!user);
                console.dir(user);
                this.iAm = User.VM(user, this.iAm);
                dfd.resolve();
            });
            socket.emit('whoAmI');
            return dfd.promise();
        },

        formFocus: function () {
            window.setTimeout(function () {
                try {
                    this.$dom.children('form:visible')[0].querySelector('input:first-child:not([disabled])').focus();
                } catch (e) {
                }
            }, 400);
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
                        function (error, data) {
                            if (error) {
                                this.setMessage(error, 'error');
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
                        function (error, data) {
                            if (error) {
                                this.setMessage(error, 'error');
                                window.setTimeout(function () {
                                    this.formFocus();
                                    this.formWorking(false);
                                }.bind(this), 420);
                            } else {
                                form.find('button').css('display', 'none');
                                form.find('.formfinish').css('display', '');
                                this.setMessage(data, 'success');
                                window.setTimeout(function () {
                                    this.formWorking(false);
                                }.bind(this), 420);
                            }
                        }.bind(this)
                    );
                } else if (this.mode() === 'recall') {
                    this.doPassRecall(
                        $.extend(form.serializeObject(), {}),
                        function (error, data) {
                            if (error) {
                                this.setMessage(error, 'error');
                                window.setTimeout(function () {
                                    this.formFocus();
                                    this.formWorking(false);
                                }.bind(this), 420);
                            } else {
                                form.find('button').css('display', 'none');
                                form.find('.formfinish').css('display', '');
                                this.setMessage(data, 'success');
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
                    if (json.success) {
                        $.ajax({
                            url: '/updateCookie',
                            cache: false
                        });
                        this.LoadMe();
                    }

                    if (Utils.isObjectType('function', callback)) {
                        callback(json.error, json.success);
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
                    if (json.err) {
                        console.log('Logout error' + json.err);
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
                    if (Utils.isObjectType('function', callback)) {
                        callback(json.error, json.success);
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
                    if (Utils.isObjectType('function', callback)) {
                        callback(json.error, json.success);
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