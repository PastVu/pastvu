/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
    'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
    'm/User', 'm/storage', 'Locations',
    'leaflet', 'lib/leaflet/extends/L.neoMap', 'm/map/marker',
    'text!tpl/map/map.jade', 'css!style/map/map'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, User, storage, Locations, L, Map, MarkerManager, jade) {
    'use strict';
    var $window = $(window);

    return Cliche.extend({
        jade: jade,
        options: {
            canOpen: true,
            editing: false,
            deferredWhenReady: null // Deffered wich will be resolved when map ready
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);

            // Modes
            this.embedded = ko.observable(this.options.embedded);
            this.editing = ko.observable(this.options.editing);

            // Map objects
            this.map = null;
            this.mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng);
            this.layers = ko.observableArray();
            this.layersOpen = ko.observable(false);
            this.layerActive = ko.observable({sys: null, type: null});
            this.layerActiveDesc = ko.observable('');

            this.marker_mgr = null;
            this.pointGeo = null;

            this.auth = globalVM.repository['m/auth'];

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
                            obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {updateWhenIdle: false}),
                            maxZoom: 18
                        },
                        {
                            id: 'mapnik',
                            desc: 'Mapnik',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {updateWhenIdle: false}),
                            maxZoom: 18
                        },
                        {
                            id: 'mapquest',
                            desc: 'Mapquest',
                            selected: ko.observable(false),
                            obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {updateWhenIdle: false}),
                            maxZoom: 18
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
                            params: 'ROADMAP',
                            maxZoom: 20
                        },
                        {
                            id: 'sat',
                            desc: 'Спутник',
                            selected: ko.observable(false),
                            params: 'SATELLITE',
                            maxZoom: 19
                        },
                        {
                            id: 'hyb',
                            desc: 'Гибрид',
                            selected: ko.observable(false),
                            params: 'HYBRID',
                            maxZoom: 19
                        },
                        {
                            id: 'land',
                            desc: 'Ландшафт',
                            selected: ko.observable(false),
                            params: 'TERRAIN',
                            maxZoom: 15
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
                            params: 'map',
                            maxZoom: 17
                        },
                        {
                            id: 'sat',
                            desc: 'Спутник',
                            selected: ko.observable(false),
                            params: 'satellite',
                            maxZoom: 19
                        },
                        {
                            id: 'hyb',
                            desc: 'Гибрид',
                            selected: ko.observable(false),
                            params: 'hybrid',
                            maxZoom: 19
                        },
                        {
                            id: 'pub',
                            desc: 'Народная',
                            selected: ko.observable(false),
                            params: 'publicMap',
                            maxZoom: 18
                        },
                        {
                            id: 'pubhyb',
                            desc: 'Народный гибрид',
                            selected: ko.observable(false),
                            params: 'publicMapHybrid',
                            maxZoom: 18
                        }
                    ])
                });
            }

            ko.applyBindings(globalVM, this.$dom[0]);

            // Subscriptions
            this.subscriptions.edit = this.editing.subscribe(this.editHandler, this);

            this.show();
        },
        show: function () {
            this.$container.fadeIn(400, function () {

                this.map = new L.neoMap(this.$dom.find('.map')[0], {center: this.mapDefCenter, zoom: Locations.current.z, minZoom: 3, zoomAnimation: L.Map.prototype.options.zoomAnimation && true, trackResize: false});
                this.marker_mgr = new MarkerManager(this.map, {});

                Locations.subscribe(function (val) {
                    this.mapDefCenter = new L.LatLng(val.lat, val.lng);
                    this.setMapDefCenter(true);
                }.bind(this));

                //Самостоятельно обновлем размеры карты
                P.window.square.subscribe(function (newVal) {
                    this.map._onResize();
                }.bind(this));

                this.map.whenReady(function () {
                    this.selectLayer('osm', 'osmosnimki');
                    if (this.options.deferredWhenReady && Utils.isType('function', this.options.deferredWhenReady.resolve)) {
                        this.options.deferredWhenReady.resolve();
                    }
                }, this);

                renderer(
                    [
                        {module: 'm/map/navSlider', container: '.mapNavigation', options: {map: this.map, canOpen: !this.options.embedded}, ctx: this, callback: function (vm) {
                            this.childModules[vm.id] = vm;
                            this.navSliderVM = vm;
                        }.bind(this)}
                    ],
                    {
                        parent: this,
                        level: this.level + 1
                    }
                );

            }.bind(this));

            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.hide();
            this.editMarkerDestroy();
            this.map = null;
            destroy.call(this);
        },

        // Обработчик переключения режима редактирования
        editHandler: function (val) {
            if (val) {
                this.editMarkerCreate();
            } else {
                this.editMarkerDestroy();
            }
        },
        // Включает режим редактирования
        editMarkerOn: function () {
            this.editing(true);
            return this;
        },
        // Выключает режим редактирования
        editMarkerOff: function () {
            this.editing(false);
            return this;
        },
        // Создает маркер для редктирования установленной точки
        editMarkerCreate: function () {
            if (!this.markerEdit) {
                this.markerEdit = L.marker(this.pointGeo, {draggable: true, title: 'Shooting point', icon: L.icon({iconSize: [26, 43], iconAnchor: [13, 36], iconUrl: '/img/map/pinEdit.png', className: 'markerEdit'})});
                this.layerEdit = L.layerGroup([this.markerEdit]).addTo(this.map);
                this.markerEdit.on('dragend', function (e) {
                    var latlng = this.getLatLng();
                    Utils.geo.geoToPrecision(latlng);
                    this.update();
                    console.log(_.pick(latlng, 'lng', 'lat'));
                });
                this.map.on('click', function (e) {
                    this.markerEdit.setLatLng(Utils.geo.geoToPrecision(e.latlng));
                }, this);
            }
            return this;
        },
        // Уничтожает маркер редактирования
        editMarkerDestroy: function () {
            if (this.markerEdit) {
                this.markerEdit.off('dragend');
                this.map.removeLayer(this.layerEdit);
                delete this.markerEdit;
                delete this.layerEdit;
                this.map.off('click');
            }
            return this;
        },
        editGetGeo: function () {
            var latlng = Utils.geo.geoToPrecision(this.markerEdit.getLatLng());
            return [latlng.lat, latlng.lng];
        },
        // Устанавливает точку текущей фотографии
        setPointGeo: function (geo) {
            if (geo) {
                this.pointGeo = geo;
                if (this.editing() && this.markerEdit) {
                    this.markerEdit.setLatLng(geo);
                }
                if (geo[0] || geo[1]) {
                    this.map.panTo(geo);
                }
            }
            return this;
        },

        setMapDefCenter: function (forceMoveEvent) {
            this.map.setView(this.mapDefCenter, Locations.current.z, false);
        },
        toggleLayers: function (vm, event) {
            this.layersOpen(!this.layersOpen());
        },
        selectLayer: function (sys_id, type_id) {
            var layers = this.layers(),
                layerActive = this.layerActive(),
                system,
                type,
                setLayer = function (type) {
                    this.map.addLayer(type.obj);
                    this.marker_mgr.layerChange();
                    this.map.options.maxZoom = type.maxZoom;
                    if (this.navSliderVM && Utils.isType('function', this.navSliderVM.recalcZooms)) {
                        this.navSliderVM.recalcZooms();
                    }
                    if (this.map.getZoom() > type.maxZoom) {
                        this.map.setZoom(type.maxZoom);
                    }
                }.bind(this);

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

                    /*if (!!window.localStorage) {
                     window.localStorage['arguments.SelectLayer'] = Array.prototype.slice.call(arguments).join(',');
                     }*/
                    this.layerActive({sys: system, type: type});

                    if (system.deps && !type.obj) {
                        require([system.deps], function (Construct) {
                            type.obj = new Construct(type.params);
                            setLayer(type);
                            type = null;
                        }.bind(this));
                    } else {
                        setLayer(type);
                    }
                }
            }

            layers = system = null;
        }
    });
});