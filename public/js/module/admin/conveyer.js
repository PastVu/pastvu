/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
	'm/User', 'm/storage',
	'highstock/highstock.src',
	'text!tpl/admin/conveyer.jade', 'css!style/admin/conveyer'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, User, storage, Highcharts, jade) {
	'use strict';
	var $window = $(window);

	Highcharts = Highcharts || window.Highcharts;

	return Cliche.extend({
		jade: jade,
		options: {
			deferredWhenReady: null // Deffered wich will be resolved when map ready
		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/auth'];

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.show();
		},
		show: function () {
			var _this = this;
			this.$container.fadeIn(400, function () {

				$.getJSON('http://www.highcharts.com/samples/data/jsonp.php?filename=aapl-c.json&callback=?', function (data) {
					// Create the chart
					window.chart = new Highcharts.StockChart({
						chart: {
							renderTo: 'ccc'
						},

						rangeSelector: {
							selected: 1
						},

						title: {
							text: 'AAPL Stock Price'
						},

						series: [
							{
								name: 'AAPL',
								data: data,
								tooltip: {
									valueDecimals: 2
								}
							}
						]
					});
				});


			}.bind(this));

			this.showing = true;
		},
		hide: function () {
			this.$container.css('display', '');
			this.showing = false;
		},
		localDestroy: function (destroy) {
			this.hide();
			destroy.call(this);
		}
	});
});