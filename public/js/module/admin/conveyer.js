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

			this.conveyerLengthData = [];
			this.conveyerConvertData = [];
			this.conveyerLengthChart = null;
			this.conveyerConvertChart = null;

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.show();
		},
		show: function () {
			var _this = this;
			this.$container.fadeIn(400, function () {
				socket.once('getStatConveyer', function (data) {
					if (!data || data.error) {
						window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						data = data.data;
						var i = 0;
						while (++i < data.length) {
							this.conveyerLengthData.push(
								[data[i].stamp, data[i].clength]
							);
							this.conveyerConvertData.push(
								[data[i].stamp, data[i].converted]
							);
						}
						this.conveyerLengthChart = new Highcharts.StockChart({
							chart: {
								renderTo: 'conveyerLengthGraph'
							},
							rangeSelector: {
								selected: 0
							},
							series: [
								{
									name: 'Фотографий в очереди',
									data: this.conveyerLengthData,
									tooltip: {
										valueDecimals: 0
									}
								}
							]
						});
						this.conveyerConvertChart = new Highcharts.StockChart({
							chart: {
								renderTo: 'conveyerConvertGraph'
							},
							rangeSelector: {
								selected: 0
							},
							series: [
								{
									name: 'Фотографий конвертированно',
									data: this.conveyerConvertData,
									tooltip: {
										valueDecimals: 0
									}
								}
							]
						});
					}
				}.bind(this));
				socket.emit('statConveyer', {});


				$.getJSON('http://www.highcharts.com/samples/data/jsonp.php?filename=aapl-c.json&callback=?', function (data) {
					// Create the chart

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