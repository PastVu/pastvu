/**
 * Модель карты
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM',
    'renderer', 'model/User', 'model/storage', 'leaflet', 'lib/leaflet/extends/L.neoMap', 'noties',
    'text!tpl/map/mapClusterCalc.jade', 'css!style/map/mapClusterCalc', 'jquery-ui/draggable', 'jquery-ui/resizable',
    'jquery-ui/effect-highlight', 'css!style/jquery/ui/core', 'css!style/jquery/ui/resizable', 'css!style/jquery/ui/theme'
], function (_, $, Browser, Utils, socket, P, ko, Cliche, globalVM, renderer, User, storage, L, Map, noties, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        options: {
            deferredWhenReady: null // Deffered wich will be resolved when map ready
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];

            // Map objects
            this.map = null;
            this.layers = ko.observableArray();
            this.layersOpen = ko.observable(false);
            this.layerActive = ko.observable({ sys: null, type: null });
            this.layerActiveDesc = ko.observable('');

            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.exePercent = ko.observable(0); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.wCurr = ko.observable(40);
            this.wNew = ko.observable(40);
            this.hCurr = ko.observable(40);
            this.hNew = ko.observable(40);
            this.changed = this.co.changed = ko.computed(function () {
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
                            obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', { updateWhenIdle: false })
                        },
                        {
                            id: 'mapnik',
                            desc: 'Mapnik',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { updateWhenIdle: false })
                        },
                        {
                            id: 'mapquest',
                            desc: 'Mapquest',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', { updateWhenIdle: false })
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
                            desc: 'Scheme',
                            selected: ko.observable(false),
                            params: 'ROADMAP'
                        },
                        {
                            id: 'sat',
                            desc: 'Satellite',
                            selected: ko.observable(false),
                            params: 'SATELLITE'
                        },
                        {
                            id: 'hyb',
                            desc: 'Hybrid',
                            selected: ko.observable(false),
                            params: 'HYBRID'
                        },
                        {
                            id: 'land',
                            desc: 'Terrain',
                            selected: ko.observable(false),
                            params: 'TERRAIN'
                        }
                    ])
                });
            }
            if (P.settings.USE_YANDEX_API()) {
                this.layers.push({
                    id: 'yandex',
                    desc: 'Yandex',
                    deps: 'lib/leaflet/extends/L.Yandex',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Scheme',
                            selected: ko.observable(false),
                            params: 'map'
                        },
                        {
                            id: 'sat',
                            desc: 'Satellite',
                            selected: ko.observable(false),
                            params: 'satellite'
                        },
                        {
                            id: 'hyb',
                            desc: 'Hybrid',
                            selected: ko.observable(false),
                            params: 'hybrid'
                        },
                        {
                            id: 'pub',
                            desc: 'Public',
                            selected: ko.observable(false),
                            params: 'publicMap'
                        },
                        {
                            id: 'pubhyb',
                            desc: 'Public hybrid',
                            selected: ko.observable(false),
                            params: 'publicMapHybrid'
                        }
                    ])
                });
            }

            ko.applyBindings(globalVM, this.$dom[0]);

            this.show();
        },
        show: function () {
            var _this = this;
            globalVM.func.showContainer(this.$container, function () {

                this.map = new L.NeoMap(this.$dom.find('.map')[0], {
                    center: [55.753395, 37.621994],
                    zoom: 13,
                    minZoom: 3,
                    maxZoom: 18,
                    zoomAnimation: false,
                    trackResize: false
                });

                // Самостоятельно обновлем размеры карты
                this.subscriptions.sizes = P.window.square.subscribe(function () {
                    this.map._onResize();
                }.bind(this));

                this.map.whenReady(function () {
                    this.selectLayer('google', 'scheme');
                    if (this.options.deferredWhenReady && Utils.isType('function', this.options.deferredWhenReady.resolve)) {
                        this.options.deferredWhenReady.resolve();
                    }
                    this.$dom.find('.clusterRect').draggable({
                        containment: this.$dom.find('.mapContainer'),
                        scroll: false,
                        cursor: 'move'
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

            }, this);

            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.hide();
            this.map = null;
            destroy.call(this);
        },

        save: function () {
            var _this = this;

            var $clusterRect = this.$dom.find('.clusterRect');
            var w = this.wNew();
            var h = this.hNew();
            var pos = $clusterRect.position();

            var centerGeo = this.map.containerPointToLatLng(new L.Point(pos.left + w / 2, pos.top + h / 2));

            var wMap = this.$dom.find('.mapContainer').width();
            var hMap = this.$dom.find('.mapContainer').height();

            var zooms = _.range(3, 16 + 1); // Уровни 3 - 16
            var result = [];

            var setZoom = function (z) {
                if (_this.exe()) {
                    _this.map.setView(centerGeo, z);
                }
            };
            var calcOnZoom = function (z) {
                var rectCenter = _this.map.latLngToContainerPoint(_this.map.getCenter());
                var rectTopLeft = _this.map.containerPointToLatLng(new L.Point(rectCenter.x - w / 2, rectCenter.y - h / 2));
                var rectBottomRight = _this.map.containerPointToLatLng(new L.Point(rectCenter.x + w / 2, rectCenter.y + h / 2));

                return {
                    z: z,
                    w: Utils.math.toPrecision(Math.abs(rectTopLeft.lng - rectBottomRight.lng)),
                    h: Utils.math.toPrecision(Math.abs(rectTopLeft.lat - rectBottomRight.lat))
                };
            };
            var changeZoomRecursive = _.debounce(function () {
                var z = _this.map.getZoom();

                result.push(calcOnZoom(z));
                this.exePercent(Math.ceil(100 * (zooms.indexOf(z) + 1) / zooms.length)); // Обновляем прогресс-бар подсчета

                if (z === _.last(zooms)) {
                    _this.map.off('moveend', changeZoomRecursive, this);
                    _this.calcDeffered.resolve(result);
                    delete _this.calcDeffered;
                    delete _this.setZoomTimeout;
                } else {
                    $clusterRect.effect('highlight', { color: '#ffffff' }, 400); // Эффект вспышки
                    _this.setZoomTimeout = _.delay(setZoom, 430, z + 1);
                }
            }, 800);

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
            $clusterRect.css({ left: (wMap / 2) - w / 2, top: (hMap / 2) - h / 2 });
            // Подписываемся на изменение зума карты
            this.map.on('moveend', changeZoomRecursive, this);
            // Начинаем подсчет
            setZoom(_.head(zooms));
            // По окончании пересчета вызываем функцию отправки данных
            $.when(this.calcDeffered.promise()).done(this.send.bind(this));
        },
        send: function (arr) {
            var _this = this;

            noties.confirm({
                message: 'New cluster parameters is calculated for all ' + arr.length + ' zooms. <br> ' +
                'Send data to server for forming new cluster grid for all photos? <br> It may takes several minutes',
                okText: 'Yes',
                okClass: 'btn-warning',
                onOk: function (confirmer) {
                    confirmer.disable();

                    socket.run('cluster.recalcAll', { params: arr, conditions: _this.saveParams }, true)
                        .then(function () {
                            if (confirmer) {
                                confirmer.success('New cluster grid is complete', 'Ok', null, function () {
                                    _this.finish();
                                });
                            }
                        })
                        .catch(function () {
                            if (confirmer) {
                                confirmer.close();
                            }
                            _this.cancel();
                        });

                    confirmer.success(
                        'Data has been sent to server for calculation.<br>' +
                        'You may close this dialog - grid is being calculated on server-side.<br>' +
                        'This dialog will be updated after receiving result from server', 'Close', null, function () {
                            confirmer = null;
                            _this.finish();
                        });
                },
                onCancel: function () {
                    _this.cancel();
                }
            });
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
            this.$dom.find('.clusterRect').css({ width: this.wCurr(), height: this.hCurr() });
        },
        finish: function () {
            this.exe(false);
            this.exePercent(0);
            this.wCurr(this.wNew());
            this.hCurr(this.hNew());
            this.$dom.find('.clusterRect').css({ width: this.wCurr(), height: this.hCurr() });
            delete this.saveParams;
        },

        toggleLayers: function (/*vm, event*/) {
            this.layersOpen(!this.layersOpen());
        },
        selectLayer: function (sysId, typeId) {
            var layers = this.layers();
            var layerActive = this.layerActive();
            var system;
            var type;

            if (layerActive.sys && layerActive.sys.id === sysId && layerActive.type.id === typeId) {
                return;
            }

            system = _.find(layers, function (item) {
                return item.id === sysId;
            });

            if (system) {
                type = _.find(system.types(), function (item) {
                    return item.id === typeId;
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

                    this.layerActive({ sys: system, type: type });

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