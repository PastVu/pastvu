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
                this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
                this.routeHandler();
                this.show();
            }.bind(this), 800);
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
            var params = globalVM.router.params();

            if (params.rules) {
                this.showRules();
            } else if (this.rulesVM) {
                this.destroyRules();
            } else if (params.about) {
                this.showAbout();
            } else if (this.aboutVM) {
                this.destroyAbout();
            }
        },

        navigateAbout: function () {
            globalVM.router.navigate('/about');
            this.aboutNavigated = true;
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
								//animateScale: true,
								curtainClick: {click: this.closePopup, ctx: this},
								offIcon: {text: 'Закрыть', click: this.closePopup, ctx: this},
								btns: [
									{css: 'btn-primary', text: 'Закрыть', click: this.closePopup, ctx: this}
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
        destroyAbout: function () {
            if (this.aboutVM) {
                this.aboutVM.destroy();
                delete this.aboutVM;
            }
        },

        navigateRules: function () {
            globalVM.router.navigate('/rules');
            this.rulesNavigated = true;
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
								curtainClick: {click: this.closePopup, ctx: this},
								offIcon: {text: 'Закрыть', click: this.closePopup, ctx: this},
								btns: [
									{css: 'btn-primary', text: 'Закрыть', click: this.closePopup, ctx: this}
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
		destroyRules: function () {
			if (this.rulesVM) {
				this.rulesVM.destroy();
				delete this.rulesVM;
			}
		},

        closePopup: function () {
            // Закрытие будет вызвано автоматиечски после срабатывания routeHandler
            if (this.rulesNavigated || this.aboutNavigated) {
                this.rulesNavigated = this.aboutNavigated = false;
                globalVM.router.back();
            } else {
                globalVM.router.navigate('/');
            }
        }
	});
});