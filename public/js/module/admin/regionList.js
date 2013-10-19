/*global define:true*/

/**
 * Модель создания/редактирования новости
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
			socket.once('takeRegionList', function (data) {
				var error = !data || !!data.error || !data.regions;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					this.regions(this.treeBuild(data.regions));
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegionList', {});
		},
		treeBuild: function (arr) {
			var i = 0,
				len = arr.length,
				hash = {},
				region,
				results = [];

			arr.sort(function (a, b) {
				return a.parents.length < b.parents.length || a.title_en < b.title_en ? -1 : 1;
			});

			for (;i < len; i++) {
				region = arr[i];
				region.regions = [];
				if (region.parents.length) {
					hash[region.parents[region.parents.length - 1]].regions.push(region);
				} else {
					results.push(region);
				}
				hash[region.cid] = region;
			}
			console.dir(results);

			return results;
		}
	});
});