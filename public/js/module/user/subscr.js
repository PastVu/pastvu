/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/storage', 'moment', 'text!tpl/user/subscr.pug', 'css!style/user/subscr'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, storage, moment, pug) {
    'use strict';

    const imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

    return Cliche.extend({
        pug: pug,
        options: {
            userVM: null,
            type: 'photo', // Тип объекта по умолчанию (фото, новость и т.д.)
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;
            this.binded = false;

            if (this.auth.loggedIn() && (this.auth.iAm.login() === this.u.login() || this.auth.iAm.role() > 9)) {
                this.type = ko.observable(this.options.type);
                this.objects = ko.observableArray();
                this.nextNoty = ko.observable(null);
                this.loading = ko.observable(false);

                this.itsMe = this.co.itsMe = ko.computed(function () {
                    return this.auth.iAm.login() === this.u.login();
                }, this);

                this.types = {
                    photo_persist: ko.observable(0),
                    news_persist: ko.observable(0),
                    photo: ko.observable(0),
                    news: ko.observable(0),
                };

                this.page = ko.observable(0);
                this.pageSize = ko.observable(0);
                this.pageSlide = ko.observable(2);

                this.pageLast = this.co.pageLast = ko.computed(function () {
                    return ((this.types[this.type()]() - 1) / this.pageSize() >> 0) + 1;
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
                    return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.types[this.type()]());
                }, this);
                this.pages = this.co.pages = ko.computed(function () {
                    const pageCount = this.pageLast();
                    let pageFrom = Math.max(1, this.page() - this.pageSlide());
                    let pageTo = Math.min(pageCount, this.page() + this.pageSlide());
                    const result = [];

                    pageFrom = Math.max(1, Math.min(pageTo - 2 * this.pageSlide(), pageFrom));
                    pageTo = Math.min(pageCount, Math.max(pageFrom + 2 * this.pageSlide(), pageTo));

                    for (let i = pageFrom; i <= pageTo; i++) {
                        result.push(i);
                    }

                    return result;
                }, this);
                this.paginationShow = this.co.paginationShow = ko.computed(function () {
                    return this.pageLast() > 1;
                }, this);

                this.briefText = this.co.briefText = ko.computed(function () {
                    const count = this.types[this.type() + '_persist']();
                    let txt = '';

                    if (count) {
                        txt = 'Показаны ' + globalVM.intl.num(this.pageFirstItem()) + '&nbsp;&ndash;&nbsp;' + globalVM.intl.num(this.pageLastItem() || this.pageSize()) + ' из ' + globalVM.intl.num(count);
                    } else {
                        txt = 'Пока нет подписок в данной категории';
                    }

                    return txt;
                }, this);

                this.pageUrl = ko.observable('/u/' + this.u.login() + '/subscriptions');
                this.pageQuery = ko.observable('');

                this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, { leading: true, trailing: true });

                // Subscriptions
                this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
                this.routeHandler();
            } else {
                globalVM.router.navigate('/u/' + this.u.login());
            }
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        makeBinding: function () {
            if (!this.binded) {
                ko.applyBindings(globalVM, this.$dom[0]);
                this.show();
                this.binded = true;
            }
        },
        resetData: function () {
            this.objects([]);
            this.types.photo(0);
            this.types.news(0);
        },

        routeHandler: function () {
            const self = this;
            const params = globalVM.router.params();
            const page = Math.abs(Number(params.page)) || 1;
            const type = params.type || self.options.type;

            if (params.page && page < 2) {
                return setTimeout(function () {
                    globalVM.router.navigate(self.pageUrl() + (type !== 'photo' ? '?type=' + type : ''), { replace: true });
                }, 100);
            }

            if (!self.types[type]) {
                setTimeout(function () {
                    globalVM.router.navigate(self.pageUrl() + (page > 1 ? '/' + page : ''), { replace: true });
                }, 100);
            } else if (page !== self.page() || type !== self.type()) {
                if (type !== self.type()) {
                    self.resetData();
                }

                self.getPage(page, type, function () {
                    self.pageQuery(location.search);
                    self.page(page);
                    self.makeBinding();
                });
            }
        },

        getPage: function (page, type, cb, ctx) {
            const self = this;

            self.loading(true);

            socket.run('subscr.giveUserSubscriptions', { login: self.u.login(), type: type, page: page }, true)
                .then(function (data) {
                    let obj;
                    let i = data.subscr.length;

                    self.type(type);
                    self.pageSize(data.perPage || 24);
                    self.types.photo_persist(data.countPhoto || 0);
                    self.types.news_persist(data.countNews || 0);
                    self.types.photo(data.countPhoto || 0);
                    self.types.news(data.countNews || 0);

                    if (!i && page > 1) {
                        return setTimeout(function () {
                            globalVM.router.navigate(
                                self.pageUrl() + (self.paginationShow() ? '/' + self.pageLast() : '') +
                                (type !== 'photo' ? '?type=' + type : ''),
                                { replace: true }
                            );
                        }, 100);
                    }

                    while (i--) {
                        obj = data.subscr[i];

                        if (type === 'photo') {
                            Photo.factory(obj, {
                                type: 'compact',
                                pic: 'm',
                                can: { 'protected': obj.protected },
                            });
                            obj.link = '/p/' + obj.cid;
                        } else if (type === 'news') {
                            obj.link = '/news/' + obj.cid;
                        }
                    }

                    self.objects(data.subscr);
                    self.nextNoty(data.nextNoty && moment(data.nextNoty) || null);

                    self.loading(false);

                    if (_.isFunction(cb)) {
                        cb.call(ctx, data);
                    }
                });
        },

        onPreviewLoad: function (data, event) {
            event.target.parentNode.parentNode.classList.add('showPrv');
        },
        onPreviewErr: function (data, event) {
            const $photoBox = $(event.target.parentNode);
            const parent = $photoBox[0].parentNode;
            let content = '';

            event.target.style.visibility = 'hidden';
            content = imgFailTpl({
                style: 'width: 100%;margin-top:7px;padding-top:25px;background: url(/img/misc/imgw.png) 50% 0 no-repeat;',
                txt: ' ',
            });
            $photoBox.find('.img').after(content);
            parent.classList.add('showPrv');
        },
    });
});
