/*global define:true*/
/**
 * Модель управляет футером
 */
define(['underscore', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'renderer', 'text!tpl/common/foot.jade', 'css!style/common/foot'], function (_, P, ko, Cliche, globalVM, renderer, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			ko.applyBindings(globalVM, this.$dom[0]);
			window.setTimeout(function () {this.show();}.bind(this), 1500);
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		showAbout: function () {
			if (!this.aboutVM) {
				renderer(
					[
						{
							module: 'm/diff/about',
							modal: {topic: 'О проекте', initWidth: '1000px',closeTxt: 'Закрыть', closeFunc: function (evt) {
								this.aboutVM.destroy();
								delete this.aboutVM;
								evt.stopPropagation();
							}.bind(this)},
							callback: function (vm) {
								this.aboutVM = this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 2
					}
				);
			}
		}
	});
});