/*global define:true*/

/**
 * Модель Списка новостей
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/diff/news.jade', 'css!style/diff/news'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.news = ko.observableArray();

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			this.getNews();
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getNews: function (cb, ctx) {
			socket.once('takeAllNews', function (data) {
				if (!data || data.error || !Array.isArray(data.news)) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
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