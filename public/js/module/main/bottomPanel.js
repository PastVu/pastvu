/**
 * Модель нижней панели на главной
 */
define(['underscore', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'model/User', 'model/storage', 'm/photo/status', 'text!tpl/main/bottomPanel.pug', 'css!style/main/bottomPanel'], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, Photo, User, storage, statuses, pug) {
    'use strict';

    const catsObj = {
        photosToApprove: { name: 'Ожидают подтверждения', tpl: 'photosTpl' },
        photos: { name: 'Новые фото', tpl: 'photosTpl' },
        photosNoGeo: { name: 'Где это?', tpl: 'photosTpl' },
        ratings: { name: 'Рейтинги', tpl: 'ratingsTpl' },
        stats: { name: 'Статистика', tpl: 'statsTpl' },
    };
    const cats = [
        'photos',
        'photosNoGeo',
        'ratings',
        'stats',
    ];
    let catsMod = [
        'photosToApprove',
    ];
    const imgFailTpl = _.template('<div class="imgFail"><div class="failContent" style="${ style }">${ txt }</div></div>');
    const declension = {
        user: [' пользователь', ' пользователя', ' пользователей'],
        reg: [' зарегистрирован', ' зарегистрированых', ' зарегистрированых'],
        photo: [' фотография', ' фотографии', ' фотографий'],
        comment: [' комментарий', ' комментария', ' комментариев'],
        view: [' просмотр', ' просмотра', ' просмотров'],
    };

    return Cliche.extend({
        pug: pug,
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
                    selected: ko.observable('day'),
                },
                pbycomm: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day'),
                },
                ubycomm: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day'),
                },
                ubyphoto: {
                    day: ko.observableArray(),
                    week: ko.observableArray(),
                    all: ko.observableArray(),
                    selected: ko.observable('day'),
                },
            };
            this.stats = {
                all: {
                    pallCount: 0,
                    ppubCount: 0,
                    userCount: 0,
                    photoYear: {},
                    pdayCount: 0,
                    pweekCount: 0,
                    callCount: 0,
                    cpubCount: 0,
                    cdayCount: 0,
                    cweekCount: 0,
                },
                common: {
                    onall: 0,
                    onreg: 0,
                },
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
                    const $catMenu = this.$dom.find('.catMenu');
                    const catContentHeight = this.$dom.find('.catContent').height();
                    const cBottom = $catMenu.offset().top + $catMenu.height() + 60;
                    const wTop = $(window).scrollTop();
                    const wFold = $(window).height() + wTop;

                    if (wFold < cBottom) {
                        $(window).scrollTo('+=' + (cBottom - wFold + catContentHeight / 2 >> 0) + 'px', {
                            axis: 'y', duration: 200, onAfter: function () {
                                this.catSetLoading();
                            }.bind(this),
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
            const self = this;

            socket.run('index.giveIndexNews', undefined, true).then(function (data) {
                let success = false;

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
            const self = this;

            socket.run('photo.givePublicIndex', undefined, true).then(function (data) {
                let success = false;

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
            const self = this;

            socket.run('photo.givePublicNoGeoIndex', undefined, true).then(function (data) {
                let success = false;

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
            const self = this;

            socket.run('photo.giveForApprove', { skip: 0, limit: 42 }, true).then(function (data) {
                let success = false;

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
            let success = false;
            const self = this;

            socket.run('index.giveRatings', { limit: 24 }, true).then(function (data) {
                const ratings = self.ratings;

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
            let success = false;
            const self = this;

            socket.run('index.giveIndexStats', undefined, true).then(function (data) {
                if (self.catLoading() === 'stats') {
                    self.stats.all = data.all;
                    self.stats.common = data.common;
                    self.stats.common.onlineTxt = 'Сейчас на сайте ' + globalVM.intl.num(data.common.onall) +
                        Utils.format.wordEndOfNum(data.common.onall, declension.user) +
                        ', из них ' + globalVM.intl.num(data.common.onreg) + Utils.format.wordEndOfNum(data.common.onall, declension.reg);
                    success = true;
                }

                if (Utils.isType('function', cb)) {
                    cb.call(ctx, success, scroll);
                }
            });
        },

        ratSelect: function (data, event) {
            const group = $(event.target).parents('.btn-group').attr('id');
            const id = $(event.target).attr('data-time');

            this.ratings[group].selected(id);
        },
        processPhotos: function (photos, regionsHash, picFormat, numField, numFormat) {
            let photo;
            let j;

            for (let i = photos.length; i--;) {
                photo = photos[i];

                photo.sfile = picFormat + photo.file;
                photo.link = '/p/' + photo.cid;

                if (!photo.title) {
                    photo.title = 'Без названия';
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
            let i = users.length;
            let user;

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
            const $photoBox = $(event.target.parentNode);
            const parent = $photoBox[0].parentNode;
            let content = '';

            event.target.style.visibility = 'hidden';

            if (data.conv) {
                content = imgFailTpl({
                    style: 'margin-top:7px;padding-top:20px; background: url(/img/misc/photoConvWhite.png) 50% 0 no-repeat;',
                    txt: 'Превью уже создается<br>пожалуйста, обновите позже',
                });
            } else if (data.convqueue) {
                content = imgFailTpl({
                    style: 'margin-top:7px;',
                    txt: '<span class="glyphicon glyphicon-road"></span><br>Превью скоро будет создано',
                });
            } else {
                content = imgFailTpl({
                    style: 'margin-top:7px;padding-top:25px; background: url(/img/misc/imgw.png) 50% 0 no-repeat;',
                    txt: 'Превью недоступно',
                });
            }

            $photoBox.append(content);
            parent.classList.add('showPrv');
        },
    });
});
