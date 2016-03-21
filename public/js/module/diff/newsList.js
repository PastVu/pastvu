/*global define:true, ga:true*/

/**
 * Модель Списка новостей
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'model/User', 'model/storage',
    'text!tpl/diff/newsList.jade', 'css!style/diff/newsList'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        options: {},
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.news = ko.observableArray();
            this.canEdit = ko.observable(this.auth.loggedIn() && this.auth.iAm.role() > 9);

            // Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
            this.routeHandlerDebounced = _.debounce(this.routeHandler, 700, { leading: true, trailing: true });
            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
            if (!this.auth.loggedIn()) {
                this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
            }
            ko.applyBindings(globalVM, this.$dom[0]);
            this.routeHandler();
            this.show();
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
            // После логина проверяем если мы можем редактировать новости
            this.canEdit(this.auth.iAm.role() > 9);
            this.subscriptions.loggedIn.dispose();
            delete this.subscriptions.loggedIn;
        },
        routeHandler: function () {
            this.getAllNews(function (data) {
                Utils.title.setTitle({ title: 'News' });
                ga('send', 'pageview');
            });
        },
        getAllNews: function (cb, ctx) {
            var self = this;

            socket.run('index.giveAllNews', undefined, true).then(function (data) {
                data.news.forEach(function (novel) {
                    novel.user.avatar = novel.user.avatar ? P.preaddr + '/_a/h/' + novel.user.avatar :
                        '/img/caps/avatarth.png';
                    novel.ccount = novel.ccount || 0;

                    if (novel.notice) {
                        novel.expand = true;
                    } else {
                        novel.notice = novel.txt;
                    }
                });

                self.news(data.news);

                if (Utils.isType('function', cb)) {
                    cb.call(ctx, data);
                }
            });
        }
    });
});