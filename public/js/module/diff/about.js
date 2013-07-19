/*global define:true*/
/**
 * Модель О проекте
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/diff/about.jade', 'css!style/diff/about'], function (_, P, ko, Cliche, globalVM, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		}
	});
});