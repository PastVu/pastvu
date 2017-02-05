/**
 * Модель нижней панели на главной
 */
define(['underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/User', 'model/storage', 'm/photo/status', 'text!tpl/main/bottomPanel.jade', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, User, storage, statuses, jade) {
    'use strict';

    var catsObj = {
            photosToApprove: { name: 'Awaiting confirmation', tpl: 'photosTpl' },
            photos: { name: 'New photos', tpl: 'photosTpl' },
            photosNoGeo: { name: 'Where is it?', tpl: 'photosTpl' },
            ratings: { name: 'Rating', tpl: 'ratingsTpl' },
            stats: { name: 'Statistic', tpl: 'statsTpl' }
        },
        cats = [
            'photos',
            'photosNoGeo',
            'ratings',
            'stats'
        ],
        catsMod = [
            'photosToApprove'
        ],
        imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>'),
        declension = {
            user: [' user', ' users', ' users'],
            reg: [' registerd', ' registerd', ' registerd'],
            photo: [' photo', ' photos', ' photos'],
            comment: [' comment', ' comments', ' comments'],
            view: [' view', ' views', ' views']
        };

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.news = ko.observableArray();

            this.catsObj = catsObj;
            this.cats = ko.observableArray(cats);
            if (this.auth.loggedIn() && this.auth.iAm.role() > 4 && catsMod.length) {
                this.cats.concat(catsMod, true);
                catsMod = []; //FIXME: Конкат изменяет исходный массив
            }
            this.catLoading = ko.observable('');
            this.catActive = ko.observable('');
            this.moreLink = ko.observable('');

            this.photos = ko.observableArray();
            this.ratings = {
                pbyview: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day')
                },
                pbycomm: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day')
                },
                ubycomm: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day')
                },
                ubyphoto: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day')
                }
            };
            this.stats = {
                all: {
                    pallCount: 0,
                    userCount: 0,
                    photoYear: {},
                    pdayCount: 0,
                    pweekCount: 0,
                    callCount: 0,
                    cdayCount: 0,
                    cweekCount: 0
                },
                common: {
                    onall: 0,
                    onreg: 0
                }
            };

            this.catClickBind = this.catClick.bind(this);

            if (this.auth.iAm.role() > 4) {
                this.catJump('photosToApprove');
            } else {
                this.catJump('photos');
            }

            if (!this.auth.loggedIn()) {
                this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
            }

            //Байндимся и показываемся только после запроса новостей, чтобы избежать "прыжка" после их загрузки
            this.getNews(function () {
                ko.applyBindings(globalVM, this.$dom[0]);
                this.show();
            }, this);
        },
        show: function () {
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        loggedInHandler: function () {
            if (this.auth.iAm.role() > 4 && catsMod.length) {
                //Если пользователь модератор, добавляем галерею на подтверждение и переключаемся на нее
                this.cats.concat(catsMod, true);
                catsMod = [];
                this.catJump('photosToApprove');
            } else if (this.catActive() === 'photos' || this.catActive() === 'photosNoGeo') {
                //Если перезагружаем текущую категорию
                this.catJump(this.catActive());
            }

            //Перезапрашиваем новости на главной, чтобы увидеть новые комментарии или убрать скрытые пользователем новости
            this.getNews();

            this.subscriptions.loggedIn.dispose();
            delete this.subscriptions.loggedIn;
        },
        catClick: function (data) {
            this.catJump(data, true);
        },
        catJump: function (id, scroll) {
            this.catLoading(id);
            this['get' + Utils.capitalizeFirst(id)](this.catActivate, this, scroll);
        },
        catActivate: function (success, scroll) {
            if (success) {
                if (scroll) {
                    var $catMenu = this.$dom.find('.catMenu'),
                        catContentHeight = this.$dom.find('.catContent').height(),
                        cBottom = $catMenu.offset().top + $catMenu.height() + 60,
                        wTop = $(window).scrollTop(),
                        wFold = $(window).height() + wTop;

                    if (wFold < cBottom) {
                        $(window).scrollTo('+=' + (cBottom - wFold + catContentHeight / 2 >> 0) + 'px', {
                            axis: 'y', duration: 200, onAfter: function () {
                                this.catSetLoading();
                            }.bind(this)
                        });
                    } else {
                        this.catSetLoading();
                    }
                } else {
                    this.catSetLoading();
                }
            } else {
                this.catLoading('');
            }
        },
        catSetLoading: function (/*success, scroll*/) {
            this.catActive(this.catLoading());
            this.catLoading('');
        },
        getNews: function (cb, ctx, scroll) {
            var self = this;
            socket.run('index.giveIndexNews', undefined, true).then(function (data) {
                var success = false;
                data.news.forEach(function (news) {
                    news.ccount = news.ccount || 0;
                    news.ccount_new = news.ccount_new || 0;
                    if (news.notice) {
                        news.expand = true;
                    } else {
                        news.notice = news.txt;
                    }
                });

                self.news(data.news);
                success = true;
                if (_.isFunction(cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },
        getPhotos: function (cb, ctx, scroll) {
            var self = this;
            socket.run('photo.givePublicIndex', undefined, true).then(function (data) {
                var success = false;
                if (self.catLoading() === 'photos') {
                    self.processPhotos(data.photos, data.rhash, Photo.picFormats.m);
                    self.photos(data.photos);
                    self.moreLink('/ps/2');
                    success = true;
                }
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },
        getPhotosNoGeo: function (cb, ctx, scroll) {
            var self = this;

            socket.run('photo.givePublicNoGeoIndex', undefined, true).then(function (data) {
                var success = false;
                if (self.catLoading() === 'photosNoGeo') {
                    self.processPhotos(data.photos, data.rhash, Photo.picFormats.m);
                    self.photos(data.photos);
                    self.moreLink('/ps/2?f=geo!0');
                    success = true;
                }
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },
        getPhotosToApprove: function (cb, ctx, scroll) {
            var self = this;

            socket.run('photo.giveForApprove', { skip: 0, limit: 42 }, true).then(function (data) {
                var success = false;
                if (self.catLoading() === 'photosToApprove') {
                    self.processPhotos(data.photos, data.rhash, Photo.picProtectedFormats.m);
                    self.photos(data.photos);
                    self.moreLink('/ps/2?f=r!0_s!' + statuses.keys.READY);
                    success = true;
                }
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },
        getRatings: function (cb, ctx, scroll) {
            var success = false;
            var self = this;
            socket.run('index.giveRatings', { limit: 24 }, true).then(function (data) {
                var ratings = self.ratings;
                if (self.catLoading() === 'ratings') {
                    ratings.pbyview.day(self.processPhotos(data.pday, data.rhash, Photo.picFormats.s, 'vdcount', declension.view));
                    ratings.pbyview.week(self.processPhotos(data.pweek, data.rhash, Photo.picFormats.s, 'vwcount', declension.view));
                    ratings.pbyview.all(self.processPhotos(data.pall, data.rhash, Photo.picFormats.s, 'vcount', declension.view));

                    ratings.pbycomm.day(self.processPhotos(data.pcday, data.rhash, Photo.picFormats.s, 'ccount', declension.comment));
                    ratings.pbycomm.week(self.processPhotos(data.pcweek, data.rhash, Photo.picFormats.s, 'ccount', declension.comment));
                    ratings.pbycomm.all(self.processPhotos(data.pcall, data.rhash, Photo.picFormats.s, 'ccount', declension.comment));

                    ratings.ubycomm.day(self.processUsers(data.ucday, 'comments', 'ccount', declension.comment));
                    ratings.ubycomm.week(self.processUsers(data.ucweek, 'comments', 'ccount', declension.comment));
                    ratings.ubycomm.all(self.processUsers(data.ucall, 'comments', 'ccount', declension.comment));

                    ratings.ubyphoto.day(self.processUsers(data.upday, 'photo', 'pcount', declension.photo));
                    ratings.ubyphoto.week(self.processUsers(data.upweek, 'photo', 'pcount', declension.photo));
                    ratings.ubyphoto.all(self.processUsers(data.upall, 'photo', 'pcount', declension.photo));
                    success = true;
                }
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },
        getStats: function (cb, ctx, scroll) {
            var success = false;
            var self = this;

            socket.run('index.giveIndexStats', undefined, true).then(function (data) {
                if (self.catLoading() === 'stats') {
                    self.stats.all = data.all;
                    self.stats.common = data.common;
                    self.stats.common.onlineTxt = 'Now ' + globalVM.intl.num(data.common.onall) +
                        declension.user + (data.common.onall > 1 ? 's' : '') + ' is online, ' +
                        data.common.onreg + ' of them are registered';
                    success = true;
                }
                if (Utils.isType('function', cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },

        ratSelect: function (data, event) {
            var group = $(event.target).parents('.btn-group').attr('id');
            var id = $(event.target).attr('data-time');
            this.ratings[group].selected(id);
        },
        processPhotos: function (photos, regionsHash, picFormat, numField, numFormat) {
            var photo;
            var j;

            for (var i = photos.length; i--;) {
                photo = photos[i];

                photo.sfile = picFormat + photo.file;
                photo.link = '/p/' + photo.cid;

                if (!photo.title) {
                    photo.title = 'Without title';
                }
                if (numField && numFormat) {
                    photo.amount = globalVM.intl.num(photo[numField]) + Utils.format.wordEndOfNum(photo[numField], numFormat);
                }
                if (regionsHash && photo.rs !== undefined) {
                    for (j = photo.rs.length; j--;) {
                        photo.rs[j] = regionsHash[photo.rs[j]];
                    }
                }
            }
            return photos;
        },
        processUsers: function (users, linkSection, numField, numFormat) {
            var i = users.length;
            var user;
            while (i) {
                user = users[--i];
                user.sfile = user.avatar ? '/_a/d/' + user.avatar : User.def.full.avatar;
                user.link = '/u/' + user.login + (linkSection ? '/' + linkSection : '');
                user.title = user.disp;
                if (numField && numFormat) {
                    user.amount = globalVM.intl.num(user[numField]) + Utils.format.wordEndOfNum(user[numField], numFormat);
                }
            }
            return users;
        },

        onPreviewLoad: function (data, event) {
            event.target.parentNode.parentNode.classList.add('showPrv');
        },
        onPreviewErr: function (data, event) {
            var $photoBox = $(event.target.parentNode),
                parent = $photoBox[0].parentNode,
                content = '';

            event.target.style.visibility = 'hidden';
            if (data.conv) {
                content = imgFailTpl({
                    style: 'margin-top:7px;padding-top:20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;',
                    txt: 'Preview is being created <br>please update later'
                });
            } else if (data.convqueue) {
                content = imgFailTpl({
                    style: 'margin-top:7px;',
                    txt: '<span class="glyphicon glyphicon-road"></span><br>Preview will be created soon'
                });
            } else {
                content = imgFailTpl({
                    style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;',
                    txt: 'Preview is unavailable'
                });
            }
            $photoBox.append(content);
            parent.classList.add('showPrv');
        }
    });
});