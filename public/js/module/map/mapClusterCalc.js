/**
 * Модель карты
 */
define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM',
    'renderer', 'model/User', 'model/storage', 'leaflet', 'leaflet-extends/L.neoMap', 'noties',
    'text!tpl/map/mapClusterCalc.pug', 'css!style/map/mapClusterCalc', 'jquery-ui/draggable', 'jquery-ui/resizable',
    'jquery-ui/effect-highlight', 'css!style/jquery/ui/core', 'css!style/jquery/ui/resizable', 'css!style/jquery/ui/theme',
], function (_, $, Browser, Utils, socket, P, ko, Cliche, globalVM, renderer, User, storage, L, Map, noties, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            deferredWhenReady: null, // Deffered wich will be resolved when map ready
        },
        defaults: {
            w: 40,
            h: 40,
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
            this.wCurr = ko.observable(this.defaults.w);
            this.wNew = ko.observable(this.defaults.w);
            this.hCurr = ko.observable(this.defaults.h);
            this.hNew = ko.observable(this.defaults.h);
            this.changed = this.co.changed = ko.computed(function () {
                return this.wCurr() !== this.wNew() || this.hCurr() !== this.hNew();
            }, this);
            this.isDefault = ko.computed(function () {
                return this.wCurr() === this.defaults.w || this.hCurr() === this.defaults.h;
            }, this);

            if (P.settings.USE_OSM_API()) {
                this.layers.push({
                    id: 'osm',
                    desc: 'OSM',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'mapnik',
                            desc: 'Mapnik',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { updateWhenIdle: false }),
                        },
                        {
                            id: 'mapquest',
                            desc: 'Mapquest',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', { updateWhenIdle: false }),
                        },
                    ]),
                });
            }

            if (P.settings.USE_GOOGLE_API()) {
                this.layers.push({
                    id: 'google',
                    desc: 'Google',
                    deps: 'leaflet-extends/L.Google',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Схема',
                            selected: ko.observable(false),
                            params: 'roadmap',
                        },
                        {
                            id: 'sat',
                            desc: 'Спутник',
                            selected: ko.observable(false),
                            params: 'satellite',
                        },
                        {
                            id: 'hyb',
                            desc: 'Гибрид',
                            selected: ko.observable(false),
                            params: 'hybrid',
                        },
                        {
                            id: 'land',
                            desc: 'Ландшафт',
                            selected: ko.observable(false),
                            params: 'terrain',
                        },
                    ]),
                });
            }

            if (P.settings.USE_YANDEX_API()) {
                this.layers.push({
                    id: 'yandex',
                    desc: 'Яндекс',
                    deps: 'leaflet-extends/L.Yandex',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Схема',
                            selected: ko.observable(false),
                            params: 'map',
                        },
                        {
                            id: 'sat',
                            desc: 'Спутник',
                            selected: ko.observable(false),
                            params: 'satellite',
                        },
                        {
                            id: 'hyb',
                            desc: 'Гибрид',
                            selected: ko.observable(false),
                            params: 'hybrid',
                        },
                        {
                            id: 'pub',
                            desc: 'Народная',
                            selected: ko.observable(false),
                            params: 'publicMap',
                        },
                        {
                            id: 'pubhyb',
                            desc: 'Народный гибрид',
                            selected: ko.observable(false),
                            params: 'publicMapHybrid',
                        },
                    ]),
                });
            }

            ko.applyBindings(globalVM, this.$dom[0]);

            socket.run('cluster.getClusterConditions').then(function (data) {
                if (data) {
                    this.wCurr(data.sw);
                    this.hCurr(data.sh);
                    this.wNew(data.sw);
                    this.hNew(data.sh);
                }
            }.bind(this));

            this.show();
        },
        show: function () {
            const _this = this;

            globalVM.func.showContainer(this.$container, function () {
                this.map = new L.NeoMap(this.$dom.find('.map')[0], {
                    center: [55.753395, 37.621994],
                    zoom: 13,
                    minZoom: 3,
                    maxZoom: 18,
                    zoomAnimation: false,
                    trackResize: false,
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
                        cursor: 'move',
                    }).resizable({
                        minHeight: 40,
                        minWidth: 40,
                        maxHeight: 300,
                        maxWidth: 300,
                        aspectRatio: 1,
                        resize: function (event, ui) {
                            _this.wNew(ui.size.width);
                            _this.hNew(ui.size.height);
                        },
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
        setDefaults: function () {
            this.wNew(this.defaults.w);
            this.hNew(this.defaults.h);
        },
        save: function () {
            const _this = this;

            const $clusterRect = this.$dom.find('.clusterRect');
            const w = this.wNew();
            const h = this.hNew();
            const pos = $clusterRect.position();

            const centerGeo = this.map.containerPointToLatLng(new L.Point(pos.left + w / 2, pos.top + h / 2));

            const wMap = this.$dom.find('.mapContainer').width();
            const hMap = this.$dom.find('.mapContainer').height();

            const zooms = _.range(3, 16 + 1); // Уровни 3 - 16
            const result = [];

            const setZoom = function (z) {
                if (_this.exe()) {
                    _this.map.setView(centerGeo, z);
                }
            };
            const calcOnZoom = function (z) {
                const rectCenter = _this.map.latLngToContainerPoint(_this.map.getCenter());
                const rectTopLeft = _this.map.containerPointToLatLng(new L.Point(rectCenter.x - w / 2, rectCenter.y - h / 2));
                const rectBottomRight = _this.map.containerPointToLatLng(new L.Point(rectCenter.x + w / 2, rectCenter.y + h / 2));

                return {
                    z: z,
                    w: Utils.math.toPrecision(Math.abs(rectTopLeft.lng - rectBottomRight.lng)),
                    h: Utils.math.toPrecision(Math.abs(rectTopLeft.lat - rectBottomRight.lat)),
                };
            };
            const changeZoomRecursive = _.debounce(function () {
                const z = _this.map.getZoom();

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
                sh: this.hNew(),
            };
            this.calcDeffered = new $.Deferred();
            // Ставим статус, что идет пересчет
            this.exe(true);
            this.exePercent(0);
            // Ставим прямоугольник по центру
            $clusterRect.css({ left: wMap / 2 - w / 2, top: hMap / 2 - h / 2 });
            // Подписываемся на изменение зума карты
            this.map.on('moveend', changeZoomRecursive, this);
            // Начинаем подсчет
            setZoom(_.head(zooms));
            // По окончании пересчета вызываем функцию отправки данных
            $.when(this.calcDeffered.promise()).done(this.send.bind(this));
        },
        send: function (arr) {
            const _this = this;

            noties.confirm({
                message: 'Новые параметры кластера посчитаны для всех ' + arr.length + ' уровней зума. <br>' +
                'Отправить данные на сервер для формирования новой кластерной сетки всех фотографий?<br>' +
                'Это может занять несколько минут',
                okText: 'Да',
                okClass: 'btn-warning',
                onOk: function (confirmer) {
                    confirmer.disable();

                    socket.run('cluster.recalcAll', { params: arr, conditions: _this.saveParams }, true)
                        .then(function () {
                            if (confirmer) {
                                confirmer.success('Новая кластерная сетка сформированна', 'Ok', null, function () {
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
                        'Данные отправлены на сервер для пересчета.<br>' +
                        'Вы можете закрыть этот диалог - данные расчитываются на сервере.<br>' +
                        'Диалог обновится при получении результата расчета с сервера', 'Закрыть', null, function () {
                            confirmer = null;
                            _this.finish();
                        });
                },
                onCancel: function () {
                    _this.cancel();
                },
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
            let layers = this.layers();
            const layerActive = this.layerActive();
            let system;
            let type;

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
        },
    });
});
