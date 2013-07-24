/*global define:true, ga:true*/

/**
 * Модель Списка новостей
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/diff/newsList.jade', 'css!style/diff/newsList', 'jquery-plugins/scrollto'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.news = ko.observableArray();
			this.canEdit = ko.observable(this.auth.loggedIn() && this.auth.iAm.role() > 9);

			// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
			this.routeHandlerDebounced = _.debounce(this.routeHandler, 700, {leading: true, trailing: true});
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
				Utils.title.setTitle({title: 'Новости'});
				ga('send', 'pageview');
			});
		},
		getAllNews: function (cb, ctx) {
			socket.once('takeAllNews', function (data) {
				if (!data || data.error || !Array.isArray(data.news)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					var i = data.news.length;
					while (i--) {
						data.news.ccount = data.news.ccount || 0;
						if (data.news[i].notice) {
							data.news[i].expand = true;
						} else {
							data.news[i].notice = data.news[i].txt;
						}
					}
					this.news(data.news);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveAllNews', {});
		}
	});
});