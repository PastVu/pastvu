/*global define:true, ga:true*/
/**
 * Модель статистики пользователя
 */
define([
    'underscore', 'Params', 'knockout', 'socket!', 'm/_moduleCliche', 'globalVM', 'model/storage', 'model/User',
    'noties', 'text!tpl/user/brief.pug', 'css!style/user/brief'
], function (_, P, ko, socket, Cliche, globalVM, storage, User, noties, pug) {
    'use strict';

    var mess = {
        ftype: 'Тип файла не соответствует правилам',
        fmax: 'Файл больше разрешенного размера',
        fmin: 'Файл слишком мал',
        fpx: 'Согласно правилам, размер изображения должен быть не менее 100px по каждой из сторон',
        finvalid: 'Файл не прошел валидацию' //Сообщение по умолчанию для валидации
    };

    return Cliche.extend({
        pug: pug,
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
            this.avaUploadDestroy(false);
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
            this.can_pm = this.co.can_pm = ko.computed(function () {
                return this.auth.loggedIn() && (this.auth.iAm.login() !== this.user.login());
            }, this);

            this.avaExists = this.co.avaExists = ko.computed(function () {
                return this.user.avatar() !== User.def.full.avatar;
            }, this);
            this.canAva = this.co.canAva = ko.computed(function () {
                return this.auth.loggedIn() && (this.auth.iAm.login() === this.user.login() || this.auth.iAm.role() > 9);
            }, this);

            ko.applyBindings(globalVM, this.$dom[0]);
            this.userInited = true;
            this.show();
        },

        avaActionToggle: function (vm, e) {
            var currentStatus = this.avaction(),
                event = e || vm; //Среагировав на клик vm будет событием

            if (currentStatus) {
                this.avaUploadDestroy();
                this.avaction(false);
            } else {
                this.avaction(true);
                require(['jfileupload/jquery.iframe-transport', 'jfileupload/jquery.fileupload'], function () {
                    this.$fileupload = this.$dom.find('.avaInput');
                    this.$fileupload.fileupload();
                    this.$fileupload.fileupload('option', {
                        url: '/uploadava',
                        dataType: 'json',
                        dropZone: null,
                        pasteZone: null,

                        //add: this.avaAdd.bind(this),
                        submit: this.avaSubmit.bind(this),
                        done: this.avaDone.bind(this),
                        fail: this.avaFail.bind(this)
                    });
                    $(document).on('click', this.avaActionToggleBind);
                }.bind(this));
            }
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            return false;
        },
        avaUploadDestroy: function () {
            if (this.$fileupload && this.$fileupload.fileupload) {
                this.$dom.find('.avaInput').fileupload('destroy');
            }
            delete this.$fileupload;
            $(document).off('click', this.avaActionToggleBind);
        },
        avaSelect: function (vm, e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            //Генерируем клик по инпуту, выключив перед этим клик по документу,
            //а потом опять его включив, чтобы не сработал его хендлер и не закрыл кнопки
            $(document).off('click', this.avaActionToggleBind);
            this.$dom.find('.avaInput').trigger('click');
            $(document).on('click', this.avaActionToggleBind);
            return false;
        },

        avaSubmit: function (e, data) {
            this.avaexe(true);
        },
        avaDone: function (e, data) {
            var receivedFile = (data && data.result && data.result.files || [])[0];

            if (receivedFile && receivedFile.file) {
                if (receivedFile.error) {
                    noties.error({
                        message: mess[receivedFile.error] || mess.finvalid || 'Ошибка загрузки аватары'
                    });
                    this.avaexe(false);
                    ga('send', 'event', 'avatar', 'upload', 'avatar upload error');
                } else {
                    socket.run(
                        'profile.changeAvatar',
                        {
                            login: this.user.login(),
                            file: receivedFile.file,
                            mime: receivedFile.type,
                            size: receivedFile.size
                        },
                        true
                    ).then(function (result) {
                        if (this.user.login() !== this.auth.iAm.login()) {
                            // Если меняем не себе, обновляем модель вручную. Себе обновления пришлет _session
                            var origin = storage.userImmediate(this.user.login()).origin;
                            origin.avatar = '/_a/d/' + result.avatar;
                            origin.avatarth = '/_a/h/' + result.avatar;
                            this.user.avatar(origin.avatar);
                            this.user.avatarth(origin.avatarth);
                        }
                        ga('send', 'event', 'avatar', 'upload', 'avatar upload success');

                        this.avaexe(false);
                    }.bind(this));
                }
            }
        },
        avaFail: function (e, data) {
            noties.error({
                message: data && data.message || 'Ошибка загрузки аватары'
            });
            this.avaexe(false);
        },

        avaDel: function (vm, e) {
            this.avaexe(true);
            socket.run('profile.delAvatar', { login: this.user.login() }, true)
                .then(function () {
                    if (this.user.login() !== this.auth.iAm.login()) {
                        // Если меняем не себе, обновляем модель вручную. Себе обновления пришлет _session
                        var origin = storage.userImmediate(this.user.login()).origin;
                        origin.avatar = User.def.full.avatar;
                        origin.avatarth = User.def.full.avatarth;
                        this.user.avatar(origin.avatar);
                        this.user.avatarth(origin.avatarth);
                    }
                    ga('send', 'event', 'avatar', 'delete', 'avatar delete');

                    this.avaexe(false);
                }.bind(this));

            if (e.stopPropagation) {
                e.stopPropagation();
            }
            return false;
        },

        onAvaLoad: function (data, event) {
            $(event.target).animate({ opacity: 1 });
        },
        onAvaError: function (data, event) {
            $(event.target).attr('src', '/img/caps/avatar.png');
        }
    });
});