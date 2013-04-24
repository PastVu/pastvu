/*global define:true*/
/**
 * Модель содержимого основной страницы
 */
define(['underscore', 'Utils', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'm/Photo', 'text!tpl/main/mainPage.jade', 'css!style/main/mainPage'], function (_, Utils,P, ko, ko_mapping, Cliche, globalVM, Photo, jade) {
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
					module: 'm/main/commentsRibbon',
					container: '#commentsRibbon',
					options: {},
					ctx: this,
					callback: function (vm) {
						this.childModules[vm.id] = vm;
					}
				}
			];

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			Utils.title.setTitle({title: 'Главная'});
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		}
	});
});