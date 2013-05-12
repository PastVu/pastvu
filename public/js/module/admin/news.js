/*global define:true*/

/**
 * Модель карты
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/User', 'model/storage',
	'text!tpl/admin/news.jade', 'css!style/admin/news', 'jquery-plugins/redactor/redactor', 'css!style/jquery/redactor/redactor'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, User, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/common/auth'];

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.show();
		},
		show: function () {
			globalVM.func.showContainer(this.$container, function () {
			}, this);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		localDestroy: function (destroy) {
			window.clearTimeout(this.timeoutUpdate);
			this.hide();
			destroy.call(this);
		}
	});
});