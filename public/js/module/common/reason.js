/*global requirejs:true, require:true, define:true*/
/**
 * Выбор причины
 */
define(['jquery', 'Utils', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/common/reason.jade', 'css!style/common/reason'], function ($, Utils, P, globalVM, ko, Cliche, jade) {
	'use strict';

	var $window = $(window);
	return Cliche.extend({
		jade: jade,
		options: {
			select: [],
			freetext: true,
			freemin: 5,
			freemax: 1000
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			if (this.modal) {
				this.modal.$curtain.addClass('showModalCurtain');
			}
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getReason: function () {

		}
	});

});