/**
 * Администрирование конвейера
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping',
    'm/_moduleCliche', 'globalVM', 'renderer', 'model/User', 'model/storage', 'noties',
    'highstock/highstock.src', 'text!tpl/admin/conveyer.pug', 'css!style/admin/conveyer', 'bs/ext/multiselect'
], function (_, $, Browser, Utils, socket, P, ko, koMapping, Cliche,
             globalVM, renderer, User, storage, noties, Highcharts, pug) {
    'use strict';

    Highcharts = Highcharts || window.Highcharts;
    Highcharts.theme = {
        colors: [
            '#DDDF0D', '#7798BF', '#55BF3B', '#DF5353', '#aaeeee', '#ff0066', '#eeaaee',
            '#55BF3B', '#DF5353', '#7798BF', '#aaeeee'
        ],
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

    Highcharts.setOptions(Highcharts.theme);

    return Cliche.extend({
        pug: pug,
        options: {
            deferredWhenReady: null // Deffered wich will be resolved when map ready
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];

            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.conveyerEnabled = ko.observable(true);
            this.reconvertCidMin = ko.observable();
            this.reconvertCidMax = ko.observable();
            this.reconvertRegion = ko.observable();
            this.reconvertStatuses = ko.observable();

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

            ko.applyBindings(globalVM, this.$dom[0]);
            this.show();
        },
        show: function () {
            var self = this;

            this.statFast();
            globalVM.func.showContainer(self.$container, function () {
                socket.run('converter.conveyorStat', undefined, true)
                    .then(function (result) {
                        var data = result.data;

                        var timeZoneOffset = -((new Date()).getTimezoneOffset()) * 60000;
                        var stampLocal;
                        var i = 0;

                        while (++i < data.length) {
                            stampLocal = data[i].stamp + timeZoneOffset;
                            self.conveyerLengthData.push(
                                [stampLocal, data[i].clength]
                            );
                            self.conveyerConvertData.push(
                                [stampLocal, data[i].converted]
                            );
                        }
                        self.conveyerLengthChart = new Highcharts.StockChart(_.assign({
                            chart: {
                                renderTo: 'conveyerLengthGraph'
                            },
                            series: [
                                {
                                    name: 'Photos in the queue',
                                    data: self.conveyerLengthData,
                                    tooltip: {
                                        valueDecimals: 0
                                    }
                                }
                            ]
                        }, self.chartsOptions));
                        self.conveyerConvertChart = new Highcharts.StockChart(_.assign({
                            chart: {
                                renderTo: 'conveyerConvertGraph'
                            },
                            series: [
                                {
                                    name: 'Converted photos',
                                    data: self.conveyerConvertData,
                                    tooltip: {
                                        valueDecimals: 0
                                    }
                                }
                            ]
                        }, self.chartsOptions));
                    });
            }, this);

            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            window.clearTimeout(this.timeoutUpdate);
            this.hide();
            destroy.call(this);
        },

        startstop: function () {
            this.exe(true);
            socket.run('converter.conveyorStartStop', { value: !this.conveyerEnabled() }, true)
                .then(function (result) {
                    if (result && _.isBoolean(result.conveyerEnabled)) {
                        this.conveyerEnabled(result.conveyerEnabled);
                    }
                    this.exe(false);
                }.bind(this));
        },
        clearConveyer: function () {
            var self = this;
            this.exe(true);

            noties.confirm({
                message: 'The conveyor will be cleared.<br>Confirm the operation?',
                onOk: function (confirmer) {
                    confirmer.disable();

                    socket.run('converter.conveyerClear', { value: true }, true)
                        .then(function (data) {
                            confirmer.success(data.message, 'Закрыть', null, function () {
                                self.exe(false);
                                self.statFast();
                            });
                        })
                        .catch(function () {
                            self.exe(false);
                        });
                },
                onCancel: function () {
                    self.exe(false);
                }
            });
        },

        toConvert: function () {
            var self = this;
            self.exe(true);
            socket
                .run('photo.convertAll', {
                    min: Number(self.reconvertCidMin()),
                    max: Number(self.reconvertCidMax()),
                    r: Number(self.reconvertRegion()),
                    s: _.chain(self.reconvertStatuses() || '').split(',').map(_.trim).compact().map(Number).value()
                }, true)
                .then(function () {
                    self.exe(false);
                })
                .catch(function () {
                    self.exe(false);
                });
        },

        statFast: function () {
            window.clearTimeout(this.timeoutUpdate);
            socket.run('converter.conveyorStatFast')
                .then(function (data) {
                    if (data) {
                        this.conveyerEnabled(data.conveyerEnabled);
                        this.clength(data.conveyerLength);
                        this.cmaxlength(data.conveyerMaxLength);
                        this.converted(data.conveyerConverted);
                    }
                    this.timeoutUpdate = window.setTimeout(this.statFast.bind(this), 2000);
                }.bind(this));
        }
    });
});