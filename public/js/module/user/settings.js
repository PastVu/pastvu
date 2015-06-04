/**
 * Модель настроек пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Region', 'model/User', 'model/storage', 'text!tpl/user/settings.jade', 'css!style/user/settings', 'bs/collapse'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Region, User, storage, jade) {
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
                            //Если устанавляаем фильтрацию по Домашнему региону, снчала ставим домашний регион в фильтр, затем сохраняем настройку r_as_home
                            this.saveFilterRegions([this.u.regionHome.cid()], function (err) {
                                if (!err) {
                                    this.changeSetting('r_as_home', true, true, function () {
                                        this.originUser.regions = [ko.toJS(this.u.regionHome)];
                                        User.vm({ regions: this.originUser.regions }, this.u, true); //Обновляем регионы в текущей вкладке вручную
                                        ga('send', 'event', 'region', 'update', 'region update success', 1);
                                    }, this);
                                }
                            }, this);
                        } else {
                            if (valNew === 'all') {
                                this.saveFilterRegions([], function (err) {
                                    if (!err) {
                                        this.originUser.regions = [];
                                        User.vm({ regions: this.originUser.regions }, this.u, true); //Обновляем регионы в текущей вкладке вручную
                                        ga('send', 'event', 'region', 'update', 'region update success', 1);

                                        //Если был установлена фильтрация по Домашнему региону, отменяем её
                                        if (valPrev === 'home') {
                                            this.changeSetting('r_as_home', false, true);
                                        }
                                    }
                                }, this);
                            } else if (valNew === 'list') {
                                this.regionFilterSelect();

                                //Если был установлена фильтрация по Домашнему региону, отменяем её
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

                        return current;
                    },
                    write: function (valNew) {
                        // If clicked custom, but it value haven't set yet, do not save change.
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
                this.reconvertcheck = ko.observable('all');

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
            socket.once('takeUserSettingsVars', function (result) {
                if (result && !result.error) {
                    this.vars = result;
                }
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, result);
                }
            }, this);
            socket.emit('giveUserSettingsVars');
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        watermarkShow: function (data, evt) {
            this.changeSetting('photo_show_watermark', isYes(evt), true);
        },
        watermarkAdd: function (data, evt) {
            var flag = isYes(evt);
            var watersignCustom = this.u.watersignCustom();
            var newVal = !flag ? false : watersignCustom ? 'custom' : 'default';

            this.changeSetting('photo_watermark_add_sign', newVal, true);
        },
        watermarkCustomSave: function () {
            if (!this.watersignCustomChanged()) {
                return;
            }
            socket.once('setWatersignCustomResult', function (result) {
                if (result && !result.error && result.saved) {
                    var photo_watermark_add_sign = result.photo_watermark_add_sign || false;
                    var watersignCustom = result.watersignCustom || '';

                    this.u.settings.photo_watermark_add_sign(photo_watermark_add_sign);
                    this.originUser.settings.photo_watermark_add_sign = photo_watermark_add_sign;
                    this.photo_watermark_add_sign(photo_watermark_add_sign);

                    this.originUser.watersignCustom = watersignCustom;
                    this.u.watersignCustom(_.random(9)); // Ugly hack to invoke watersignCustomChanged computing
                    this.u.watersignCustom(watersignCustom);
                }
            }, this);
            socket.emit('setWatersignCustom', { login: this.u.login(), watersign: this.u.watersignCustom() });
        },
        watermarkCustomCancel: function () {
            this.u.watersignCustom(this.originUser.watersignCustom);
            this.photo_watermark_add_sign(this.u.settings.photo_watermark_add_sign());
        },
        watersignReset: function () {
            var option = this.resetwatersigncheck();
        },
        reconvertPhotos: function () {
            var option = this.reconvertcheck();
            var region = option === 'region' && $('#reconvertRegion', this.$dom).val();

            if (region) {
                region = Number(region) || undefined;
            }

            socket.once('convertPhotosForUserResult', function (data) {
                var error = !data || data.error;
                var warning = !error && !data.added;

                window.noty({
                    text: error ? data && data.message || 'Error occurred' :
                        warning ? 'Ни одной фотографии не отправлено на конвертацию' :
                        data.added + ' фотографий отправлено на повторную конвертацию',
                    type: error ? 'error' : warning ? 'warning' : 'success',
                    layout: 'center',
                    timeout: 3000,
                    force: true
                });

            }, this);
            socket.emit('convertPhotosForUser', { login: this.u.login(), r: region });
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
            socket.once('changeUserSettingResult', function (result) {
                if (result && !result.error && result.saved) {
                    this.u.settings[result.key](result.val);
                    this.originUser.settings[result.key] = result.val;
                }
                if (_.isFunction(cb)) {
                    cb.call(ctx, result);
                }
            }, this);
            socket.emit('changeUserSetting', { login: this.u.login(), key: key, val: val });
        },

        toggleDisp: function () {
            socket.once('changeDispNameResult', function (result) {
                if (result && !result.error && result.saved) {
                    this.u.disp(result.disp);
                    this.originUser.disp = result.disp;
                }
            }, this);
            socket.emit('changeDispName', { login: this.u.login(), showName: !this.showName() });
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
                        window.noty({
                            text: result.message || 'Error occurred',
                            type: 'error',
                            layout: 'center',
                            timeout: 3000,
                            force: true
                        });
                    }
                }
            }, this);
            socket.emit('changeEmail', { login: this.u.login(), email: this.u.email(), pass: pass });

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
                    window.noty({ text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true });
                }
                cb.call(ctx, error, data);
            }, this);
            socket.emit('saveUserHomeRegion', { login: this.u.login(), cid: cid });
        },
        saveFilterRegions: function (regions, cb, ctx) {
            socket.once('saveUserRegionsResult', function (data) {
                var error = !data || data.error || !data.saved;
                if (error) {
                    window.noty({ text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true });
                }
                cb.call(ctx, error);
            }, this);
            socket.emit('saveUserRegions', { login: this.u.login(), regions: regions });
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

                        this.saveHomeRegion(regions[0].cid, function (err, data) {
                            if (!err) {
                                User.vm({ regionHome: Region.factory(data.region, 'home') }, this.u, true); //Обновляем регионы в текущей вкладке вручную
                                this.originUser.regionHome = data.region;

                                this.regHomeselectVM.destroy();
                                delete this.regHomeselectVM;

                                ga('send', 'event', 'region', 'update', 'region update success', regions.length);
                            }
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

                        this.saveFilterRegions(_.pluck(regions, 'cid'), function (err) {
                            if (!err) {
                                User.vm({ regions: regions }, this.u, true); //Обновляем регионы в текущей вкладке вручную
                                this.originUser.regions = regions;

                                this.regselectVM.destroy();
                                delete this.regselectVM;

                                ga('send', 'event', 'region', 'update', 'region update success', regions.length);
                            }
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
                                { css: 'btn-success', text: 'Применить', glyphicon: 'glyphicon-ok', click: onApply, ctx: ctx },
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