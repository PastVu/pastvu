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
			window.setTimeout(function () {
				this.show();
			}.bind(this), 1500);
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
							modal: {
								topic: 'О проекте',
								initWidth: '1000px',
								animateScale: true,
								curtainClick: {click: this.closeAbout, ctx: this},
								offIcon: {text: 'Закрыть', click: this.closeAbout, ctx: this},
								btns: [
									{css: 'btn-primary', text: 'Закрыть', click: this.closeAbout, ctx: this}
								]
							},
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
		},
        closeAbout: function () {
            if (this.aboutVM) {
                this.aboutVM.destroy();
                delete this.aboutVM;
            }
        },
		showRules: function () {
			if (!this.rulesVM) {
				renderer(
					[
						{
							module: 'm/diff/rules',
							modal: {
								topic: 'Правила PastVu',
								initWidth: '1000px',
								//animateScale: true,
								curtainClick: {click: this.closeRules, ctx: this},
								offIcon: {text: 'Закрыть', click: this.closeRules, ctx: this},
								btns: [
									{css: 'btn-primary', text: 'Закрыть', click: this.closeRules, ctx: this}
								]
							},
							callback: function (vm) {
								this.rulesVM = this.childModules[vm.id] = vm;
							}.bind(this)
						}
					],
					{
						parent: this,
						level: this.level + 2
					}
				);
			}
		},
		closeRules: function () {
			if (this.rulesVM) {
				this.rulesVM.destroy();
				delete this.rulesVM;
			}
		}
	});
});