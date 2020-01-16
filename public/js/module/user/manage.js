/**
 * Модель управления пользователем
 */
define([
    'underscore', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'noties',
    'renderer', 'model/User', 'model/storage', 'text!tpl/user/manage.pug', 'css!style/user/manage', 'bs/collapse'
], function (_, Utils, socket, P, ko, Cliche, globalVM, noties, renderer, User, storage, pug) {
    function isYes(evt) {
        return !!evt.target.classList.contains('yes');
    }

    var ranksLang = {
        mec: 'Меценат',
        mec_silv: 'Серебряный меценат',
        mec_gold: 'Золотой меценат',
        adviser: 'Советник'
    };

    return Cliche.extend({
        pug: pug,
        options: {
            userVM: null
        },
        create: function () {
            var that = this;

            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;
            this.u_origin = storage.userImmediate(this.u.login()).origin;
            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу

            if (this.auth.iAm.role() < 10) {
                globalVM.router.navigate('/u/' + this.u.login());
            }

            this.role = ko.observable(String(this.u_origin.role));
            this.roles = [
                { cat: 'reg', name: 'Обычный пользователь' },
                { cat: 'mod', name: 'Модератор' },
                { cat: 'adm', name: 'Администратор' },
                { cat: 'sadm', name: 'Суперадминистратор' }
            ];
            this.roleCategory = ko.computed({
                read: function () {
                    switch (Number(this.role())) {
                        case 4:
                        case 5:
                            return 'mod';
                        case 10:
                            return 'adm';
                        case 11:
                            return 'sadm';
                        case 0:
                            return 'reg';
                        default:
                            return 'reg';
                    }
                },
                write: function (value) {
                    switch (value) {
                        case 'mod':
                            this.role('5');
                            break;
                        case 'adm':
                            this.role('10');
                            break;
                        case 'sadm':
                            this.role('11');
                            break;
                        case 'reg':
                            this.role('0');
                            break;
                        default:
                            this.role('0');
                    }
                },
                owner: this
            });
            this.regions = ko.observableArray(this.u_origin.mod_regions);
            this.credentialsChanged = this.co.credentialsChanged = ko.computed(function () {
                return Number(this.role()) !== this.u.role() || !_.isEqual(this.u_origin.mod_regions, this.regions());
            }, this);

            this.ranks = ko.observableArray();

            this.photoNewCan = ko.observable(0);
            this.photoNewLimit = ko.observable(null);
            this.photoNewLimitOrigin = ko.observable('Авто');
            this.photoNewLimitOption = ko.computed({
                read: function () {
                    return _.isString(that.photoNewLimit()) ? 'manual' : 'auto';
                },
                write: function (value) {
                    that.photoNewLimit(value === 'manual' ? '0' : null);
                }
            });

            Promise.all([that.getAllRanks(), that.getRules()]).then(function () {
                that.subscriptions.ranks = that.u.ranks.subscribe(_.debounce(that.ranksSelectedHandler, 1e3), that);
                that.subscriptions.photoLimit = that.photoNewLimit.subscribe(_.debounce(that.photoLimitHandler, 800), that);

                ko.applyBindings(globalVM, that.$dom[0]);
                that.show();
            });
        },
        show: function () {
            this.$dom.find('#accordion').collapse({
                toggle: false
            });
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        getAllRanks: function () {
            var self = this;
            return new Promise(function (resolve) {
                socket.run('settings.getUserRanks')
                    .then(function (result) {
                        for (var i = 0; i < result.length; i++) {
                            self.ranks.push({ key: result[i], desc: ranksLang[result[i]] || i });
                        }
                        resolve(result);
                    });
            });
        },
        getRules: function () {
            var self = this;
            return new Promise(function (resolve) {
                socket.run('profile.giveUserRules', { login: self.u.login() }, true)
                    .then(function (result) {
                        self.setRules(result.rules || {}, result.info || {});
                        resolve(result);
                    });
            });
        },
        setRules: function (rules, info) {
            if (_.isNumber(rules.photoNewLimit)) {
                this.photoNewLimit(String(rules.photoNewLimit));
                this.photoNewLimitOrigin(this.photoNewLimit());
            } else {
                this.photoNewLimit(null);
                this.photoNewLimitOrigin('Авто');
            }
            this.photoNewCan(info.canPhotoNew || 0);
        },

        saveCredentials: function () {
            var regionsCids;
            var role = Number(this.role());
            if (role === 5 && !_.isEqual(this.u_origin.mod_regions, this.regions())) {
                regionsCids = _.map(this.regions(), 'cid');
            }

            this.exe(true);
            socket.run('admin.saveUserCredentials', { login: this.u.login(), role: role, regions: regionsCids }, true)
                .then(function (/*data*/) {
                    var regions = regionsCids ? this.regions() : [];
                    var updatedProps = { role: role, mod_regions: regions };

                    _.assign(this.u_origin, updatedProps);
                    User.vm(updatedProps, this.u, true);

                    this.regions(regions); //Переприсваиваем, чтобы сработал computed
                    this.exe(false);
                }.bind(this));
        },
        cancelCredentials: function () {
            this.role(String(this.u_origin.role));
            this.regions(this.u_origin.mod_regions);
        },

        regionDrop: function (cid) {
            if (cid) {
                //Нужна полная замена массива, а не просто удаление элемента,
                //т.к. this.u_origin.mod_regions и this.regions() - один массив
                this.regions(_.filter(this.regions(), function (item) {
                    return item.cid !== cid;
                }));
            }
        },
        regionSelect: function () {
            if (!this.regselectVM) {
                renderer(
                    [{
                        module: 'm/region/select',
                        options: {
                            min: 0,
                            max: 20,
                            selectedInit: this.regions()
                        },
                        modal: {
                            topic: 'Изменение списка регионов для модерирования',
                            initWidth: '900px',
                            maxWidthRatio: 0.95,
                            fullHeight: true,
                            withScroll: true,
                            offIcon: { text: 'Отмена', click: this.closeRegionSelect, ctx: this },
                            btns: [
                                {
                                    css: 'btn-success', text: 'Применить', glyphicon: 'glyphicon-ok',
                                    click: function () {
                                        var regions = this.regselectVM.getSelectedRegions(['cid', 'title_local']);

                                        if (regions.length > 20) {
                                            return noties.alert({
                                                message: 'Допускается выбирать до 20 регионов',
                                                type: 'warning',
                                                timeout: 3000
                                            });
                                        }
                                        this.regions(regions);
                                        this.closeRegionSelect();
                                    },
                                    ctx: this
                                },
                                { css: 'btn-warning', text: 'Отмена', click: this.closeRegionSelect, ctx: this }
                            ]
                        },
                        callback: function (vm) {
                            this.regselectVM = vm;
                            this.childModules[vm.id] = vm;
                        }.bind(this)
                    }],
                    {
                        parent: this,
                        level: this.level + 1
                    }
                );
            }
        },
        closeRegionSelect: function () {
            if (this.regselectVM) {
                this.regselectVM.destroy();
                delete this.regselectVM;
            }
        },

        changeRestrictions: function (key, val, checkValChange, cb, ctx) {
            if (checkValChange && val === this.u[key]()) {
                return;
            }

            socket.run('profile.changeRestrictions', { login: this.u.login(), key: key, val: val }, true)
                .then(function (result) {
                    this.u[result.key](result.val);
                    this.u_origin[result.key] = result.val;

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

        changewaterchange: function (data, evt) {
            this.changeRestrictions('nowaterchange', !isYes(evt), true);
        },

        changenophotoupload: function (data, evt) {
            this.changeRestrictions('nophotoupload', !isYes(evt), true);
        },

        changenophotoedit: function (data, evt) {
            this.changeRestrictions('nophotoedit', !isYes(evt), true);
        },

        ranksSelectedHandler: function (val) {
            // Так, как сохранение ранков сделает emit во все сокеты, но этот хэндлер опять сработает,
            // т.к. будет новый объект массива с теми же значениями. Поэтому надо проверять на совпадение значений
            if (!_.isEqual(val, this.u_origin.ranks)) {
                this.saveUserRanks(function () {
                    // После обновлений званий надо обновить некоторые правила,
                    // так как они могут зависить от звания (например, лимит неподтвержденных)
                    this.getRules();
                }, this);
            }
        },
        saveUserRanks: function (cb, ctx) {
            socket.run('profile.saveUserRanks', { login: this.u.login(), ranks: this.u.ranks() }, true)
                .then(function (result) {
                    this.u_origin.ranks = result.ranks;
                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, result);
                    }
                }.bind(this));
        },

        photoLimitHandler: function (val) {
            if (this.photoNewLimitOption() === 'manual') {
                val = Number(val);
                if (isNaN(val)) {
                    return false;
                }
            } else {
                val = null;
            }

            socket.run('profile.saveUserRules', { login: this.u.login(), rules: { photoNewLimit: val } }, true)
                .then(function (result) {
                    this.setRules(result.rules || {}, result.info || {});
                }.bind(this));
        }
    });
});