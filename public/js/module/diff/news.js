/*global define:true*/

/**
 * Модель Списка новостей
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/diff/news.jade', 'css!style/diff/news', 'jquery-plugins/scrollto'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.news = ko.observableArray();

			// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);

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
		routeHandler: function () {
			var cid = Number(globalVM.router.params().cid);
			if (cid) {
				this.getOneNews(cid);
			} else {
				this.getAllNews();
			}
		},
		getOneNews: function (cid, cb, ctx) {
			socket.once('takeNews', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					data.news.notice = data.news.txt;
					this.news([data.news]);
					$(window).scrollTo($('body'), {duration: 400});
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveNews', {cid: cid});
		},
		getAllNews: function (cb, ctx) {
			socket.once('takeAllNews', function (data) {
				if (!data || data.error || !Array.isArray(data.news)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					var i = data.news.length;
					while (i--) {
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
			socket.emit('giveAllNews', {limit: 24});
		}
	});
});