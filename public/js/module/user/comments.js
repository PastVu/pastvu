/*global define:true*/
/**
 * Модель списка комментариев пользователя
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'model/Photo', 'model/storage', 'text!tpl/user/comments.jade', 'css!style/user/comments'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, Photo, storage, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        options: {
            userVM: null,
            type: 'photo' // Тип объекта по умолчанию (фото, новость и т.д.)
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.u = this.options.userVM;
            this.type = ko.observable(this.options.type);
            this.comments = ko.observableArray();
            this.commentsObjs = {};
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

            this.page = ko.observable(0);
            this.pageSize = ko.observable(15);
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
                    txt = '' + this.pageFirstItem() + '&ndash;' + this.pageLastItem() + ' of ' + count + ' are shown';
                } else {
                    txt = 'User still has no comments in this category';
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

            if (params.page && page < 2) {
                return setTimeout(function () {
                    globalVM.router.navigate(self.pageUrl() + (type !== 'photo' ? '?type=' + type : ''), { replace: true });
                }, 100);
            } else if (!self.types[type]) {
                setTimeout(function () {
                    globalVM.router.navigate(self.pageUrl() + (page > 1 ? '/' + page : ''), { replace: true });
                }, 100);
            } else if (page !== self.page() || type !== self.type()) {
                if (type !== self.type()) {
                    self.resetData();
                }
                self.getPage(page, type, this.onGetPage);
            }
        },
        onGetPage: function (data) {
            this.pageQuery(location.search);
            this.page(data.page);
            this.makeBinding();
        },

        getPage: function (page, type, cb, ctx) {
            var self = this;
            self.loadingComments(true);

            socket.once('takeCommentsUser', function (data) {
                var objs;
                var comments;

                if (!data || data.error || !Array.isArray(data.comments)) {
                    window.noty({
                        text: data && data.message || 'Error occurred',
                        type: 'error',
                        layout: 'center',
                        timeout: 3000,
                        force: true
                    });
                } else if (data.page === page && data.type === type) {

                    objs = data.objs;
                    comments = data.comments;

                    self.type(type);
                    self.pageSize(data.perPage || 24);
                    self.types.photo_persist(data.countPhoto || 0);
                    self.types.news_persist(data.countNews || 0);
                    self.types.photo(data.countPhoto || 0);
                    self.types.news(data.countNews || 0);

                    if (_.isEmpty(comments) && page > 1) {
                        return setTimeout(function () {
                            globalVM.router.navigate(
                                self.pageUrl() + (self.paginationShow() ? '/' + self.pageLast() : '') +
                                (type !== 'photo' ? '?type=' + type : ''),
                                { replace: true }
                            );
                        }, 100);
                    }

                    _.forOwn(objs, function (obj) {
                        if (type === 'photo') {
                            obj.link = '/p/' + obj.cid;
                            obj.sfile = P.preaddr + Photo.picFormats.q + obj.file;
                            obj.title += ' <span class="photoYear">' + obj.y + '</span>';
                        } else if (type === 'news') {
                            obj.link = '/news/' + obj.cid;
                        }
                    });

                    comments.forEach(function (comment) {
                        comment.obj = objs[comment.obj];
                        comment.link = comment.obj.link + '?hl=comment-' + comment.cid;
                    });

                    this.commentsObjs = objs;
                    this.comments(comments);
                }

                this.loadingComments(false);
                if (_.isFunction(cb)) {
                    cb.call(ctx || this, data);
                }
            }, this);
            socket.emit('giveCommentsUser', { login: self.u.login(), type: type, page: page });
        },
        showHistory: function (cid) {
            if (!this.histVM) {
                renderer(
                    [
                        {
                            module: 'm/comment/hist',
                            modal: {
                                topic: 'History of comment\'s changes',
                                animateScale: true,
                                curtainClick: { click: this.closeHistory, ctx: this },
                                offIcon: { text: 'Close', click: this.closeHistory, ctx: this },
                                btns: [
                                    { css: 'btn-primary', text: 'Close', click: this.closeHistory, ctx: this }
                                ]
                            },
                            options: { cid: cid, type: this.type() },
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
        }
    });
});