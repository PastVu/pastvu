/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'noties', 'm/photo/fields', 'model/Region', 'model/User', 'model/storage', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/collapse'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, noties, fields, Region, User, storage, jade) {
    function isYes(evt) {
        return !!evt.target.classList.contains('yes');
    }

    return Cliche.extend({
        jade: jade,
        options: {
            userVM: null
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;

            this.fields = fields;

            if (this.auth.loggedIn() && (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9)) {
                this.originUser = storage.userImmediate(this.u.login()).origin;
                this.editEmail = ko.observable(false);

                this.itsMe = this.co.itsMe = ko.computed(function () {
                    return this.auth.iAm.login() === this.u.login();
                }, this);

                this.showName = this.co.showName = ko.computed(function () {
                    return this.u.disp() !== this.u.login();
                }, this);

                this.regfiltercheck = this.co.regfiltercheck = ko.computed({
                    read: function () {
                        if (this.u.settings.r_as_home()) {
                            return 'home';
                        } else if (!this.u.regions().length) {
                            return 'all';
                        } else {
                            return 'list';
                        }
                    },
                    write: function (valNew) {
                        var valPrev = this.regfiltercheck();

                        if (valNew === 'home') {
                            // Если устанавляаем фильтрацию по Домашнему региону,
                            // сначала ставим домашний регион в фильтр, затем сохраняем настройку r_as_home
                            this.saveFilterRegions([this.u.regionHome.cid()], function () {
                                this.changeSetting('r_as_home', true, true, function (err) {
                                    if (!err) {
                                        this.originUser.regions = [ko.toJS(this.u.regionHome)];
                                        // Обновляем регионы в текущей вкладке вручную
                                        User.vm({ regions: this.originUser.regions }, this.u, true);
                                    }
                                    ga('send', 'event', 'region', 'update', 'region update ' + (err ? 'error' : 'success'), 1);
                                }, this);
                            }, this);
                        } else {
                            if (valNew === 'all') {
                                this.saveFilterRegions([], function () {
                                    this.originUser.regions = [];
                                    // Обновляем регионы в текущей вкладке вручную
                                    User.vm({ regions: this.originUser.regions }, this.u, true);
                                    ga('send', 'event', 'region', 'update', 'region update success', 1);

                                    // Если был установлена фильтрация по Домашнему региону, отменяем её
                                    if (valPrev === 'home') {
                                        this.changeSetting('r_as_home', false, true);
                                    }
                                }, this);
                            } else if (valNew === 'list') {
                                this.regionFilterSelect();

                                // Если был установлена фильтрация по Домашнему региону, отменяем её
                                if (valPrev === 'home') {
                                    this.changeSetting('r_as_home', false, true);
                                }
                            }
                        }
                    },
                    owner: this
                });

                this.photo_watermark_add_sign = ko.observable();
                this.watersigncheck = this.co.watersigncheck = ko.computed({
                    read: function () {
                        var current = this.photo_watermark_add_sign() || this.u.settings.photo_watermark_add_sign();

                        if (!current) {
                            return false;
                        }

                        return String(current);
                    },
                    write: function (valNew) {
                        if (valNew === 'true') {
                            valNew = true;
                        }
                        // If clicked custom, but it value haven't been set yet, do not save change.
                        if (valNew !== 'custom' || this.u.watersignCustom()) {
                            this.changeSetting('photo_watermark_add_sign', valNew, true);
                        }
                        this.photo_watermark_add_sign(valNew);
                    },
                    owner: this
                });
                this.watersignCustomChanged = this.co.watersignCustomChanged = ko.computed({
                    read: function () {
                        return this.u.watersignCustom() !== this.originUser.watersignCustom;
                    },
                    owner: this
                });
                this.resetwatersigncheck = ko.observable('all');
                this.resetDisallowDownloadOrigin = ko.observable('all');
                this.reconvertcheck = ko.observable('all');
                this.reconvertingPhotos = ko.observable(false);

                this.getSettingsVars(function () {
                    this.subscriptions.subscr_throttle = this.u.settings.subscr_throttle.subscribe(_.debounce(this.subscr_throttleHandler, 700), this);

                    ko.applyBindings(globalVM, this.$dom[0]);
                    this.show();
                }, this);
            } else {
                globalVM.router.navigate('/u/' + this.u.login());
            }
        },
        show: function () {
            this.$dom.find('#accordion').collapse({
                toggle: false
            });
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        getSettingsVars: function (cb, ctx) {
            socket.run('settings.getUserSettingsVars', undefined, true)
                .then(function (result) {
                    this.vars = result;

                    if (_.isFunction(cb)) {
                        cb.call(ctx, result);
                    }
                }.bind(this));
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        watermarkShow: function (data, evt) {
            this.changeSetting('photo_show_watermark', isYes(evt), true);
        },
        watersignAdd: function (data, evt) {
            var flag = isYes(evt);
            var watersignCustom = this.u.watersignCustom();
            var newVal = !flag ? false : watersignCustom ? 'custom' : true;

            this.changeSetting('photo_watermark_add_sign', newVal, true);
        },
        watermarkCustomSave: function () {
            if (!this.watersignCustomChanged()) {
                return;
            }
            socket.run('profile.setWatersignCustom', { login: this.u.login(), watersign: this.u.watersignCustom() }, true)
                .then(function (result) {
                    var photo_watermark_add_sign = result.photo_watermark_add_sign || false;
                    var watersignCustom = result.watersignCustom || '';

                    this.u.settings.photo_watermark_add_sign(photo_watermark_add_sign);
                    this.originUser.settings.photo_watermark_add_sign = photo_watermark_add_sign;
                    this.photo_watermark_add_sign(photo_watermark_add_sign);

                    this.originUser.watersignCustom = watersignCustom;
                    this.u.watersignCustom(_.random(9)); // Ugly hack to invoke watersignCustomChanged computing
                    this.u.watersignCustom(watersignCustom);
                }.bind(this));
        },
        watermarkCustomCancel: function () {
            this.u.watersignCustom(this.originUser.watersignCustom);
            this.photo_watermark_add_sign(this.u.settings.photo_watermark_add_sign());
        },
        reconvertPhotos: function () {
            var self = this;
            this.reconvertingPhotos(true);

            var option = this.reconvertcheck();
            var region = option === 'region' && $('#reconvertRegion', this.$dom).val();

            if (region) {
                region = Number(region) || undefined;
            }

            socket.run('photo.convertByUser', { login: this.u.login(), r: region }, true)
                .then(function (result) {
                    var warning = !result.updated;

                    window.noty({
                        text: warning ? 'Ни одной фотографии не отправлено на конвертацию' :
                            result.updated + ' фотографий отправлено на повторную конвертацию',
                        type: warning ? 'warning' : 'success',
                        layout: 'center',
                        timeout: 3000,
                        force: true
                    });
                })
                .catch(_.noop)
                .then(function () {
                    self.reconvertingPhotos(false);
                });
        },
        individualWatersignReset: function () {
            var self = this;

            self.reconvertingPhotos(true);

            var option = self.resetwatersigncheck();
            var region = option === 'region' && $('#resetwatersignRegion', self.$dom).val();

            if (region) {
                region = Number(region) || undefined;
            }

            noties.confirm({
                message: 'Вы уверены что хотите сбросить индивидуальные настройки подписи в фотографиях' +
                (region ? ' указанного региона' : '') + '?',
                okText: 'Да, сбросить',
                cancelText: 'Отменить',
                onOk: function (confirmer) {
                    socket.run('photo.convertByUser', { login: self.u.login(), r: region, resetIndividual: true }, true)
                        .then(function (result) {
                            var warning = !result.updated;

                            window.noty({
                                text: warning ? 'Не найдено ни одной фотографии с индивидуальными настройками подписи' :
                                'У ' + result.updated + ' фотографий сброшены индивидуальные настройки подписи и они отправлены на повторную конвертацию',
                                type: warning ? 'warning' : 'success',
                                layout: 'center',
                                timeout: 3000,
                                force: true
                            });
                        })
                        .catch(_.noop)
                        .then(function () {
                            confirmer.close();
                            self.reconvertingPhotos(false);
                        });
                },
                onCancel: function () {
                    self.reconvertingPhotos(false);
                }
            });
        },
        disallowDownloadOrigin: function (data, evt) {
            this.changeSetting('photo_disallow_download_origin', !isYes(evt), true);
        },
        individualDisallowDownloadOriginReset: function () {
            var self = this;

            self.reconvertingPhotos(true);

            var option = self.resetDisallowDownloadOrigin();
            var region = option === 'region' && $('#resetDisallowDownloadOriginRegion', self.$dom).val();

            if (region) {
                region = Number(region) || undefined;
            }

            noties.confirm({
                message: 'Вы уверены что хотите сбросить индивидуальные настройки скачивания оргиналов фотографий' +
                (region ? ' указанного региона' : '') + '?',
                okText: 'Да, сбросить',
                cancelText: 'Отменить',
                onOk: function (confirmer) {
                    socket.once('resetIndividualDownloadOriginResult', function (data) {
                        var error = !data || data.error;
                        var warning = !error && !data.updated;

                        confirmer.close();

                        window.noty({
                            text: error ? data && data.message || 'Error occurred' :
                                warning ? 'Не найдено ни одной фотографии с индивидуальными настройками скачивания' :
                                'У ' + data.updated + ' фотографий сброшены индивидуальные настройки скачивания',
                            type: error ? 'error' : warning ? 'warning' : 'success',
                            layout: 'center',
                            timeout: 3000,
                            force: true
                        });

                        self.reconvertingPhotos(false);
                    });
                    socket.emit('photo.resetIndividualDownloadOrigin', { login: self.u.login(), r: region});
                },
                onCancel: function () {
                    self.reconvertingPhotos(false);
                }
            });
        },
        autoReply: function (data, evt) {
            this.changeSetting('subscr_auto_reply', isYes(evt), true);
        },
        regionUserGal: function (data, evt) {
            this.changeSetting('r_f_user_gal', isYes(evt), true);
        },
        regionPhotoUserGal: function (data, evt) {
            this.changeSetting('r_f_photo_user_gal', isYes(evt), true);
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
            socket.run('profile.changeSetting', { login: this.u.login(), key: key, val: val }, true)
                .then(function (result) {
                    this.u.settings[result.key](result.val);
                    this.originUser.settings[result.key] = result.val;

                    if (_.isFunction(cb)) {
                        cb.call(ctx, null, result);
                    }
                }.bind(this))
                .catch(function (error) {
                    if (_.isFunction(cb)) {
                        cb.call(ctx, error);
                    }
                });
        },

        toggleDisp: function () {
            socket.run('profile.changeDispName', { login: this.u.login(), showName: !this.showName() }, true)
                .then(function (result) {
                    this.u.disp(result.disp);
                    this.originUser.disp = result.disp;
                }.bind(this));
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
            socket.run('profile.changeEmail', { login: this.u.login(), email: this.u.email(), pass: pass })
                .then(function (result) {
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
                }.bind(this))
                .catch(function (error) {
                    if (pass) {
                        this.auth.passInputSet({ error: error });
                    } else {
                        window.noty({
                            text: error.message || 'Error occurred',
                            type: 'error',
                            layout: 'center',
                            timeout: 3000,
                            force: true
                        });
                    }
                }.bind(this));
        },
        cancelEmail: function () {
            if (this.editEmail()) {
                this.u.email(this.originUser.email);
                this.editEmail(false);
            }
        },

        saveHomeRegion: function (cid, cb, ctx) {
            socket.run('region.saveUserHomeRegion', { login: this.u.login(), cid: cid }, true)
                .then(function (data) {
                    cb.call(ctx, data);
                });
        },
        saveFilterRegions: function (regions, cb, ctx) {
            socket.run('region.saveUserRegions', { login: this.u.login(), regions: regions }, true)
                .then(function (data) {
                    cb.call(ctx, data);
                });
        },
        regionDrop: function (cid) {
            if (cid) {
                this.u.regions.remove(function (item) {
                    return item.cid() === cid;
                });
                var regions = ko_mapping.toJS(this.u.regions);
                this.saveFilterRegions(_.pluck(regions, 'cid'), function (err) {
                    this.originUser.regions = regions;
                    ga('send', 'event', 'region', 'update', 'photo update success', regions.length);
                }, this);
            }
        },
        regionHomeSelect: function () {
            if (!this.regHomeselectVM) {
                this.regionSelect([ko_mapping.toJS(this.u.regionHome)], 1, 1, 'Выбор домашнего региона',
                    function (vm) {
                        this.regHomeselectVM = vm;
                    },
                    function () {
                        var regions = this.regHomeselectVM.getSelectedRegions(['cid', 'title_local']);

                        if (regions.length !== 1) {
                            window.noty({
                                text: 'Необходимо выбрать один регион',
                                type: 'error',
                                layout: 'center',
                                timeout: 2000,
                                force: true
                            });
                            return;
                        }

                        this.saveHomeRegion(regions[0].cid, function (data) {
                            User.vm({ regionHome: Region.factory(data.region, 'home') }, this.u, true); //Обновляем регионы в текущей вкладке вручную
                            this.originUser.regionHome = data.region;

                            this.regHomeselectVM.destroy();
                            delete this.regHomeselectVM;

                            ga('send', 'event', 'region', 'update', 'region update success', regions.length);
                        }, this);
                    },
                    function () {
                        this.regHomeselectVM.destroy();
                        delete this.regHomeselectVM;
                    }, this);
            }
        },
        regionFilterSelect: function () {
            if (!this.regselectVM) {
                this.regionSelect(ko_mapping.toJS(this.u.regions), 0, 5, 'Изменение списка регионов для фильтрации по умолчанию',
                    function (vm) {
                        this.regselectVM = vm;
                    },
                    function () {
                        var regions = this.regselectVM.getSelectedRegions(['cid', 'title_local']);

                        if (regions.length > 5) {
                            window.noty({
                                text: 'Допускается выбирать до 5 регионов',
                                type: 'error',
                                layout: 'center',
                                timeout: 3000,
                                force: true
                            });
                            return;
                        }

                        this.saveFilterRegions(_.pluck(regions, 'cid'), function () {
                            User.vm({ regions: regions }, this.u, true); // Обновляем регионы в текущей вкладке вручную
                            this.originUser.regions = regions;

                            this.regselectVM.destroy();
                            delete this.regselectVM;

                            ga('send', 'event', 'region', 'update', 'region update success', regions.length);
                        }, this);
                    },
                    function () {
                        this.regselectVM.destroy();
                        delete this.regselectVM;
                    }, this);
            }
        },
        regionSelect: function (selected, min, max, title, onRender, onApply, onCancel, ctx) {
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
                            topic: title,
                            initWidth: '900px',
                            maxWidthRatio: 0.95,
                            fullHeight: true,
                            withScroll: true,
                            offIcon: { text: 'Отмена', click: onCancel, ctx: ctx },
                            btns: [
                                {
                                    css: 'btn-success',
                                    text: 'Применить',
                                    glyphicon: 'glyphicon-ok',
                                    click: onApply,
                                    ctx: ctx
                                },
                                { css: 'btn-warning', text: 'Отмена', click: onCancel, ctx: ctx }
                            ]
                        },
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