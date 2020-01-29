/*global define:true*/
/**
 * Модель списка комментариев пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/user/comments.pug', 'css!style/user/comments'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, pug) {
    'use strict';

    var imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');

    return Cliche.extend({
        pug: pug,
        options: {
            userVM: null,
            type: 'photo', // Тип объекта по умолчанию (фото, новость и т.д.)
            statuses: ['active'] // Default statuses (active, del)
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;
            this.type = ko.observable(this.options.type);
            this.comments = ko.observableArray();
            this.commentsObjs = {};
            this.statusesCheckboxed = ko.observableArray(this.options.statuses.slice());
            this.loadingComments = ko.observable(false);

            this.itsMe = this.co.itsMe = ko.computed(function () {
                return this.auth.loggedIn() && this.auth.iAm.login() === this.u.login();
            }, this);

            this.types = {
                photo_persist: ko.observable(0),
                news_persist: ko.observable(0),
                photo: ko.observable(0),
                news: ko.observable(0)
            };

            this.statuses = {
                fetched: [],
                active_persist: ko.observable(0),
                del_persist: ko.observable(0),
                active: ko.observable(0),
                del: ko.observable(0),
            };

            this.page = ko.observable(0);
            this.pageSize = ko.observable(20);
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
                return Math.min(this.pageFirstItem() + this.pageSize() - 1, this.u.ccount());
            }, this);
            this.pages = this.co.pages = ko.computed(function () {
                var pageCount = this.pageLast(),
                    pageFrom = Math.max(1, this.page() - this.pageSlide()),
                    pageTo = Math.min(pageCount, this.page() + this.pageSlide()),
                    result = [],
                    i;

                pageFrom = Math.max(1, Math.min(pageTo - 2 * this.pageSlide(), pageFrom));
                pageTo = Math.min(pageCount, Math.max(pageFrom + 2 * this.pageSlide(), pageTo));

                for (i = pageFrom; i <= pageTo; i++) {
                    result.push(i);
                }
                return result;
            }, this);
            this.paginationShow = this.co.paginationShow = ko.computed(function () {
                return this.pageLast() > 1;
            }, this);

            this.briefText = this.co.briefText = ko.computed(function () {
                var count = this.types[this.type() + '_persist'](),
                    txt = '';
                if (count) {
                    txt = 'Показаны ' + globalVM.intl.num(this.pageFirstItem()) + '&nbsp;&ndash;&nbsp;' + globalVM.intl.num(this.pageLastItem()) + ' из ' + globalVM.intl.num(count);
                } else {
                    txt = 'Пользователь пока не оставил комментариев в данной категории';
                }
                return txt;
            }, this);

            this.pageUrl = ko.observable('/u/' + this.u.login() + '/comments');
            this.pageQuery = ko.observable('');

            // Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
            this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, { leading: true, trailing: true });

            // Subscriptions
            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);

            if (!this.auth.loggedIn()) {
                this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(function () {
                    this.getPage(this.page(), this.type(), this.onGetPage);
                }, this);
            }

            // Так как при первом заходе, когда модуль еще не зареквайрен, нужно вызвать самостоятельно,
            // а последующие будут выстреливать сразу
            this.routeHandler();
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
            this.commentsObjs = {};
            this.types.photo(0);
            this.types.news(0);
        },

        routeHandler: function () {
            var self = this;
            var params = globalVM.router.params();
            var page = Math.abs(Number(params.page)) || 1;
            var type = params.type || self.options.type;
            var rowStatuses = params.statuses ? params.statuses.split('!').filter(s => s === '0' || s === '1').map(Number).sort() : [];
            var statuses = params.statuses ? self.decodeStatuses(rowStatuses) : self.statusesCheckboxed();

            if (params.page && page < 2 || !self.types[type] || params.statuses && rowStatuses.join('!') !== params.statuses) {
                setTimeout(function () {
                    globalVM.router.navigate(self.pageUrl() + self.getUrlParams(page, type, rowStatuses), { replace: true });
                }, 100);
            } else if (page !== self.page() || type !== self.type() || !_.isEqual(statuses, self.statuses.fetched)) {
                if (type !== self.type() || !_.isEqual(statuses, self.statuses.fetched)) {
                    self.resetData();
                    self.type(type);
                    self.statusesCheckboxed(statuses);
                }

                if (!self.subscriptions.status) {
                    self.subscriptions.status = self.statusesCheckboxed.subscribe(self.handleStatus, self);
                }

                self.getPage(page, type, this.onGetPage);
            }
        },
        onGetPage: function (data) {
            this.pageQuery(location.search);
            this.page(data.page);
            this.makeBinding();
        },
        handleStatus: function (data) {
            if (!data.length) {
                setTimeout(function () {
                    this.statusesCheckboxed(['active']);
                }.bind(this), 10);
                return;
            }

            globalVM.router.navigate(this.pageUrl() + this.getUrlParams(this.page(), this.type(), this.encodeStatuses(data)));
        },

        encodeStatuses: function (statuses) {
            if (!statuses) {
                statuses = this.statusesCheckboxed();
            }

            return statuses.map(status => status === 'del' ? 0 : 1).sort();
        },

        decodeStatuses: function (statuses) {
            return statuses.map(s => s === 0 ? 'del' : 'active');
        },

        getUrlParams(page, type, statuses) {
            var paramsArr = [];


            if (this.types[type] && type !== 'photo') {
                paramsArr.push('type=' + type);
            }

            if (statuses.length > 1 || statuses.length === 1 && statuses[0] !== 1) {
                paramsArr.push('statuses=' + statuses.join('!'));
            }

            return (page > 1 ? '/' + page : '') + (paramsArr.length ? '?' + paramsArr.join('&') : '');
        },

        getPage: function (page, type, cb, ctx) {
            var self = this;
            var statuses = this.statusesCheckboxed().slice();
            self.loadingComments(true);

            socket.run('comment.giveForUser', {
                login: self.u.login(), type: type, page: page,
                active: statuses.indexOf('active') >= 0, del: statuses.indexOf('del') >= 0
            }, true)
                .then(function (data) {
                    var objs;
                    var comments;

                    if (data.page === page && data.type === type) {
                        objs = data.objs;
                        comments = data.comments;
                        self.statuses.fetched = statuses;

                        self.type(type);
                        self.pageSize(data.perPage || 24);
                        self.types.photo_persist(data.countPhoto || 0);
                        self.types.news_persist(data.countNews || 0);
                        self.types.photo(data.countPhoto || 0);
                        self.types.news(data.countNews || 0);
                        self.statuses.active_persist(data.countActive || 0);
                        self.statuses.del_persist(data.countDel || 0);
                        self.statuses.active(data.countActive || 0);
                        self.statuses.del(data.countDel || 0);

                        if (page > this.pageLast()) {
                            return globalVM.router.navigate(
                                self.pageUrl() + self.getUrlParams(this.pageLast(), type, self.encodeStatuses(statuses)),
                                { replace: true }
                            );
                        }

                        _.forOwn(objs, function (obj) {
                            if (type === 'photo') {
                                Photo.factory(obj, {
                                    type: 'compact',
                                    pic: 'q',
                                    can: { 'protected': obj.protected }
                                });
                                obj.link = '/p/' + obj.cid;
                                obj.title += ' <span class="photoYear">' + obj.y + '</span>';
                            } else if (type === 'news') {
                                obj.link = '/news/' + obj.cid;
                            }
                        });

                        comments.forEach(function (comment) {
                            // If comment was removed because its parent was removed,
                            // then link to that parent since the tree of deleted comments on the object page is collapsed.
                            // If it's not removed then link directly to the comment
                            var cid = comment.del && comment.del.origin ? comment.del.origin : comment.cid;

                            comment.obj = objs[comment.obj];
                            comment.link = comment.obj.link + '?hl=comment-' + cid;
                        });

                        this.commentsObjs = objs;
                        this.comments(comments);
                    }

                    this.loadingComments(false);
                    if (_.isFunction(cb)) {
                        cb.call(ctx || this, data);
                    }
                }.bind(this));
        },
        showHistory: function (objCid, cid) {
            if (!this.histVM) {
                renderer(
                    [
                        {
                            module: 'm/comment/hist',
                            modal: {
                                topic: 'История изменений комментария',
                                animateScale: true,
                                curtainClick: { click: this.closeHistory, ctx: this },
                                offIcon: { text: 'Закрыть', click: this.closeHistory, ctx: this },
                                btns: [
                                    { css: 'btn-primary', text: 'Закрыть', click: this.closeHistory, ctx: this }
                                ]
                            },
                            options: { objCid: objCid, cid: cid, type: this.type() },
                            callback: function (vm) {
                                this.histVM = vm;
                                this.childModules[vm.id] = vm;
                            }.bind(this)
                        }
                    ],
                    {
                        parent: this,
                        level: this.level + 2
                    }
                );
            }
        },
        closeHistory: function () {
            if (this.histVM) {
                this.histVM.destroy();
                delete this.histVM;
            }
        },
        onPreviewLoad: function (data, event) {
            event.target.parentNode.parentNode.classList.add('showPrv');
        },
        onPreviewErr: function (data, event) {
            var $photoBox = $(event.target.parentNode),
                parent = $photoBox[0].parentNode,
                content = '';

            event.target.style.visibility = 'hidden';
            content = imgFailTpl({
                style: 'width: 100%;margin-top:7px;padding-top:25px;background: url(/img/misc/imgw.png) 50% 0 no-repeat;',
                txt: ' '
            });
            $photoBox.find('.img').after(content);
            parent.classList.add('showPrv');
        }
    });
});