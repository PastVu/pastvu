/**
 * Модель галереи фотографий
 */
define([
    'underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche',
    'globalVM', 'renderer', 'model/Photo', 'model/storage', 'm/photo/status', 'lib/jsuri',
    'noties', 'text!tpl/photo/gallery.jade', 'css!style/photo/gallery'
], function (_, Browser, Utils, socket, P, ko, koMapping, Cliche, globalVM,
             renderer, Photo, storage, statuses, Uri, noties, jade) {
    'use strict';
    var $window = $(window);
    var imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');
    var statusNums = statuses.nums;

    var filterS = _.transform(statusNums, function (result, status, num) {
        result.push({ s: num, title: status.filter_title });
    }, []);
    var filterSPublic = filterS.filter(function (filter) {
        return filter.s >= statuses.keys.PUBLIC;
    });

    return Cliche.extend({
        jade: jade,
        options: {
            addPossible: false,
            userVM: null,
            goUpload: false,
            filter: {}
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;
            this._ = _;

            this.photos = ko.observableArray();
            this.feed = ko.observable(false);
            this.coin = ko.observable(false);

            this.t = [];
            this.ccount = 1;
            this.year = statuses.years[statuses.type.PAINTING].min;
            this.year2 = statuses.years[statuses.type.PHOTO].max;

            this.count = ko.observable(0);
            this.limit = 30; //Стараемся подобрать кол-во, чтобы выводилось по-строчного. Самое популярное - 6 на строку
            this.loading = ko.observable(false);
            this.loadedFirst = ko.observable(false); //Говорит, что данные были загружены, хотя бы раз

            this.scrollActive = false;
            this.scrollHandler = function () {
                if ($window.scrollTop() >= $(document).height() - $window.height() - 400) {
                    this.getNextFeedPhotos();
                }
            }.bind(this);

            this.itsMine = this.co.itsMine = ko.computed(function () {
                return this.u && this.auth.iAm && this.u.login() === this.auth.iAm.login();
            }, this);

            this.filter = {
                //Параметры фильтра для запросов
                origin: '',
                //Значения фильтра для отображения
                disp: {
                    t: ko.observableArray(),
                    s: ko.observableArray(),
                    c: ko.observableArray(),
                    ccount: ko.observable(this.ccount),
                    r: ko.observableArray(), // Array of selected regions
                    rdis: ko.observableArray(), // Array of cids of inactive regions
                    rs: ko.observableArray(), // Enable/disable subregions
                    re: ko.observableArray(), // Array of cids of excluded regions
                    redis: ko.observableArray(), // Array of cids of inactive excluded regions, because of inactive parents
                    geo: ko.observableArray(),
                    year: ko.observable(this.year),
                    year2: ko.observable(this.year2)
                },
                active: ko.observable(true),
                inactivateString: '',
                can: {
                    s: this.co.filtercans = ko.computed(function () {
                        return this.auth.loggedIn();
                    }, this)
                },
                available: {
                    s: this.co.filteravailables = ko.computed(function () {
                        if (this.auth.iAm) {
                            // Владелец или модератор видят все статусы, можно регулировать
                            if (this.auth.iAm.role() > 4 || this.itsMine()) {
                                return filterS;
                            }
                            // Зарегистрированные видят статусы однажды опубликованных
                            return filterSPublic;
                        }
                        return [];
                    }, this)
                },
                admin: ko.computed(function () {
                    return this.auth.loggedIn() && this.auth.iAm.role() >= 10;
                }, this)
            };

            this.panelW = ko.observable('0px');
            this.w = ko.observable('0px');
            this.h = ko.observable('0px');

            this.page = ko.observable(1);
            this.pageSize = ko.observable(this.limit);
            this.pageSlide = ko.observable(2);

            this.pageLast = this.co.pageLast = ko.computed(function () {
                return ((this.count() - 1) / this.pageSize() >> 0) + 1;
            }, this);
            this.pageHasNext = this.co.pageHasNext = ko.computed(function () {
                return this.page() < this.pageLast();
            }, this);
            this.pageHasPrev = this.co.pageHasPrev = ko.computed(function () {
                return this.page() > 1;
            }, this);
            this.pageFirstItem = this.co.pageFirstItem = ko.computed(function () {
                return this.pageSize() * (this.page() - 1) + 1;
            }, this);
            this.pageLastItem = this.co.pageLastItem = ko.computed(function () {
                return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.count());
            }, this);
            this.pages = this.co.pages = ko.computed(function () {
                var pageCount = this.pageLast();
                var pageFrom = Math.max(1, this.page() - this.pageSlide());
                var pageTo = Math.min(pageCount, this.page() + this.pageSlide());
                var result = [];
                var i;

                pageFrom = Math.max(1, Math.min(pageTo - 2 * this.pageSlide(), pageFrom));
                pageTo = Math.min(pageCount, Math.max(pageFrom + 2 * this.pageSlide(), pageTo));

                for (i = pageFrom; i <= pageTo; i++) {
                    result.push(i);
                }
                return result;
            }, this);
            this.paginationShow = this.co.paginationShow = ko.computed(function () {
                return !this.feed() && !this.coin() && this.pageLast() > 1;
            }, this);

            this.yearsRange = this.co.yearsRange = ko.computed(function () {
                return this.getTypeYearsRange(this.filter.disp.t());
            }, this);

            this.rHash = this.co.rHash = ko.computed(function () {
                return this.filter.disp.r().reduce(function (result, region) {
                    result[region.cid] = region;
                    return result;
                }, {});
            }, this);

            this.rHashPlusParents = this.co.rHash = ko.computed(function () {
                return this.filter.disp.r().reduce(function (result, region) {
                    result[region.cid] = region;
                    if (region.parentRegionsArr) {
                        region.parentRegionsArr.forEach(function (region) {
                            result[region.cid] = region;
                        });
                    }
                    return result;
                }, {});
            }, this);

            this.rsIsPossible = this.co.rsIsPossible = ko.computed(function () {
                var rLen = this.filter.disp.r().length;
                var rdisLen = this.filter.disp.rdis().length;
                return rLen > 0 && rdisLen < rLen;
            }, this);

            this.activeChildLen = this.co.activeChildLen = ko.computed(function () {
                var r = this.filter.disp.r();
                var rdis = this.filter.disp.rdis();

                if (!this.rsIsPossible()) {
                    return Infinity;
                }

                return r.reduce(function (acc, region) {
                    if (region.childLen && !_.includes(rdis, region.cid)) {
                        return acc + region.childLen;
                    }

                    return acc;
                }, 0);
            }, this);

            this.reIsPossible = this.co.reIsPossible = ko.computed(function () {
                return !this.filter.disp.r().length || this.activeChildLen() > 0;
            }, this);

            this.reIsActive = this.co.reIsActive = ko.computed(function () {
                return this.reIsPossible() && !_.isEqual(this.filter.disp.rs(), ['0']);
            }, this);

            this.briefText = this.co.briefText = ko.computed(function () {
                var count = this.count();
                var txt = '';

                if (count) {
                    if (this.feed() || this.coin()) {
                        txt = 'Всего ' + globalVM.intl.num(count) + ' фотографий';
                    } else {
                        txt = 'Показаны ' + globalVM.intl.num(this.pageFirstItem()) + '&nbsp;&ndash;&nbsp;' + globalVM.intl.num(this.pageLastItem()) + ' из ' + globalVM.intl.num(count);
                    }
                } else {
                    txt = 'Пока нет ни одной фотографии';
                }

                return txt;
            }, this);

            if (this.u) {
                this.userModeAdditions();
                this.pageUrl = ko.observable('/u/' + this.u.login() + '/photo');
            } else {
                this.pageUrl = ko.observable('/ps');
            }
            this.pageQuery = ko.observable('');

            this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, { leading: true, trailing: true });

            // Subscriptions
            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
            this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
            this.subscriptions.filter_disp_r = this.filter.disp.r.subscribe(this.filterRHandle, this);
            this.subscriptions.filter_disp_rdis = this.filter.disp.rdis.subscribe(this.filterRdisHandle, this);
            this.subscriptions.filter_disp_s = this.filter.disp.s.subscribe(this.filterSHandle, this);
            this.subscriptions.filter_disp_y = this.filter.disp.year.subscribe(_.debounce(this.yearHandle, 800), this);
            this.subscriptions.filter_disp_y2 = this.filter.disp.year2.subscribe(_.debounce(this.year2Handle, 800), this);
            this.subscriptions.filter_disp_ccount = this.filter.disp.ccount.subscribe(_.debounce(this.ccountHandle, 800), this);
            this.subscriptions.filter_active = this.filter.active.subscribe(this.filterActiveChange, this);
            this.filterChangeHandleBlock = false;

            this.sizesCalc();
            this.routeHandler();
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            if (this.u && this.options.goUpload) {
                window.setTimeout(this.showUpload.bind(this), 500);
            }
            this.showing = true;
        },
        hide: function () {
            this.scrollDeActivate();
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        userModeAdditions: function () {
            this.canAdd = this.co.canAdd = ko.computed(function () {
                return this.options.addPossible && this.itsMine() && (this.feed() || this.page() === 1);
            }, this);

            this.subscriptions.login = this.u.login.subscribe(this.changeUserHandler, this); //Срабатывает при смене пользователя
            if (!this.auth.loggedIn()) {
                this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
            }
        },
        loggedInHandler: function () {
            //После логина перезапрашиваем фотографии пользователя
            //В режиме ленты также перезапрашиваем всё, а не только приватные,
            //т.к. необходимо обновить по регионам пользователя
            this.refreshPhotos();
            this.subscriptions.loggedIn.dispose();
            delete this.subscriptions.loggedIn;
        },
        changeUserHandler: function () {
            this.photos([]);
        },

        makeBinding: function () {
            if (!this.binded) {
                ko.applyBindings(globalVM, this.$dom[0]);
                this.binded = true;
                this.show();
            }
        },
        routeHandler: function () {
            var params = globalVM.router.params();
            var page = params.page;
            var filterString = params.f || '';
            var filterChange = false;
            var currPhotoLength = this.photos().length;
            var needRecieve = true;
            var preTitle = '';

            // Если сразу открываем загрузку, то обрабатываем галерею как обычный запуск, т.е. page будет 1
            // Если галерея уже загружена и затем открываем загрузку, то ничего делать не надо
            if (this.binded && params.photoUpload) {
                return;
            }

            // Если показывается окно загрузки, но в параметрах его нет,
            // значит мы вернулись из загрузки в галерею и должны загрузку просто закрыть
            if (this.uploadVM && !params.photoUpload) {
                this.destroyUpload();
                return;
            }

            //Переданные параметры фильтров
            if (filterString !== this.filter.origin && this.filter.active()) {
                this.filter.origin = filterString && filterString.length < 512 ? filterString : '';
                this.pageQuery(location.search);
                filterChange = true;
            }

            if (page === 'feed') {
                if (this.u) {
                    Utils.title.setTitle({ pre: preTitle + 'Лента изображений - ' });
                } else {
                    Utils.title.setTitle({ title: preTitle + 'Лента всех изображений' });
                }

                if (!this.coin() && this.page() === 1 && currPhotoLength && currPhotoLength <= this.limit) {
                    needRecieve = false; //Если переключаемся на ленту с первой заполненной страницы, то оставляем её данные
                } else {
                    this.photos([]);
                }

                page = 1;
                this.coin(false);
                this.feed(true);
                this.scrollActivate();
            } else if (page === 'coin') {
                if (this.u) {
                    // Users gallery can't have random gallery due to some mongodb indexes problem
                    globalVM.router.navigate(this.pageUrl() + this.pageQuery());
                    return;
                }

                Utils.title.setTitle({ title: preTitle + 'Случайные изображения' });

                page = 1;
                this.feed(false);
                this.scrollDeActivate();
                this.coin(true);
            } else {
                if (this.u) {
                    Utils.title.setTitle({ pre: preTitle + 'Галерея - ' });
                } else {
                    Utils.title.setTitle({ title: preTitle + 'Галерея' });
                }

                if (!this.coin() && page === 1 && this.page() === 1 && currPhotoLength) {
                    needRecieve = false; //Если переключаемся на страницы с ленты, то оставляем её данные для первой страницы
                    if (currPhotoLength > this.limit) {
                        this.photos.splice(this.limit);
                    }
                }

                page = Math.abs(Number(page)) || 1;
                this.coin(false);
                this.feed(false);
                this.scrollDeActivate();
            }
            this.page(page);

            if (!this.u) {
                ga('send', 'pageview'); //В галерее пользователя pageview отправляет userPage
            }

            if (needRecieve || filterChange) {
                this.makeBinding();
                this.getPhotos((page - 1) * this.limit, this.limit, function () {
                    this.loadedFirst(true);
                }, this);
            }
        },
        buildFilterString: function () {
            var filterString = '';
            var t = this.filter.disp.t().map(Number).sort();
            var c = this.filter.disp.c().map(Number).sort();
            var r = this.filter.disp.r();
            var re = this.filter.disp.re();
            var s = this.filter.disp.s().map(Number);
            var geo = this.filter.disp.geo();
            var year = Number(this.filter.disp.year());
            var year2 = Number(this.filter.disp.year2());
            var ccount = Number(this.filter.disp.ccount());
            var yearsRange = this.getTypeYearsRange();
            var i;

            if (r.length) {
                filterString += (filterString ? '_' : '') + 'r';
                for (i = 0; i < r.length; i++) {
                    filterString += '!' + r[i].cid;
                }

                var rhash = this.rHash();
                var rp = _.sortBy(this.filter.disp.rdis().filter(function (cid) {
                    return rhash.hasOwnProperty(cid);
                }));

                if (rp.length) {
                    filterString += (filterString ? '_' : '') + 'rp';
                    for (i = 0; i < rp.length; i++) {
                        filterString += '!' + rp[i];
                    }
                }

                var rs = this.filter.disp.rs();
                if (rs.length === 1) {
                    filterString += (filterString ? '_' : '') + 'rs!' + rs[0];
                }
            } else if (this.auth.iAm && this.auth.iAm.regions().length || re.length) {
                filterString += (filterString ? '_' : '') + 'r!0';
            }

            if (re.length) {
                filterString += (filterString ? '_' : '') + 're';
                for (i = 0; i < re.length; i++) {
                    filterString += '!' + re[i].cid;
                }
            }

            if (geo.length === 1) {
                filterString += (filterString ? '_' : '') + 'geo!' + geo[0];
            }
            if (s.length && this.auth.iAm && !_.isEqual(s, [statuses.keys.PUBLIC])) {
                var allowedS;

                if (this.auth.iAm.role() > 4 || this.itsMine()) {
                    // Владелец или модератор видят все статусы, можно регулировать
                    allowedS = filterS;
                } else {
                    // Зарегистрированные видят статусы однажды опубликованных
                    allowedS = filterSPublic;
                }

                s = _.intersection(s, _.map(allowedS, function (status) {
                    return Number(status.s);
                }));

                if (s.length) {
                    filterString += (filterString ? '_' : '') + 's';

                    if (s.length === allowedS.length) {
                        filterString += '!all';
                    } else {
                        s.sort();
                        for (i = 0; i < s.length; i++) {
                            filterString += '!' + s[i];
                        }
                    }
                }

            }
            if (t.length && !_.isEqual(t, [1, 2])) {
                filterString += (filterString ? '_' : '') + 't';
                for (i = 0; i < t.length; i++) {
                    filterString += '!' + t[i];
                }
            }
            if (year > yearsRange.min || year2 < yearsRange.max) {
                this.year = year;
                this.year2 = year2;
                filterString += (filterString ? '_' : '') + 'y!' + year + '!' + year2;
            }
            if (c.length && (!_.isEqual(c, [0, 1]) || ccount > 1)) {
                this.ccount = ccount;

                filterString += (filterString ? '_' : '') + 'c';
                if (_.includes(c, 0)) {
                    filterString += '!0';
                }
                if (_.includes(c, 1)) {
                    filterString += '!' + (ccount > 1 ? ccount : 1);
                }
            }

            return filterString;
        },
        filterActiveChange: function (val) {
            if (this.filterActiveChangeBlock) {
                return;
            }
            if (val) {
                this.filter.origin = this.filter.inactivateString;
                this.filter.inactivateString = '';
            } else if (!val) {
                this.filter.inactivateString = this.filter.origin;
                this.filter.origin = this.itsMine() ? '' : 'r!0'; //Своя галерея всегда отдается по всем по умолчанию
            }
            this.refreshPhotos();
        },
        filterChangeHandle: function () {
            if (this.filterChangeHandleBlock) {
                return;
            }
            //Если фильтр не активен, то "тихо" активируем, без рефреша
            if (!this.filter.active()) {
                this.filterActiveChangeBlock = true;
                this.filter.active(true);
                this.filterActiveChangeBlock = false;
            }

            // If number of children regions equals to zero and rs equals '1',
            // change it to '0' (set all, but in template will be set only '0')
            if (!this.activeChildLen() && _.isEqual(this.filter.disp.rs(), ['1'])) {
                this.filter.disp.rs(['0', '1']);
            }

            var newFilter = this.buildFilterString();
            if (newFilter !== this.filter.origin) {
                this.updateFilterUrl(newFilter);
            }
        },
        filterRHandle: function (val) {
            var rhash = this.rHash();

            // Check if we need to delete some excluded regions if some parent have been removed
            var re = this.filter.disp.re();
            if (re.length) {
                var reNew = re.reduce(function (result, region) {
                    if (region.parents && region.parents.some(function (cid) {return rhash[cid] !== undefined;})) {
                        result.push(region);
                    }
                    return result;
                }, []);

                if (reNew.length !== re.length) {
                    this.filter.disp.re(reNew);
                }
            }

            // Check if we need to delete some rdis
            var rdis = this.filter.disp.rdis();
            if (rdis.length) {
                var rdisNew = rdis.reduce(function (result, cid) {
                    if (rhash[cid]) {
                        result.push(cid);
                    }
                    return result;
                }, []);

                if (rdisNew.length !== rdis.length) {
                    this.filter.disp.rdis(rdisNew);
                }
            }

            this.filterChangeHandle();
        },
        filterRdisHandle: function (val) {
            var re = this.filter.disp.re();

            if (re.length) {
                // Check if we need to change array of inactive excluded regions
                var redisNew = re.reduce(function (result, region) {
                    if (region.parents && region.parents.some(function (cid) {return val.includes(cid);})) {
                        result.push(region.cid);
                    }
                    return result;
                }, []);

                this.filter.disp.redis(redisNew);
            }

        },
        filterSHandle: function (val) {
            if (_.isEmpty(val)) {
                // If user removes last status checkbox, set public status as default
                this.filter.disp.s([String(statuses.keys.PUBLIC)]);
            } else {
                this.filterChangeHandle();
            }
        },
        //Делает активным в фильтре только один переданный регион
        fronly: function (cid) {
            if (this.loading() || !cid) {
                return false;
            }
            var diss = [];

            this.filter.disp.r().forEach(function (item) {
                if (item.cid !== cid) {
                    diss.push(item.cid);
                }
            });
            this.filter.disp.rdis(diss);
            this.filterChangeHandle();
        },
        //Делает активнымы в фильтре все регионы
        fronlyall: function () {
            if (this.loading()) {
                return false;
            }
            this.filter.disp.rdis([]);
            this.filterChangeHandle();
        },
        // Активирует/деактивирует в фильтре переданный регион
        frdis: function (cid) {
            if (this.loading()) {
                return false;
            }
            if (cid) {
                var region = _.find(this.filter.disp.r(), function (item) {
                    return item.cid === cid;
                }, this);
                if (region) {
                    if (_.includes(this.filter.disp.rdis(), cid)) {
                        this.filter.disp.rdis.remove(cid);
                    } else {
                        this.filter.disp.rdis.push(cid);
                    }
                    this.filterChangeHandle();
                }
            }
        },
        // Деактивирует в фильтре все регионы
        frdisall: function () {
            if (this.loading()) {
                return false;
            }
            this.filter.disp.rdis(this.filter.disp.r().map(function (region) {
                return region.cid;
            }));
            this.filterChangeHandle();
        },
        // Удаляет из фильтра переданный регион
        frdel: function (cid) {
            if (this.loading() || !cid) {
                return false;
            }
            this.filter.disp.r.remove(function (item) {
                return item.cid === cid;
            });
        },
        // Удаляет из фильтра все регионы
        frdelall: function () {
            if (this.loading()) {
                return false;
            }
            this.filter.disp.r.removeAll();
        },
        // Удаляет из фильтра все регионы кроме переданного
        frdelothers: function (cid) {
            if (this.loading() || !cid) {
                return false;
            }
            this.filter.disp.rdis([])
            this.filter.disp.r.remove(function (item) {
                return item.cid !== cid;
            });
        },
        frselectparent: function (regionCidToReplace, parentRegion) {
            // Replace hovered region with clicked parent and remove all other selected children on that parent (if they exist)
            this.filter.disp.r(this.filter.disp.r().reduce(function (result, region) {
                if (region.cid === regionCidToReplace) {
                    result.push(parentRegion);

                    // And assign parents array object to assigning parent
                    if (parentRegion.parents) {
                        parentRegion.parentRegionsArr = region.parentRegionsArr.slice(parentRegion.parents.length);
                    }
                } else if (!region.parents || region.parents.every(function (cid) {return cid !== parentRegion.cid;})) {
                    result.push(region);
                }
                return result;
            }, []));
        },
        freselectparent: function (regionCidToReplace, parentRegion) {
            if (this.rHashPlusParents()[parentRegion.cid]) {
                return;
            }
            // Replace hovered region with clicked parent and remove all other selected children on that parent (if they exist)
            this.filter.disp.re(this.filter.disp.re().reduce(function (result, region) {
                if (region.cid === regionCidToReplace) {
                    result.push(parentRegion);

                    // And assign parents array object to assigning parent
                    if (parentRegion.parents) {
                        parentRegion.parentRegionsArr = region.parentRegionsArr.slice(parentRegion.parents.length);
                    }
                } else if (!region.parents || region.parents.every(function (cid) {return cid !== parentRegion.cid;})) {
                    result.push(region);
                }
                return result;
            }, []));
            this.filterChangeHandle();
        },
        // Удаляет из фильтра переданный исключающий регион
        fredel: function (cid) {
            if (this.loading() || !cid) {
                return false;
            }
            this.filter.disp.re.remove(function (item) {
                return item.cid === cid;
            });
            this.filterChangeHandle();
        },
        // Удаляет из фильтра все исключающие регионы
        fredelall: function () {
            if (this.loading()) {
                return false;
            }
            this.filter.disp.re.removeAll();
            this.filterChangeHandle();
        },
        // Удаляет из фильтра все исключающие регионы кроме переданного
        fredelothers: function (cid) {
            if (this.loading() || !cid) {
                return false;
            }
            this.filter.disp.re.remove(function (item) {
                return item.cid !== cid;
            });
            this.filterChangeHandle();
        },
        //Обработка клика вариантов присутствия координат в фильтре
        //Чтобы постаыить вторую галку, если обе сняты, т.к. должно быть хотя-бы одно из состояний
        fgeoclk: function (data, event) {
            var currDispGeo = data.filter.disp.geo();
            var clickedGeo = event.target.value;

            if (!currDispGeo.length) {
                //Если все варианты сняты, делаем активным второй вариант
                if (clickedGeo === '0') {
                    data.filter.disp.geo(['1']);
                } else {
                    data.filter.disp.geo(['0']);
                }
            }
            this.filterChangeHandle(); //Вручную вызываем обработку фильтра

            return true; //Возвращаем true, чтобы галка в браузере переключилась
        },
        ftclick: function (data, event) {
            var currDispType = data.filter.disp.t();
            var clickedType = event.target.value;

            if (!currDispType.length) {
                //Если все варианты сняты, делаем активным второй вариант
                if (clickedType === '1') {
                    data.filter.disp.t(['2']);
                } else {
                    data.filter.disp.t(['1']);
                }
            }

            var currentYearsRange = this.getTypeYearsRange(this.t);

            if (Number(this.filter.disp.year()) === currentYearsRange.min && Number(this.filter.disp.year2()) === currentYearsRange.max) {
                // If current years range is filling all possible range, also set new whole possible range
                var newYearsRange = this.getTypeYearsRange();

                this.filter.disp.year(newYearsRange.min);
                this.yearHandle(newYearsRange.min);
                this.filter.disp.year2(newYearsRange.max);
                this.year2Handle(newYearsRange.max);
            } else {
                // If not whole range was set, means user set it manually, so check if range fits
                this.yearHandle(this.filter.disp.year());
                this.year2Handle(this.filter.disp.year2());
            }

            clearTimeout(this.yearApplyTimeout);

            this.t = currDispType;
            this.filterChangeHandle(); //Вручную вызываем обработку фильтра

            return true; //Возвращаем true, чтобы галка в браузере переключилась
        },
        frsclick: function (data, event) {
            var currDisp = data.filter.disp.rs();
            var clicked = event.target.value;

            if (!currDisp.length) {
                //Если все варианты сняты, делаем активным второй вариант
                if (clicked === '0') {
                    data.filter.disp.rs(['1']);
                } else {
                    data.filter.disp.rs(['0']);
                }
            }
            this.filterChangeHandle(); //Вручную вызываем обработку фильтра

            return true; //Возвращаем true, чтобы галка в браузере переключилась
        },

        getTypeYearsRange: function (t) {
            return (t || this.filter.disp.t()).reduce(function (result, type) {
                var typeYears = statuses.years[type];

                result.min = Math.min(result.min, typeYears.min);
                result.max = Math.max(result.max, typeYears.max);

                return result;
            }, { min: Infinity, max: -Infinity });
        },
        yearHandle: function (year) {
            clearTimeout(this.yearApplyTimeout);

            year = Number(year);
            var yearsRange = this.getTypeYearsRange();

            // There is no zero year, people often muddle it up with 1 A.D.
            // https://en.wikipedia.org/wiki/0_(year)
            if (year === 0) {
                this.filter.disp.year(1);
                return;
            }
            if (!year || year < yearsRange.min) {
                this.filter.disp.year(yearsRange.min);
                return;
            }
            if (year > yearsRange.max) {
                this.filter.disp.year(yearsRange.max);
                return;
            }
            if (year > Number(this.filter.disp.year2())) {
                this.filter.disp.year2(year);
                return;
            }

            if (year !== this.year) {
                // Вручную вызываем обработку фильтра (по таймауту, чтобы обработчик смены типов мог сбросить)
                this.yearApplyTimeout = setTimeout(this.filterChangeHandle.bind(this), 10);
            }
        },
        year2Handle: function (year2) {
            clearTimeout(this.yearApplyTimeout);

            year2 = Number(year2);
            var yearsRange = this.getTypeYearsRange();

            // There is no zero year, people often muddle it up with 1 A.D.
            // https://en.wikipedia.org/wiki/0_(year)
            if (year2 === 0) {
                this.filter.disp.year2(1);
                return;
            }
            if (!year2 || year2 < yearsRange.min) {
                this.filter.disp.year2(yearsRange.min);
                return;
            }
            if (year2 > yearsRange.max) {
                this.filter.disp.year2(yearsRange.max);
                return;
            }
            if (year2 < Number(this.filter.disp.year())) {
                this.filter.disp.year(year2);
                return;
            }

            if (year2 !== this.year2) {
                // Вручную вызываем обработку фильтра (по таймауту, чтобы обработчик смены типов мог сбросить)
                this.yearApplyTimeout = setTimeout(this.filterChangeHandle.bind(this), 10);
            }
        },
        yearArrow: function (data, evt) {
            var yearsRange = this.getTypeYearsRange();
            var year = Number(this.filter.disp.year());
            var year2 = Number(this.filter.disp.year2());

            switch (evt.key) {
                case 'ArrowUp':
                    if (year < yearsRange.max) {
                        year = year + 1;
                        this.filter.disp.year(year);

                        if (year > year2) {
                            this.filter.disp.year2(year);
                        }
                    }
                    break;
                case 'ArrowDown':
                    if (year > yearsRange.min) {
                        this.filter.disp.year(year - 1);
                    }
                    break;
                default:
                    return true;
            }
        },
        year2Arrow: function (data, evt) {
            var yearsRange = this.getTypeYearsRange();
            var year = Number(this.filter.disp.year());
            var year2 = Number(this.filter.disp.year2());

            switch (evt.key) {
                case 'ArrowUp':
                    if (year2 < yearsRange.max) {
                        this.filter.disp.year2(year2 + 1);
                    }
                    break;
                case 'ArrowDown':
                    if (year2 > yearsRange.min) {
                        year2 = year2 - 1;
                        this.filter.disp.year2(year2);

                        if (year > year2) {
                            this.filter.disp.year(year2);
                        }
                    }
                    break;
                default:
                    return true;
            }
        },
        yearsReset: function () {
            clearTimeout(this.yearApplyTimeout);
            var yearsRange = this.getTypeYearsRange();

            this.filter.disp.year(yearsRange.min);
            this.filter.disp.year2(yearsRange.max);

            this.filterChangeHandle();
        },
        fcclick: function (data, event) {
            var currC = data.filter.disp.c();
            var clicked = event.target.value;

            if (!currC.length) {
                //Если все варианты сняты, делаем активным второй вариант
                if (clicked === '0') {
                    data.filter.disp.c(['1']);
                } else {
                    data.filter.disp.c(['0']);
                }
            }

            this.filterChangeHandle(); //Вручную вызываем обработку фильтра

            return true; //Возвращаем true, чтобы галка в браузере переключилась
        },
        ccountHandle: function (ccount) {
            ccount = Number(ccount);

            if (!ccount || ccount < 1) {
                this.filter.disp.ccount('1');
                return;
            }
            if (ccount > 9999) {
                this.filter.disp.ccount('9999');
                return;
            }

            if (_.includes(this.filter.disp.c(), '1') && ccount !== this.ccount) {
                // Вручную вызываем обработку фильтра
                this.filterChangeHandle();
            }
        },
        ccountArrow: function (data, evt) {
            var ccount = Number(this.filter.disp.ccount());

            switch (evt.key) {
                case 'ArrowUp':
                    if (ccount < 9999) {
                        ccount = ccount + 1;
                        this.filter.disp.ccount(String(ccount));
                    }
                    break;
                case 'ArrowDown':
                    if (ccount > 1) {
                        this.filter.disp.ccount(String(ccount - 1));
                    }
                    break;
                default:
                    return true;
            }
        },
        updateFilterUrl: function (filterString) {
            var uri = new Uri(location.pathname + location.search);
            if (filterString) {
                uri.replaceQueryParam('f', filterString);
            } else {
                uri.deleteQueryParam('f');
            }
            globalVM.router.navigate(uri.toString());
        },

        feedSelect: function (feed) {
            globalVM.router.navigate(this.pageUrl() + (feed ? '/feed' : '') + this.pageQuery());
        },
        modeSelect: function (mode) {
            var modifier = '';

            switch (mode) {
                case 2:
                    if (this.feed()) {
                        return;
                    }
                    ga('send', 'event', 'gallery', 'mode', 'mode feed');
                    modifier = '/feed';
                    break;
                case 3:
                    if (this.coin()) {
                        return;
                    }
                    ga('send', 'event', 'gallery', 'mode', 'mode coin');
                    modifier = '/coin';
                    break;
                default:
                    if (!this.feed() && !this.coin()) {
                        return;
                    }
                    ga('send', 'event', 'gallery', 'mode', 'mode page');
            }

            globalVM.router.navigate(this.pageUrl() + modifier + this.pageQuery());
        },
        scrollActivate: function () {
            if (!this.scrollActive) {
                $window.on('scroll', this.scrollHandler);
                this.scrollActive = true;
            }
        },
        scrollDeActivate: function () {
            if (this.scrollActive) {
                $window.off('scroll', this.scrollHandler);
                this.scrollActive = false;
            }
        },

        flipCoin: function () {
            ga('send', 'event', 'gallery', 'flipcoin', 'flipcoin');
            this.refreshPhotos();
        },
        refreshPhotos: function () {
            if (this.feed()) {
                //В режиме ленты перезапрашиваем всё
                this.getPhotos(0, Math.max(this.photos().length, this.limit), null, null, true);
            } else if (this.coin()) {
                this.getPhotos(0, this.limit, null, null, true);
            } else {
                //В постраничном режиме просто перезапрашиваем страницу
                this.getPhotos((this.page() - 1) * this.limit, this.limit);
            }
        },
        getNextFeedPhotos: function () {
            if (!this.loading()) {
                this.getPhotos(this.photos().length, this.limit);
            }
        },
        getPhotos: function (skip, limit, cb, ctx, forceReplace) {
            this.loading(true);
            this.receivePhotos(skip, limit, function (data) {
                if (!data || data.error) {
                    return;
                }
                this.count(data.count); //Вводим полное кол-во фотографий для пересчета пагинации
                if (this.page() > this.pageLast()) {
                    //Если вызванная страница больше максимальной, выходим и навигируемся на максимальную
                    return window.setTimeout(function () {
                        globalVM.router.navigate(this.pageUrl() + '/' + this.pageLast() + this.pageQuery());
                    }.bind(this), 200);
                }

                if (this.feed()) {
                    if (data.photos && data.photos.length) {
                        if (forceReplace) {
                            this.photos(data.photos);
                        } else {
                            this.photos.concat(data.photos, false);
                        }
                    }
                    if (this.scrollActive && limit > data.photos.length) {
                        this.scrollDeActivate();
                    }
                } else {
                    this.photos(data.photos);
                }
                this.loading(false);

                if (_.isFunction(cb)) {
                    cb.call(ctx, data);
                }
            }, this);
        },
        receivePhotos: function (skip, limit, cb, ctx) {
            var params = { skip: skip, limit: limit, filter: this.filter.origin };

            if (this.u) {
                params.login = this.u.login();
            }

            if (this.coin()) {
                params.random = true;
            }

            socket.run(this.u ? 'photo.giveUserGallery' : 'photo.givePS', params, true)
                .then(function (data) {
                    if (data.skip !== skip) {
                        return;
                    }

                    this.processPhotos(data.photos, data.rhash);

                    // Если фильтр активен - обновляем в нем данные
                    if (this.filter.active()) {
                        this.filterChangeHandleBlock = true;

                        // Если количество регионов равно, они пусты или массивы их cid равны,
                        // то и заменять их не надо, чтобы небыло "прыжка"
                        var rEquals = this.filter.disp.r().length === data.filter.r.length &&
                            (!data.filter.r.length || _.isEqual(_.map(this.filter.disp.r(), 'cid'), data.filter.r));


                        if (!data.filter.rs || !data.filter.rs.length) {
                            data.filter.rs = ['0', '1'];
                        }

                        this.filter.disp.rs(data.filter.rs);
                        this.filter.disp.re(data.filter.re.map(function (cid) {
                            var region = data.filter.rhash[cid];

                            if (region.parents) {
                                region.parentRegionsArr = region.parents.map(function (cid) {
                                    return data.filter.rhash[cid];
                                }).reverse();
                            }

                            return region;
                        }));
                        this.filter.disp.rdis(data.filter.rp || []);

                        if (!rEquals) {
                            this.filter.disp.r(data.filter.r.map(function (cid) {
                                var region = data.filter.rhash[cid];

                                if (region.parents) {
                                    region.parentRegionsArr = region.parents.map(function (cid) {
                                        return data.filter.rhash[cid];
                                    }).reverse();
                                }

                                return region;
                            }));
                        }

                        this.filter.disp.s(data.filter.s ? data.filter.s.map(String) : [String(statuses.keys.PUBLIC)]);

                        if (!data.filter.t || !data.filter.t.length) {
                            data.filter.t = [1, 2];
                        }
                        if (!data.filter.geo || !data.filter.geo.length) {
                            data.filter.geo = ['0', '1'];
                        }

                        this.t = data.filter.t.map(String);
                        this.filter.disp.t(this.t.slice());
                        this.filter.disp.geo(data.filter.geo);

                        if (_.isEmpty(data.filter.y)) {
                            var yearsRange = this.getTypeYearsRange();
                            data.filter.y = [yearsRange.min, yearsRange.max];
                        }
                        this.year = data.filter.y[0];
                        this.year2 = data.filter.y[1];
                        this.filter.disp.year(String(this.year));
                        this.filter.disp.year2(String(this.year2));

                        var c;
                        if (!_.isEmpty(data.filter.c)) {
                            c = [];
                            if (data.filter.c.no) {
                                c.push(0);
                            }
                            if (data.filter.c.min > 0) {
                                c.push(1);
                                this.ccount = data.filter.c.min;
                                this.filter.disp.ccount(String(this.ccount));
                            }
                        } else {
                            c = [0, 1];
                            this.ccount = 1;
                            this.filter.disp.ccount(String(this.ccount));
                        }
                        this.filter.disp.c(c.map(String));

                        this.filterChangeHandleBlock = false;
                    }

                    if (_.isFunction(cb)) {
                        cb.call(ctx, data);
                    }
                }.bind(this));
        },
        processPhotos: function (arr, regionsHash) {
            var photo;
            var i = arr.length;
            var j;

            while (i--) {
                photo = arr[i];
                Photo.factory(photo, {
                    type: 'compact',
                    pic: 'h',
                    customDefaults: { title: 'Без названия' },
                    can: { 'protected': photo.protected }
                });
                if (regionsHash && photo.rs !== undefined) {
                    for (j = photo.rs.length; j--;) {
                        photo.rs[j] = regionsHash[photo.rs[j]];
                    }
                }
            }
        },

        sizesCalc: function () {
            var windowW = window.innerWidth; //В @media ширина считается с учетом ширины скролла (кроме chrome<29), поэтому мы тоже должны брать этот размер
            var domW = this.$dom.width();
            var thumbW;
            var thumbH;
            var thumbN;
            var thumbWMin = 120;
            var thumbWMax = 246;
            var marginMin;

            if (windowW < 1000) {
                marginMin = 8;
            } else if (windowW < 1441) {
                marginMin = 10;
            } else {
                marginMin = 14;
            }
            if (domW < 900) {
                thumbN = 4;
            } else if (domW < 1300) {
                thumbN = 5;
            } else if (domW < 1441) {
                thumbN = 6;
            } else {
                thumbN = 7;
            }

            thumbW = Math.min(domW / thumbN - marginMin - 4, thumbWMax) >> 0;
            if (thumbW < thumbWMin) {
                thumbN = domW / (thumbWMin + marginMin) >> 0;
                thumbW = Math.min(domW / thumbN - marginMin - 4, thumbWMax) >> 0;
            }
            thumbH = thumbW / 1.5 >> 0;
            //margin = ((domW % thumbW) / (domW / thumbW >> 0)) / 2 >> 0;

            //Ширина для центрируемого холста с превьюшками для переносов. 4 прибавляем, чтобы учесть возможную погрешность
            this.panelW((thumbN * (thumbW + marginMin + 2) + 4 >> 0) + 'px');
            this.w(thumbW + 'px');
            this.h(thumbH + 'px');
        },

        showUpload: function () {
            if (!this.uploadVM) {
                this.waitUploadSince = new Date();
                renderer(
                    [
                        {
                            module: 'm/user/photoUpload',
                            modal: {
                                topic: 'Загрузка изображений',
                                initWidth: '1000px',
                                offIcon: {
                                    text: 'Отмена', click: function () {
                                        this.closeUpload();
                                    }, ctx: this
                                },
                                btns: [
                                    {
                                        css: 'btn-success', text: 'Завершить',
                                        click: function () {
                                            this.uploadVM.createPhotos(function (data) {
                                                if (data && !data.error) {
                                                    this.getAndCloseUpload(data.cids.length);
                                                    ga('send', 'event', 'photo', 'create', 'photo create success', data.cids.length);
                                                } else {
                                                    ga('send', 'event', 'photo', 'create', 'photo create error');
                                                }
                                            }, this);
                                        }, ctx: this
                                    },
                                    {
                                        css: 'btn-warning', text: 'Отмена',
                                        click: function () {
                                            this.closeUpload();
                                        }, ctx: this
                                    }
                                ]
                            },
                            callback: function (vm) {
                                this.uploadVM = vm;
                                this.childModules[vm.id] = vm;
                            }.bind(this)
                        }
                    ],
                    {
                        parent: this,
                        level: this.level + 1
                    }
                );
            }
        },
        getAndCloseUpload: function (newCount) {
            if (this.uploadVM) {
                if (newCount) {
                    this.loading(true);
                    socket.run('photo.giveFresh', { login: this.u.login(), after: this.waitUploadSince }, true)
                        .catch(_.noop)
                        .then(function (data) {
                            if (!_.isEmpty(data)) {
                                this.processPhotos(data.photos, data.rhash);
                                this.count(this.count() + data.photos.length);
                                this.auth.setProps({ pfcount: this.auth.iAm.pfcount() + data.photos.length });

                                if (this.page() > 1 || this.filter.origin) {
                                    // Если в постраничном режиме не на первой странице или активен фильтр,
                                    // то переходим на первую без фильтров
                                    globalVM.router.navigate(this.pageUrl());
                                } else {
                                    // Если с учетом добавленных текущие вылезут за лимит страницы, удаляем текущие
                                    if (!this.feed() && this.photos().length + data.photos.length > this.limit) {
                                        this.photos.splice(this.limit - data.photos.length);
                                    }
                                    this.photos.concat(data.photos, true);
                                }
                            }

                            this.loading(false);
                        }.bind(this));
                }
                this.closeUpload();
            }
        },
        closeUpload: function () {
            //Закрытие будет вызвано автоматиечски после срабатывания routeHandler
            globalVM.router.navigate(this.pageUrl() + (this.feed() ? '/feed' : (this.page() > 1 ? '/' + this.page() : '')) + this.pageQuery());
        },
        destroyUpload: function () {
            if (this.uploadVM) {
                this.uploadVM.destroy();
                delete this.uploadVM;
                delete this.waitUploadSince;
            }
        },

        onPreviewLoad: function (data, event) {
            event.target.parentNode.parentNode.classList.add('showPrv');
        },
        onPreviewErr: function (data, event) {
            var $photoBox = $(event.target.parentNode);
            var parent = $photoBox[0].parentNode;
            var content = '';

            event.target.style.visibility = 'hidden';
            if (data.conv) {
                content = imgFailTpl({
                    style: 'margin-top:7px;padding-top:20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;',
                    txt: 'Превью уже создается<br>пожалуйста, обновите позже'
                });
            } else if (data.convqueue) {
                content = imgFailTpl({
                    style: 'margin-top:7px;',
                    txt: '<span class="glyphicon glyphicon-road"></span><br>Превью скоро будет создано<br>пожалуйста, обновите позже'
                });
            } else {
                content = imgFailTpl({
                    style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;',
                    txt: 'Превью недоступно'
                });
            }
            $photoBox.find('.curtain').after(content);
            parent.classList.add('showPrv');
        },

        regionSelect: function () {
            if (!this.regselectVM) {
                renderer(
                    [
                        {
                            module: 'm/region/select',
                            options: {
                                min: 0,
                                max: 10,
                                selectedInit: this.filter.disp.r()
                            },
                            modal: {
                                topic: 'Выбор регионов для фильтрации',
                                initWidth: '900px',
                                maxWidthRatio: 0.95,
                                fullHeight: true,
                                withScroll: true,
                                offIcon: { text: 'Отмена', click: this.closeRegionSelect, ctx: this },
                                btns: [
                                    {
                                        css: 'btn-success',
                                        text: 'Применить',
                                        glyphicon: 'glyphicon-ok',
                                        click: function () {
                                            var regions = this.regselectVM.getSelectedRegions(['cid', 'parents', 'title_local', 'childLen']);

                                            if (regions.length > 10) {
                                                return noties.alert({
                                                    message: 'Допускается выбирать до 10 регионов',
                                                    type: 'warning',
                                                    timeout: 4000,
                                                    ok: true
                                                });
                                            }

                                            this.filter.disp.r(regions.map(function (region) {
                                                if (region.parents) {
                                                    region.parentRegionsArr = this.regselectVM
                                                        .getRegionsByCids(region.parents, ['cid', 'parents', 'title_local', 'childLen'])
                                                        .reverse();
                                                }

                                                return region;
                                            }, this));

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
                        }
                    ],
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

        regionExcludeSelect: function () {
            if (this.regselectVM || !this.activeChildLen()) {
                return;
            }

            var topcids;
            var r = this.filter.disp.r();

            if (r.length) {
                topcids = r.reduce(function (result, region) {
                    if (region.childLen) {
                        result.push(region.cid);
                    }
                    return result;
                }, []);

                if (!topcids.length) {
                    return;
                }
            }

            renderer(
                [
                    {
                        module: 'm/region/select',
                        options: {
                            min: 0,
                            max: 10,
                            selectedInit: this.filter.disp.re(),
                            topCidsFilter: topcids,
                            neverSelectable: topcids
                        },
                        modal: {
                            topic: 'Выбор регионов для исключения из фильтрации',
                            initWidth: '900px',
                            maxWidthRatio: 0.95,
                            fullHeight: true,
                            withScroll: true,
                            offIcon: { text: 'Отмена', click: this.closeRegionExcludeSelect, ctx: this },
                            btns: [
                                {
                                    css: 'btn-success',
                                    text: 'Применить',
                                    glyphicon: 'glyphicon-ok',
                                    click: function () {
                                        var regions = this.regselectVM.getSelectedRegions(['cid', 'parents', 'title_local']);

                                        if (regions.length > 10) {
                                            return noties.alert({
                                                message: 'Допускается выбирать до 10 регионов',
                                                type: 'warning',
                                                timeout: 4000,
                                                ok: true
                                            });
                                        }

                                        this.filter.disp.re(regions.map(function (region) {
                                            if (region.parents) {
                                                region.parentRegionsArr = this.regselectVM
                                                    .getRegionsByCids(region.parents, ['cid', 'parents', 'title_local', 'childLen'])
                                                    .reverse();
                                            }

                                            return region;
                                        }, this));
                                        this.closeRegionExcludeSelect();

                                        // Вручную вызываем обработку фильтра
                                        this.filterChangeHandle();
                                    },
                                    ctx: this
                                },
                                { css: 'btn-warning', text: 'Отмена', click: this.closeRegionExcludeSelect, ctx: this }
                            ]
                        },
                        callback: function (vm) {
                            this.regselectVM = vm;
                            this.childModules[vm.id] = vm;
                        }.bind(this)
                    }
                ],
                {
                    parent: this,
                    level: this.level + 1
                }
            );
        },
        closeRegionExcludeSelect: function () {
            if (this.regselectVM) {
                this.regselectVM.destroy();
                delete this.regselectVM;
            }
        }
    });
});