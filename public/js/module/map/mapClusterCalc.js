/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
    'm/User', 'm/storage',
    'leaflet', 'lib/leaflet/extends/L.neoMap',
    'text!tpl/map/mapClusterCalc.jade', 'css!style/map/mapClusterCalc', 'jquery-ui/draggable', 'jquery-ui/resizable', 'jquery-ui/effect-highlight', 'css!jquery-ui/smoothness/jquery-ui-1.10.0.custom'
], function (_, $, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, User, storage, L, Map, jade) {
    'use strict';
    var $window = $(window);

    return Cliche.extend({
        jade: jade,
        options: {
            deferredWhenReady: null // Deffered wich will be resolved when map ready
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/auth'];

            // Map objects
            this.map = null;
            this.layers = ko.observableArray();
            this.layersOpen = ko.observable(false);
            this.layerActive = ko.observable({sys: null, type: null});
            this.layerActiveDesc = ko.observable('');

            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.exePercent = ko.observable(0); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.wCurr = ko.observable(40);
            this.wNew = ko.observable(40);
            this.hCurr = ko.observable(40);
            this.hNew = ko.observable(40);
            this.changed = ko.computed(function () {
                return this.wCurr() !== this.wNew() || this.hCurr() !== this.hNew();
            }, this);

            if (P.settings.USE_OSM_API()) {
                this.layers.push({
                    id: 'osm',
                    desc: 'OSM',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'osmosnimki',
                            desc: 'Osmosnimki',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {updateWhenIdle: false})
                        },
                        {
                            id: 'mapnik',
                            desc: 'Mapnik',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {updateWhenIdle: false})
                        },
                        {
                            id: 'mapquest',
                            desc: 'Mapquest',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {updateWhenIdle: false})
                        }
                    ])
                });
            }
            if (P.settings.USE_GOOGLE_API()) {
                this.layers.push({
                    id: 'google',
                    desc: 'Google',
                    deps: 'lib/leaflet/extends/L.Google',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Схема',
                            selected: ko.observable(false),
                            params: 'ROADMAP'
                        },
                        {
                            id: 'sat',
                            desc: 'Спутник',
                            selected: ko.observable(false),
                            params: 'SATELLITE'
                        },
                        {
                            id: 'hyb',
                            desc: 'Гибрид',
                            selected: ko.observable(false),
                            params: 'HYBRID'
                        },
                        {
                            id: 'land',
                            desc: 'Ландшафт',
                            selected: ko.observable(false),
                            params: 'TERRAIN'
                        }
                    ])
                });
            }
            if (P.settings.USE_YANDEX_API()) {
                this.layers.push({
                    id: 'yandex',
                    desc: 'Яндекс',
                    deps: 'lib/leaflet/extends/L.Yandex',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Схема',
                            selected: ko.observable(false),
                            params: 'map'
                        },
                        {
                            id: 'sat',
                            desc: 'Спутник',
                            selected: ko.observable(false),
                            params: 'satellite'
                        },
                        {
                            id: 'hyb',
                            desc: 'Гибрид',
                            selected: ko.observable(false),
                            params: 'hybrid'
                        },
                        {
                            id: 'pub',
                            desc: 'Народная',
                            selected: ko.observable(false),
                            params: 'publicMap'
                        },
                        {
                            id: 'pubhyb',
                            desc: 'Народный гибрид',
                            selected: ko.observable(false),
                            params: 'publicMapHybrid'
                        }
                    ])
                });
            }

            ko.applyBindings(globalVM, this.$dom[0]);


            // Subscriptions

            this.show();
        },
        show: function () {
            var _this = this;
            this.$container.fadeIn(400, function () {

                this.map = new L.neoMap(this.$dom.find('.map')[0], {center: [55.753395, 37.621994], zoom: 13, minZoom: 2, maxZoom: 18, zoomAnimation: false, trackResize: false});

                //Самостоятельно обновлем размеры карты
                P.window.square.subscribe(function (newVal) {
                    this.map._onResize();
                }.bind(this));

                this.map.whenReady(function () {
                    this.selectLayer('osm', 'osmosnimki');
                    if (this.options.deferredWhenReady && Utils.isType('function', this.options.deferredWhenReady.resolve)) {
                        this.options.deferredWhenReady.resolve();
                    }
                    this.$dom.find('.clusterRect').draggable({
                        containment: this.$dom.find(".mapContainer"),
                        scroll: false,
                        cursor: "move"
                    }).resizable({
                            minHeight: 40,
                            minWidth: 40,
                            maxHeight: 300,
                            maxWidth: 300,
                            aspectRatio: 1,
                            resize: function (event, ui) {
                                _this.wNew(ui.size.width);
                                _this.hNew(ui.size.height);
                            }
                        });
                }, this);

            }.bind(this));

            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.hide();
            this.map = null;
            destroy.call(this);
        },

        save: function () {
            var _this = this,


                $clusterRect = this.$dom.find('.clusterRect'),
                w = this.wNew(),
                h = this.hNew(),
                pos = $clusterRect.position(),

                centerGeo = this.map.containerPointToLatLng(new L.Point(pos.left + w / 2, pos.top + h / 2)),

                wMap = this.$dom.find('.mapContainer').width(),
                hMap = this.$dom.find('.mapContainer').height(),

                zooms = _.range(2, 17), // 0 - 16
                result = [],

                setZoom = function (z) {
                    if (_this.exe()) {
                        _this.map.setView(centerGeo, z);
                    }
                },
                calcOnZoom = function (z) {
                    var rectCenter = _this.map.latLngToContainerPoint(_this.map.getCenter()),
                        rectTopLeft = _this.map.containerPointToLatLng(new L.Point(rectCenter.x - w / 2, rectCenter.y - h / 2)),
                        rectBottomRight = _this.map.containerPointToLatLng(new L.Point(rectCenter.x + w / 2, rectCenter.y + h / 2));

                    return {z: z, w: Utils.math.toPrecision(Math.abs(rectTopLeft.lng - rectBottomRight.lng)), h: Utils.math.toPrecision(Math.abs(rectTopLeft.lat - rectBottomRight.lat))};
                },
                changeZoomRecursive = _.debounce(function () {
                    var z = _this.map.getZoom();

                    result.push(calcOnZoom(z));
                    this.exePercent(Math.ceil(100 * (zooms.indexOf(z) + 1) / zooms.length)); // Обновляем прогресс-бар подсчета

                    if (z === _.last(zooms)) {
                        _this.map.off('moveend', changeZoomRecursive, this);
                        _this.calcDeffered.resolve(result);
                        delete _this.calcDeffered;
                        delete _this.setZoomTimeout;
                    } else {
                        $clusterRect.effect('highlight', {color: '#ffffff'}, 500); // Эффект вспышки
                        _this.setZoomTimeout = _.delay(setZoom, 550, z + 1);
                    }
                }, 900, false);

            this.saveParams = {
                sgeo: Utils.geo.geoToPrecision([centerGeo.lng, centerGeo.lat]),
                sz: this.map.getZoom(),
                sw: this.wNew(),
                sh: this.hNew()
            };
            this.calcDeffered = new $.Deferred();
            // Ставим статус, что идет пересчет
            this.exe(true);
            this.exePercent(0);
            // Ставим прямоугольник по центру
            $clusterRect.css({left: (wMap / 2) - w / 2, top: (hMap / 2) - h / 2});
            // Подписываемся на изменение зума карты
            this.map.on('moveend', changeZoomRecursive, this);
            // Начинаем подсчет
            setZoom(_.first(zooms));
            // По окончании пересчета вызываем функцию отправки данных
            $.when(this.calcDeffered.promise()).done(this.send.bind(this));
        },
        send: function (arr) {
            var _this = this;
            window.noty(
                {
                    text: 'Новые размеры кластера посчитаны для всех ' + arr.length + ' уровней зума. <br> Отправить данные на сервер для формирования новой кластерной сетки для всех фотографий?',
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
                        {addClass: 'btn-strict btn-strict-warning', text: 'Да', onClick: function ($noty) {
                            // this = button element
                            // $noty = $noty element
                            if ($noty.$buttons && $noty.$buttons.find) {
                                $noty.$buttons.find('button').attr('disabled', true).addClass('disabled');
                            }

                            socket.once('setClustersParamsResult', function (data) {
                                $noty.$buttons.find('.btn-strict-warning').remove();
                                var okButton = $noty.$buttons.find('button')
                                    .attr('disabled', false)
                                    .removeClass('disabled')
                                    .off('click');

                                if (data && !data.error) {
                                    $noty.$message.children().html('Данные успешно отправлены на сервер для пересчета');

                                    okButton.text('Ok').on('click', function () {
                                        $noty.close();
                                        _this.finish();
                                    }.bind(this));
                                } else {
                                    $noty.$message.children().html(data.message || 'Error occurred');
                                    okButton.text('Close').on('click', function () {
                                        $noty.close();
                                        _this.cancel();
                                    }.bind(this));
                                }
                            }.bind(_this));
                            socket.emit('setClustersParams', {clusters: arr, params: _this.saveParams});
                        }},
                        {addClass: 'btn-strict', text: 'Отмена', onClick: function ($noty) {
                            $noty.close();
                            _this.cancel();
                        }}
                    ]
                }
            );
        },
        cancel: function () {
            if (this.exe()) {
                this.exe(false);
                this.exePercent(0);
                this.map.off('moveend');
                window.clearTimeout(this.setZoomTimeout);
                if (this.calcDeffered) {
                    this.calcDeffered.reject();
                }
                delete this.calcDeffered;
                delete this.setZoomTimeout;
                delete this.saveParams;
            }
            this.wNew(this.wCurr());
            this.hNew(this.hCurr());
            this.$dom.find('.clusterRect').css({width: this.wCurr(), height: this.hCurr()});
        },
        finish: function () {
            this.exe(false);
            this.exePercent(0);
            this.wCurr(this.wNew());
            this.hCurr(this.hNew());
            this.$dom.find('.clusterRect').css({width: this.wCurr(), height: this.hCurr()});
            delete this.saveParams;
        },

        toggleLayers: function (vm, event) {
            this.layersOpen(!this.layersOpen());
        },
        selectLayer: function (sys_id, type_id) {
            var layers = this.layers(),
                layerActive = this.layerActive(),
                system,
                type;

            if (layerActive.sys && layerActive.sys.id === sys_id && layerActive.type.id === type_id) {
                return;
            }

            system = _.find(layers, function (item) {
                return item.id === sys_id;
            });

            if (system) {
                type = _.find(system.types(), function (item) {
                    return item.id === type_id;
                });

                if (type) {
                    if (layerActive.sys && layerActive.type) {
                        layerActive.sys.selected(false);
                        layerActive.type.selected(false);
                        this.map.removeLayer(layerActive.type.obj);
                    }

                    system.selected(true);
                    type.selected(true);
                    this.layerActiveDesc(system.desc + ': ' + type.desc);

                    this.layerActive({sys: system, type: type});

                    if (system.deps && !type.obj) {
                        require([system.deps], function (Construct) {
                            type.obj = new Construct(type.params);
                            this.map.addLayer(type.obj);
                            type = null;
                        }.bind(this));
                    } else {
                        this.map.addLayer(type.obj);
                    }
                }
            }

            layers = system = null;
        }
    });
});