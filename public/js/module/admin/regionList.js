/*global define:true*/

/**
 * Модель списка регионов
 */
define([
	'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/storage', 'text!tpl/admin/regionList.jade', 'css!style/admin/regionList'
], function (_, $, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.regions = ko.observableArray();
			this.stat = null;

			this.getRegions(function () {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
			}, this);
		},
		show: function (cb, ctx) {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getRegions: function (cb, ctx) {
			socket.once('takeRegionsFull', function (data) {
				var error = !data || !!data.error || !data.regions;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					this.stat = data.stat;
					this.regions(this.treeBuild(data.regions));
					this.regionsFlat = data.regions;
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegionsFull', {});
		},
		treeBuild: function (arr) {
			var i = 0,
				len = arr.length,
				hash = {},
				region,
				results = [],
				cidHL = Number(globalVM.router.params().hl),
				reallyHL;

			//Сортируем массим по уровням и названиям в пределах одного уровня
			arr.sort(function (a, b) {
				return a.parents.length < b.parents.length || a.parents.length === b.parents.length && a.title_en < b.title_en ? -1 : 1;
			});

			function incrementParentsChildLen(region, deepestLevel) {
				var parentRegion = region.parent,
					parentChildsArrPosition = deepestLevel - parentRegion.level - 1;

				//Если открыт дочерний, надо открыть и родителя
				if (region.opened()) {
					parentRegion.opened(true);
				}
				parentRegion.childLenAll += 1;
				parentRegion.childLenArr[parentChildsArrPosition] = -~parentRegion.childLenArr[parentChildsArrPosition];
				if (parentRegion.parent) {
					incrementParentsChildLen(parentRegion, deepestLevel);
				}
			}

			for (; i < len; i++) {
				region = arr[i];
				region.regions = [];
				region.level = region.parents.length;
				region.childLen = 0; //Количество непосредственных потомков
				region.childLenAll = 0; //Количество всех потомков
				region.childLenArr = [0]; //Массив количеств потомков
				region.hl = cidHL === region.cid; //Подсветка региона по переданному параметру
				region.opened = ko.observable(region.hl); //Подсвеченный регион должен быть открыт
				if (region.level) {
					region.parent = hash[region.parents[region.level - 1]];
					region.parent.regions.push(region);
					region.parent.childLen += 1;
					incrementParentsChildLen(region, region.level);
				} else {
					results.push(region);
				}
				if (region.hl) {
					reallyHL = true;
				}
				hash[region.cid] = region;
			}

			if (reallyHL) {
				window.setTimeout(function () {
					$(window).scrollTo(this.$dom.find('.lirow.hl'), 400);
				}.bind(this), 700);
			}

			return results;
		},
		collapseToggle: function (data, event) {
			data.opened(!data.opened());
		},
		expandAll: function (data, event) {
			this.collapseToggleAll(true);
		},
		collapseAll: function (data, event) {
			this.collapseToggleAll(false);
		},
		collapseToggleAll: function (expand) {
			for (var i = this.regionsFlat.length - 1; i >= 0; i--) {
				this.regionsFlat[i].opened(expand);
			}
		}
	});
});