/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
	'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
	'm/User', 'm/storage',
	'highstock/highstock.src',
	'text!tpl/admin/conveyer.jade', 'css!style/admin/conveyer', 'bs/bootstrap-dropdown', 'bs/bootstrap-multiselect'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, User, storage, Highcharts, jade) {
	'use strict';

	Highcharts = Highcharts || window.Highcharts;
	Highcharts.theme = {
		colors: ["#DDDF0D", "#7798BF", "#55BF3B", "#DF5353", "#aaeeee", "#ff0066", "#eeaaee",
			"#55BF3B", "#DF5353", "#7798BF", "#aaeeee"],
		chart: {
			backgroundColor: {
				linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
				stops: [
					[0, 'rgb(96, 96, 96)'],
					[1, 'rgb(16, 16, 16)']
				]
			},
			borderWidth: 0,
			borderRadius: 0,
			plotBackgroundColor: null,
			plotShadow: false,
			plotBorderWidth: 0
		},
		title: {
			style: {
				color: '#FFF',
				font: '16px Lucida Grande, Lucida Sans Unicode, Verdana, Arial, Helvetica, sans-serif'
			}
		},
		subtitle: {
			style: {
				color: '#DDD',
				font: '12px Lucida Grande, Lucida Sans Unicode, Verdana, Arial, Helvetica, sans-serif'
			}
		},
		xAxis: {
			gridLineWidth: 0,
			lineColor: '#999',
			tickColor: '#999',
			labels: {
				style: {
					color: '#BBB'
				}
			},
			title: {
				style: {
					color: '#AAA',
					font: 'bold 12px Lucida Grande, Lucida Sans Unicode, Verdana, Arial, Helvetica, sans-serif'
				}
			}
		},
		yAxis: {
			alternateGridColor: null,
			minorTickInterval: null,
			gridLineColor: 'rgba(255, 255, 255, .1)',
			lineWidth: 0,
			tickWidth: 0,
			labels: {
				style: {
					color: '#BBB'
				}
			},
			title: {
				style: {
					color: '#AAA',
					font: 'bold 12px Lucida Grande, Lucida Sans Unicode, Verdana, Arial, Helvetica, sans-serif'
				}
			}
		},
		legend: {
			itemStyle: {
				color: '#CCC'
			},
			itemHoverStyle: {
				color: '#FFF'
			},
			itemHiddenStyle: {
				color: '#333'
			}
		},
		labels: {
			style: {
				color: '#CCC'
			}
		},
		tooltip: {
			backgroundColor: {
				linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
				stops: [
					[0, 'rgba(96, 96, 96, .8)'],
					[1, 'rgba(16, 16, 16, .8)']
				]
			},
			borderWidth: 0,
			style: {
				color: '#FFF'
			}
		},


		plotOptions: {
			line: {
				dataLabels: {
					color: '#CCC'
				},
				marker: {
					lineColor: '#333'
				}
			},
			spline: {
				marker: {
					lineColor: '#333'
				}
			},
			scatter: {
				marker: {
					lineColor: '#333'
				}
			},
			candlestick: {
				lineColor: 'white'
			}
		},

		toolbar: {
			itemStyle: {
				color: '#CCC'
			}
		},

		navigation: {
			buttonOptions: {
				backgroundColor: {
					linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
					stops: [
						[0.4, '#606060'],
						[0.6, '#333333']
					]
				},
				borderColor: '#000000',
				symbolStroke: '#C0C0C0',
				hoverSymbolStroke: '#FFFFFF'
			}
		},

		exporting: {
			buttons: {
				exportButton: {
					symbolFill: '#55BE3B'
				},
				printButton: {
					symbolFill: '#7797BE'
				}
			}
		},

		// scroll charts
		rangeSelector: {
			buttonTheme: {
				fill: {
					linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
					stops: [
						[0.4, '#888'],
						[0.6, '#555']
					]
				},
				stroke: '#000000',
				style: {
					color: '#CCC'
				},
				states: {
					hover: {
						fill: {
							linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
							stops: [
								[0.4, '#BBB'],
								[0.6, '#888']
							]
						},
						stroke: '#000000',
						style: {
							color: 'white'
						}
					},
					select: {
						fill: {
							linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
							stops: [
								[0.1, '#000'],
								[0.3, '#333']
							]
						},
						stroke: '#000000',
						style: {
							color: 'yellow'
						}
					}
				}
			},
			inputStyle: {
				backgroundColor: '#333',
				color: 'silver'
			},
			labelStyle: {
				color: 'silver'
			}
		},

		navigator: {
			handles: {
				backgroundColor: '#666',
				borderColor: '#AAA'
			},
			outlineColor: '#CCC',
			maskFill: 'rgba(16, 16, 16, 0.5)',
			series: {
				color: '#7798BF',
				lineColor: '#A6C7ED'
			}
		},

		scrollbar: {
			barBackgroundColor: {
				linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
				stops: [
					[0.4, '#888'],
					[0.6, '#555']
				]
			},
			barBorderColor: '#CCC',
			buttonArrowColor: '#CCC',
			buttonBackgroundColor: {
				linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
				stops: [
					[0.4, '#888'],
					[0.6, '#555']
				]
			},
			buttonBorderColor: '#CCC',
			rifleColor: '#FFF',
			trackBackgroundColor: {
				linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
				stops: [
					[0, '#000'],
					[1, '#333']
				]
			},
			trackBorderColor: '#666'
		},

		// special colors for some of the demo examples
		legendBackgroundColor: 'rgba(48, 48, 48, 0.8)',
		legendBackgroundColorSolid: 'rgb(70, 70, 70)',
		dataLabelsColor: '#444',
		textColor: '#E0E0E0',
		maskColor: 'rgba(255,255,255,0.3)'
	};

	var $window = $(window),
		highchartsOptions = Highcharts.setOptions(Highcharts.theme);

	return Cliche.extend({
		jade: jade,
		options: {
			deferredWhenReady: null // Deffered wich will be resolved when map ready
		},
		create: function () {
			var _this = this;
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/auth'];

			this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу
			this.conveyerEnabled = ko.observable(true);

			this.conveyerLengthData = [];
			this.conveyerConvertData = [];
			this.conveyerLengthChart = null;
			this.conveyerConvertChart = null;

			this.clength = ko.observable(0);
			this.cmaxlength = ko.observable(0);
			this.converted = ko.observable(0);

			this.timeoutUpdate = null;

			this.chartsOptions = {
				yAxis: {
					min: 0
				},
				rangeSelector: {
					selected: 1,
					buttons: [
						{
							type: 'minute',
							count: 60,
							text: 'H'
						},
						{
							type: 'minute',
							count: 12 * 60,
							text: '12H'
						},
						{
							type: 'day',
							count: 1,
							text: 'D'
						},
						{
							type: 'week',
							count: 1,
							text: 'W'
						},
						{
							type: 'month',
							count: 1,
							text: 'M'
						},
						{
							type: 'month',
							count: 6,
							text: 'H-Y'
						},
						{
							type: 'ytd',
							text: 'YTD'
						},
						{
							type: 'year',
							count: 1,
							text: 'Year'
						},
						{
							type: 'all',
							text: 'All'
						}
					]
				}
			};

			this.convertOptions = ko.observableArray([/*{vName: 'Origin', id: 'origin'}, */{vName: 'Standard', vId: 'standard'}, {vName: 'Thumb', vId: 'thumb'}, {vName: 'Midi', vId: 'midi'}, {vName: 'Mini', vId: 'mini'}, {vName: 'Micro', vId: 'micro'}, {vName: 'Micros', vId: 'micros'}]);
			this.selectedOpt = ko.observableArray([]);
			this.$dom.find('#convertSelect').multiselect({
				buttonClass: 'btn-strict btn-strict-small',
				buttonWidth: 'auto', // Default
				buttonText: function(options) {
					if (options.length === 0) {
						return 'All convert variants <b class="caret"></b>';
					} else if (options.length === _this.convertOptions().length) {
						return 'All variants selected <b class="caret"></b>';
					} else if (options.length > 2) {
						return options.length + ' variants selected <b class="caret"></b>';
					} else {
						var selected = '';
						options.each(function() {
							selected += $(this).text() + ', ';
						});
						return selected.substr(0, selected.length -2) + ' <b class="caret"></b>';
					}
				},
				//buttonContainer: '<span class=""/>'
			});

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.show();
		},
		show: function () {
			var _this = this;
			this.statFast();
			this.$container.fadeIn(400, function () {
				socket.once('getStatConveyer', function (data) {
					if (!data || data.error) {
						window.noty({text: data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
					} else {
						data = data.data;
						var i = 0,
							timeZoneOffset = -((new Date()).getTimezoneOffset()) * 60000,
							stampLocal;
						while (++i < data.length) {
							stampLocal = data[i].stamp + timeZoneOffset;
							this.conveyerLengthData.push(
								[stampLocal, data[i].clength]
							);
							this.conveyerConvertData.push(
								[stampLocal, data[i].converted]
							);
						}
						this.conveyerLengthChart = new Highcharts.StockChart(_.assign({
							chart: {
								renderTo: 'conveyerLengthGraph'
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
						}, this.chartsOptions));
						this.conveyerConvertChart = new Highcharts.StockChart(_.assign({
							chart: {
								renderTo: 'conveyerConvertGraph'
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
						}, this.chartsOptions));
					}
				}.bind(this));
				socket.emit('statConveyer', {});
			}.bind(this));

			this.showing = true;
		},
		hide: function () {
			this.$container.css('display', '');
			this.showing = false;
		},
		localDestroy: function (destroy) {
			window.clearTimeout(this.timeoutUpdate);
			this.hide();
			destroy.call(this);
		},

		startstop: function () {
			this.exe(true);
			socket.once('conveyerStartStopResult', function (data) {
				if (data && Utils.isType('boolean', data.conveyerEnabled)) {
					this.conveyerEnabled(data.conveyerEnabled);
				}
				this.exe(false);
			}.bind(this));
			socket.emit('conveyerStartStop', !this.conveyerEnabled());
		},
		clearConveyer: function () {
			var _this = this;
			this.exe(true);

			window.noty(
				{
					text: 'Conveyer will be cleared.<br>Confirm this operation?',
					type: 'confirm',
					layout: 'center',
					modal: true,
					force: true,
					animation: {
						open: {height: 'toggle'},
						close: {},
						easing: 'swing',
						speed: 500
					},
					buttons: [
						{addClass: 'btn-strict btn-strict-danger', text: 'Ok', onClick: function ($noty) {
							// this = button element
							// $noty = $noty element
							if ($noty.$buttons && $noty.$buttons.find) {
								$noty.$buttons.find('button').attr('disabled', true).addClass('disabled');
							}

							socket.once('conveyerClearResult', function (data) {
								$noty.$buttons.find('.btn-strict-danger').remove();
								var okButton = $noty.$buttons.find('button')
									.attr('disabled', false)
									.removeClass('disabled')
									.off('click');

								$noty.$message.children().html((data && data.message) || '');

								okButton.text('Close').on('click', function () {
									$noty.close();
									this.exe(false);
									this.statFast();
								}.bind(this));
							}.bind(_this));
							socket.emit('conveyerClear', true);
						}},
						{addClass: 'btn-strict', text: 'Cancel', onClick: function ($noty) {
							$noty.close();
							_this.exe(false);
						}}
					]
				}
			);
		},

		toConvert: function (data, event) {
			if (this.selectedOpt().length === 0) {
				return false;
			}
			this.exe(true);
			socket.once('convertPhotosAllResult', function (data) {
				if (data && !data.error) {
					window.noty({text: data.message || 'OK', type: 'success', layout: 'center', timeout: 2000, force: true});
				} else {
					window.noty({text: (data && data.message) || 'Error occurred', type: 'error', layout: 'center', timeout: 2000, force: true});
				}
				this.exe(false);
			}.bind(this));
			socket.emit('convertPhotosAll', {variants: this.selectedOpt()});
		},

		statFast: function () {
			window.clearTimeout(this.timeoutUpdate);
			socket.once('takeStatFastConveyer', function (data) {
				if (data) {
					this.conveyerEnabled(data.conveyerEnabled);
					this.clength(data.clength);
					this.cmaxlength(data.cmaxlength);
					this.converted(data.converted);
				}
				this.timeoutUpdate = window.setTimeout(this.statFast.bind(this), 2000);
			}.bind(this));
			socket.emit('giveStatFastConveyer', {});
		}
	});
});