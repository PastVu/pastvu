/*global define:true*/
/**
 * Модель управляет футером
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'text!tpl/common/foot.jade', 'css!style/common/foot'], function (_, P, ko, Cliche, globalVM, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			ko.applyBindings(globalVM, this.$dom[0]);
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