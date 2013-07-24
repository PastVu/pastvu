/*global define:true, ga:true*/
/**
 * Модель содержимого основной страницы
 */
define(['underscore', 'Utils', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'model/Photo', 'text!tpl/main/mainPage.jade', 'css!style/main/mainPage'], function (_, Utils,P, ko, ko_mapping, Cliche, globalVM, Photo, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {

			this.childs = [
				{
					module: 'm/map/map',
					container: '#mapContainer',
					options: {},
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
					}
				},
				{
					module: 'm/main/commentsFeed',
					container: '#commentsFeed',
					options: {},
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
					}
				},
				{
					module: 'm/main/bottomPanel',
					container: '#bottomPanel',
					options: {},
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
					}
				}
			];

			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			Utils.title.setTitle({title: 'Главная'});
			this.sizesCalc();
			globalVM.func.showContainer(this.$container);
			this.showing = true;
			ga('send', 'pageview');
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		sizesCalc: function () {
			this.mapSize();
		},
		mapSize: function () {
			this.$dom.find('#mapContainer').css({height: P.window.h() - (this.$container.offset().top || 33) - 29 >> 0});
		}
	});
});