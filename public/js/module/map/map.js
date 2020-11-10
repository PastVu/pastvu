/**
 * Модель карты
 */
define([
    'underscore', 'Browser', 'Utils', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'renderer',
    'model/User', 'model/storage', 'Locations', 'leaflet', 'lib/leaflet/extends/L.neoMap', 'm/map/marker',
    'm/photo/status', 'text!tpl/map/map.pug', 'css!style/map/map', 'jquery-ui/draggable', 'jquery-ui/slider',
    'jquery-ui/effect-highlight', 'css!style/jquery/ui/core', 'css!style/jquery/ui/theme', 'css!style/jquery/ui/slider'
], function (_, Browser, Utils, P, ko, Cliche, globalVM, renderer, User, storage, Locations, L, Map, MarkerManager, statuses, pug) {
    'use strict';

    var defaults = {
        sys: 'osm',
        type: 'osmosnimki',
        minZoom: 3,
        maxZoom: 18,
        zoom: 17
    };

    return Cliche.extend({
        pug: pug,
        options: {
            isPainting: undefined,
            embedded: undefined, // Режим встроенной карты
            editing: undefined, // Режим редактирования
            point: undefined,
            center: undefined
        },
        create: function () {
            var self = this;
            var qParams = globalVM.router.params();
            var qType = Number(qParams.type);

            this.destroy = _.wrap(this.destroy, this.localDestroy);

            // Promise witch will be resolved when map ready
            this.readyPromise = new Promise(function(resolve) {
                self.readyPromiseResolve = resolve;
            });
            this.changeSubscribers = [];

            // Modes
            this.embedded = this.options.embedded;
            this.editing = ko.observable(this.options.editing);
            this.openNewTab = ko.observable(!!Utils.getLocalStorage(this.embedded ? 'map.embedded.opennew' : 'map.opennew'));
            this.isPainting = ko.observable(this.options.isPainting !== undefined ?
                this.options.isPainting :
                !!Utils.getLocalStorage(this.embedded ? 'map.embedded.isPainting' : 'map.isPainting')
            );
            if (!this.embedded && qType && _.values(statuses.type).includes(qType)) {
                this.isPainting(qType === statuses.type.PAINTING);
            }
            this.type = this.co.typeComputed = ko.computed(function () {
                return self.isPainting() ? statuses.type.PAINTING : statuses.type.PHOTO;
            });
            this.linkShow = ko.observable(false); //Показывать ссылку на карту
            this.link = ko.observable(''); //Ссылка на карту

            // Map objects
            this.map = null;
            this.mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng);
            this.layers = ko.observableArray();
            this.layersOpen = ko.observable(false);
            this.layerActive = ko.observable({ sys: null, type: null });
            this.layerActiveDesc = ko.observable('');

            this.markerManager = null;

            //Если карта встроена, то создаем точку для выделения и слой, куда её добавить
            if (this.embedded) {
                this.point = this.options.point; // Точка для выделения
                this.pointLayer = L.layerGroup();

                this.geoInputComputed = this.co.geoInputComputed = ko.computed({
                    read: function () {
                        var geo = this.point.geo();
                        return _.isEmpty(geo) ? '' : geo.join(',');
                    },
                    write: function (value) {
                        var geo = this.point.geo();
                        var inputGeo;

                        if (_.isEmpty(value)) {
                            this.delPointGeo();
                        } else {
                            inputGeo = value
                                .split(',')
                                .filter(function (val) {
                                    val = val.trim();
                                    return val && val[0] !== '.' && val[val.length - 1] !== '.';
                                })
                                .map(Number);

                            if (Utils.geo.checkLatLng(inputGeo) && !_.isEqual(inputGeo, geo)) {
                                inputGeo = Utils.geo.geoToPrecision(inputGeo);
                                this.point.geo(inputGeo);

                                if (this.pointMarkerEdit) {
                                    this.pointMarkerEdit.setLatLng(inputGeo);
                                } else {
                                    this.pointEditMarkerCreate();
                                }
                                this.map.panTo(inputGeo);
                            }
                        }
                    },
                    owner: this
                });
            }

            var type = this.type();

            this.setYears(
                !this.embedded && (Number(qParams.y) || Utils.getLocalStorage('map.year.' + type)),
                !this.embedded && (Number(qParams.y2) || Utils.getLocalStorage('map.year2.' + type))
            );

            this.yearRefreshMarkersBind = this.yearRefreshMarkers.bind(this);
            this.yearRefreshMarkersTimeout = null;

            this.infoShow = ko.observable(true);

            this.layers.push({
                id: 'osm',
                desc: 'OSM',
                selected: ko.observable(false),
                types: ko.observableArray([
                    /* Define map types (layers).
                     *
                     * For fixed max zoom: specify maxZoom in TileLayer and in
                     * type object. It will be possible to zoom map up to maxZoom
                     * value.
                     *
                     * For "overzoom", set maxNativeZoom in TileLayer, and maxZoom
                     * in both TileLayer and in type object. It will be possible to
                     * zoom map up to maxZoom value. Layer will be "stretched" if
                     * current zoom is above maxNativeZoom.
                     *
                     * For switching layer, set maxNativeZoom in TileLayer, and maxZoom
                     * in both TileLayer and in type object. Set limitZoom in type
                     * object. It will be possible to zoom map up to maxZoom value.
                     * When current zoom > limitZoom, map will switch to maxAfter
                     * layer, keeping current zoom value. maxAfter value
                     * format is "<sys id>.<type id>", e.g. 'osm.mapnik'.
                     */
                    {
                        id: 'osmosnimki',
                        desc: 'Kosmosnimki',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://osmcluster.kosmosnimki.ru/kosmo/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="https://kosmosnimki.ru/">ScanEx</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                            updateWhenIdle: false,
                            maxZoom: 18,
                            maxNativeZoom: 17
                        }),
                        maxZoom: 18,
                        limitZoom: 17,
                        maxAfter: 'osm.mapnik'
                    },
                    {
                        id: 'mapnik',
                        desc: 'Mapnik',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                            updateWhenIdle: false,
                            maxZoom: 19
                        }),
                        maxZoom: 19
                    },
                    {
                        id: 'mapnik_de',
                        desc: 'Mapnik De',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png', {
                            updateWhenIdle: false,
                            maxZoom: 19,
                            maxNativeZoom: 18,
                            attribution: 'OSM Deutsch | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }),
                        maxZoom: 19,
                        limitZoom: 18,
                        maxAfter: 'osm.mapnik'
                    },
                    {
                        id: 'mapnik_fr',
                        desc: 'Mapnik Fr',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
                            updateWhenIdle: false,
                            maxZoom: 20,
                            attribution: 'OSM Française | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        }),
                        maxZoom: 19,
                        limitZoom: 18,
                        maxAfter: 'osm.mapnik'
                    },
                    {
                        id: 'opentopomap',
                        desc: 'Topographer',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                            updateWhenIdle: false,
                            maxZoom: 18,
                            maxNativeZoom: 17,
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
                        }),
                        maxZoom: 18,
                        limitZoom: 17,
                        maxAfter: 'osm.mapnik'
                    },
                    {
                        id: 'stamen_bw',
                        desc: 'Stamen b/w',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.{ext}', {
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>',
                            subdomains: 'abcd',
                            maxZoom: 20,
                            ext: 'png',
                            updateWhenIdle: false
                        }),
                        maxZoom: 20
                    }
                ])
            });
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
                            params: 'ROADMAP',
                            maxZoom: 20
                        },
                        {
                            id: 'sat',
                            desc: 'Satellite',
                            selected: ko.observable(false),
                            params: 'SATELLITE',
                            maxZoom: 20
                        },
                        {
                            id: 'hyb',
                            desc: 'Hybrid',
                            selected: ko.observable(false),
                            params: 'HYBRID',
                            maxZoom: 20
                        },
                        {
                            id: 'land',
                            desc: 'Terrain',
                            selected: ko.observable(false),
                            params: 'TERRAIN',
                            maxZoom: 20
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
                            params: 'map',
                            maxZoom: 20
                        },
                        {
                            id: 'sat',
                            desc: 'Satellite',
                            selected: ko.observable(false),
                            params: 'satellite',
                            maxZoom: 19
                        },
                        {
                            id: 'hyb',
                            desc: 'Hybrid',
                            selected: ko.observable(false),
                            params: 'hybrid',
                            maxZoom: 19
                        }
                    ])
                });
            }
            this.layers.push({
                id: 'other',
                desc: 'Other',
                selected: ko.observable(false),
                types: ko.observableArray([
                    {
                        id: 'esri_satimg',
                        desc: 'Esri',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                            attribution: '&copy; Esri &mdash; Sources: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                            updateWhenIdle: false,
                            maxZoom: 20,
                            maxNativeZoom: 19
                        }),
                        maxZoom: 20
                    },
                    {
                        id: 'mtb',
                        desc: 'MTB',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('http://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png', {
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="http://mtbmap.cz/">mtbmap.cz</a>',
                            updateWhenIdle: false,
                            maxZoom: 19,
                            maxNativeZoom: 18
                        }),
                        maxZoom: 19,
                        limitZoom: 18,
                        maxAfter: 'osm.mapnik'
                    },
                    {
                        id: 'warfly',
                        desc: 'WWII Aerial',
                        selected: ko.observable(false),
                        obj: new L.TileLayer('https://17200.selcdn.ru/AerialWWII/Z{z}/{y}/{x}.jpg', {
                            attribution: 'WWII Aerial photos <a href="http://warfly.ru/about">warfly.ru</a> (coverage is limited to some locations)',
                            updateWhenIdle: false,
                            minZoom: 9,
                            maxZoom: 19,
                            maxNativeZoom: 17
                        }),
                        maxZoom: 19,
                        minZoom: 9
                    }
                ])
            });

            this.showLinkBind = this.showLink.bind(this);

            ko.applyBindings(globalVM, this.$dom[0]);

            // Subscriptions
            this.subscriptions.edit = this.editing.subscribe(this.editHandler, this);
            this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
            this.subscriptions.openNewTab = this.openNewTab.subscribe(function (val) {
                if (this.markerManager) {
                    this.markerManager.openNewTab = val;
                }
                this.setLocalState();
            }, this);

            this.show();
        },
        setLocalState: function () {
            var layerActive = this.layerActive();

            Utils.setLocalStorage(this.embedded ? 'map.embedded.opennew' : 'map.opennew', this.openNewTab());
            Utils.setLocalStorage(this.embedded ? 'map.embedded.sys' : 'map.sys', layerActive.sys.id);
            Utils.setLocalStorage(this.embedded ? 'map.embedded.type' : 'map.type', layerActive.type.id);

            if (!this.embedded) {
                Utils.setLocalStorage('map.isPainting', this.isPainting());
                Utils.setLocalStorage('map.center', Utils.geo.latlngToArr(this.map.getCenter()));
                Utils.setLocalStorage('map.zoom', this.map.getZoom());

                var type = this.type();
                var years = statuses.years[this.type()];

                if (this.yearLow > years.min) {
                    Utils.setLocalStorage('map.year.' + type, this.yearLow);
                } else {
                    Utils.removeLocalStorage('map.year.' + type);
                }

                if (this.yearHigh < years.max) {
                    Utils.setLocalStorage('map.year2.' + type, this.yearHigh);
                } else {
                    Utils.removeLocalStorage('map.year2.' + type);
                }

            }
        },
        setYears: function (y, y2) {
            var type = this.type();
            var years = statuses.years[type] || statuses.years[statuses.type.PHOTO];

            if (_.isNumber(y) && y !== 0 && y > years.min && y <= years.max) {
                this.yearLow = y;
            } else {
                this.yearLow = years.min;
            }
            if (_.isNumber(y2) && y2 !== 0 && y2 >= this.yearLow && y2 < years.max) {
                this.yearHigh = y2;
            } else {
                this.yearHigh = years.max;
            }
        },
        setPainting: function (val) {
            this.isPainting(val);

            this.yearSliderRefresh();
            if (this.markerManager) {
                this.markerManager.changePainting(val, this.yearLow, this.yearHigh, true);
            }
            this.notifySubscribers();
            this.setLocalState();
        },
        notifySubscribers: function () {
            var data = this.getStatusData();
            this.changeSubscribers.forEach(function (item) {
                item.callback.call(item.ctx, data);
            }, this);
        },
        getStatusData: function () {
            return {
                isPainting: this.isPainting(),
                year: this.yearLow, year2: this.yearHigh,
                center: this.getCenter()
            };
        },

        show: function () {
            var region;
            var center;
            var bbox;
            var fitBounds;
            var qParams = globalVM.router.params();
            var zoom = Number(qParams.z) || (this.embedded ? defaults.zoom : (Utils.getLocalStorage('map.zoom') || Locations.current.z));
            var system = qParams.s || Utils.getLocalStorage(this.embedded ? 'map.embedded.sys' : 'map.sys') || defaults.sys;
            var type = qParams.t || Utils.getLocalStorage(this.embedded ? 'map.embedded.type' : 'map.type') || defaults.type;

            if (this.embedded) {
                if (this.point) {
                    region = _.last(this.point.regions());

                    if (this.point.geo()) {
                        center = this.point.geo();
                    } else if (region && region.center) {
                        center = [region.center()[1], region.center()[0]];

                        if (region.bboxhome || region.bbox) {
                            bbox = region.bboxhome() || region.bbox();
                            if (Utils.geo.checkbbox(bbox)) {
                                fitBounds = [
                                    [bbox[1], bbox[0]],
                                    [bbox[3], bbox[2]]
                                ];
                            }
                        }
                    }
                } else {
                    center = this.options.center;
                }
            } else {
                center = qParams.g;
                if (center) {
                    center = center.split(',').map(function (element) {
                        return parseFloat(element);
                    });
                    if (!Utils.geo.checkLatLng(center)) {
                        center = null;
                    }
                }
                if (!center) {
                    center = Utils.getLocalStorage('map.center');
                }
            }
            if (!center || !Utils.geo.checkLatLng(center)) {
                center = this.mapDefCenter;
            }

            this.map = new L.NeoMap(this.$dom.find('.map')[0], {
                center: center,
                zoom: zoom,
                zoomAnimation: L.Map.prototype.options.zoomAnimation && true,
                trackResize: false,
                zoomControl: false // Remove default zoom control (we use our own)
            });
            if (fitBounds) {
                this.map.fitBounds(fitBounds, { maxZoom: defaults.maxZoom });
            }
            this.markerManager = new MarkerManager(this.map, {
                enabled: false,
                openNewTab: this.openNewTab(),
                isPainting: this.isPainting(),
                embedded: this.embedded,
                year: this.yearLow,
                year2: this.yearHigh
            });
            this.selectLayer(system, type);

            Locations.subscribe(function (val) {
                this.mapDefCenter = new L.LatLng(val.lat, val.lng);
                this.setMapDefCenter(true);
            }.bind(this));

            renderer(
                [
                    {
                        module: 'm/map/navSlider',
                        container: '.mapNavigation',
                        options: {
                            map: this.map,
                            maxZoom: this.layerActive().type.limitZoom || this.layerActive().type.maxZoom,
                            canOpen: !this.embedded
                        },
                        ctx: this,
                        callback: function (vm) {
                            this.childModules[vm.id] = vm;
                            this.navSliderVM = vm;
                        }.bind(this)
                    }
                ],
                {
                    parent: this,
                    level: this.level + 1
                }
            );

            this.map
                .on('zoomend', this.zoomEndCheckLayer, this)
                .whenReady(function () {
                    if (this.embedded) {
                        this.map.addLayer(this.pointLayer);
                    } else {
                        this.map.on('moveend', this.saveCenterZoom, this);
                    }
                    this.map.on('moveend', function () {
                        this.notifySubscribers();
                    }, this);
                    this.editHandler(this.editing());

                    this.yearSliderCreate();
                    this.setLocalState();

                    globalVM.func.showContainer(this.$container);

                    setTimeout(this.readyPromiseResolve, 100);
                }, this);

            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.removeShowLinkListener();
            this.pointHighlightDestroy().pointEditDestroy().markerManager.destroy();
            this.map.off('zoomend');
            this.map.off('moveend');
            this.map.remove();
            delete this.point;
            delete this.map;
            delete this.markerManager;
            destroy.call(this);
        },
        sizesCalc: function () {
            this.map.whenReady(this.map._onResize, this.map); //Самостоятельно обновляем размеры карты
        },

        // Обработчик переключения режима редактирования
        editHandler: function (edit) {
            if (edit) {
                this.pointHighlightDestroy().pointEditCreate().markerManager.disable();
            } else {
                this.pointEditDestroy().pointHighlightCreate().markerManager.enable();
            }
        },
        // Включает режим редактирования
        editPointOn: function () {
            this.editing(true);
            return this;
        },
        // Выключает режим редактирования
        editPointOff: function () {
            this.editing(false);
            return this;
        },

        setPoint: function (point, isPainting) {
            var geo = point.geo();
            var bbox;
            var zoom;
            var region = _.last(point.regions());

            this.point = point;
            if (isPainting !== this.isPainting()) {
                this.isPainting(isPainting);
                this.yearSliderRefresh();
                if (this.markerManager) {
                    this.markerManager.changePainting(isPainting, this.yearLow, this.yearHigh);
                }
            }
            if (this.editing()) {
                if (this.pointMarkerEdit) {
                    if (geo) {
                        this.pointMarkerEdit.setLatLng(geo);
                    } else {
                        this.pointEditMarkerDestroy();
                    }
                } else if (geo) {
                    this.pointEditMarkerCreate();
                }
            } else {
                this.pointHighlightCreate();
            }

            if (geo) {
                this.map.panTo(geo);
            } else if (region && region.center) {
                if (region.bboxhome || region.bbox) {
                    bbox = region.bboxhome() || region.bbox();
                    if (Utils.geo.checkbbox(bbox)) {
                        zoom = this.map.getBoundsZoom([
                            [bbox[1], bbox[0]],
                            [bbox[3], bbox[2]]
                        ], false);
                    }
                }
                this.map.setView([region.center()[1], region.center()[0]], zoom || this.map.getZoom());
            }

            return this;
        },
        geoInputBlur: function (vm, evt) {
            var geo = this.point.geo();
            var $inputGeo = $(evt.target);
            var inputGeo = $inputGeo.val();

            // При выходе фокуса с поля координаты, вставляем актуальное в него значение geo, например, если оно в поле не валидное
            if (_.isEmpty(geo)) {
                if (inputGeo) {
                    $inputGeo.val('');
                }
            } else {
                geo = geo.join(',');
                if (geo !== inputGeo) {
                    $inputGeo.val(geo);
                }
            }
        },
        delPointGeo: function () {
            this.pointHighlightDestroy().pointEditMarkerDestroy().point.geo(null);
        },

        // Создает подсвечивающий маркер для point, если координаты точки есть
        pointHighlightCreate: function () {
            this.pointHighlightDestroy();
            if (this.point && this.point.geo()) {
                var divIcon = L.divIcon({
                    className: 'photoIcon highlight ' + 'y' + this.point.year() + ' ' + this.point.dir(),
                    iconSize: new L.Point(8, 8)
                });

                this.pointMarkerHL = L.marker(this.point.geo(), {
                    zIndexOffset: 10000,
                    draggable: false,
                    title: this.point.title(),
                    icon: divIcon,
                    riseOnHover: true
                });
                this.pointLayer.addLayer(this.pointMarkerHL);
            }
            return this;
        },
        pointHighlightDestroy: function () {
            if (this.pointMarkerHL) {
                this.pointLayer.removeLayer(this.pointMarkerHL);
                delete this.pointMarkerHL;
            }
            return this;
        },

        // Создает редактирующий маркер, если координаты точки есть, а если нет, то создает по клику на карте
        pointEditCreate: function () {
            this.pointEditDestroy();
            if (this.point) {
                if (this.point.geo()) {
                    this.pointEditMarkerCreate();
                }
                this.map.on('click', function (e) {
                    var geo = Utils.geo.geoToPrecision([e.latlng.lat, e.latlng.lng]);

                    this.point.geo(geo);

                    if (this.pointMarkerEdit) {
                        this.pointMarkerEdit.setLatLng(geo);
                    } else {
                        this.pointEditMarkerCreate();
                    }
                }, this);
            }
            return this;
        },
        pointEditDestroy: function () {
            this.pointEditMarkerDestroy();
            this.map.off('click');
            return this;
        },
        pointEditMarkerCreate: function () {
            var self = this;
            this.pointMarkerEdit = L.marker(this.point.geo(),
                {
                    draggable: true,
                    title: 'Точка съемки',
                    icon: L.icon({
                        iconSize: [26, 43],
                        iconAnchor: [13, 36],
                        iconUrl: '/img/map/pinEdit.png',
                        className: 'pointMarkerEdit'
                    })
                })
                .on('dragend', function () {
                    var latlng = Utils.geo.geoToPrecision(this.getLatLng());
                    self.point.geo([latlng.lat, latlng.lng]);
                })
                .addTo(this.pointLayer);
            return this;
        },
        pointEditMarkerDestroy: function () {
            if (this.pointMarkerEdit) {
                this.pointMarkerEdit.off('dragend');
                this.pointLayer.removeLayer(this.pointMarkerEdit);
                delete this.pointMarkerEdit;
            }
            return this;
        },

        setMapDefCenter: function (/*forceMoveEvent*/) {
            this.map.setView(this.mapDefCenter, Locations.current.z, false);
        },
        saveCenterZoom: function () {
            this.setLocalState();
        },
        zoomEndCheckLayer: function () {
            var limitZoom = this.layerActive().type.limitZoom;
            var maxAfter = this.layerActive().type.maxAfter;

            if (limitZoom !== undefined && maxAfter !== undefined && this.map.getZoom() > limitZoom) {
                var layers = maxAfter.split('.');
                window.setTimeout(_.bind(this.selectLayer, this, layers[0], layers[1]), 300);
            }
        },
        toggleLayers: function (/*vm, event*/) {
            this.layersOpen(!this.layersOpen());
        },
        getSysById: function (id) {
            return _.find(this.layers(), function (item) {
                return item.id === id;
            });
        },
        getTypeById: function (system, id) {
            return _.find(system.types(), function (item) {
                return item.id === id;
            });
        },
        showLink: function () {
            if (!this.linkShow()) {
                var center = Utils.geo.geoToPrecision(Utils.geo.latlngToArr(this.map.getCenter()));
                var layerActive = this.layerActive();

                setTimeout(function () {
                    this.$dom.find('.inputLink').focus().select();
                    document.addEventListener('click', this.showLinkBind);
                }.bind(this), 100);

                var years = statuses.years[this.type()];
                var y = '';

                if (this.yearLow > years.min) {
                    y += '&y=' + this.yearLow;
                }
                if (this.yearHigh < years.max) {
                    y += '&y2=' + this.yearHigh;
                }

                this.link(
                    location.host +
                    '?g=' + center.join(',') + '&z=' + this.map.getZoom() +
                    '&s=' + layerActive.sys.id + '&t=' + layerActive.type.id +
                    '&type=' + this.type() + y
                );
                this.map.on('zoomstart', this.hideLink, this); //Скрываем ссылку при начале зуммирования карты
                this.linkShow(true);
            } else {
                this.hideLink();
            }
        },
        hideLink: function () {
            if (this.linkShow()) {
                this.linkShow(false);
                this.removeShowLinkListener();
            }
        },
        removeShowLinkListener: function () {
            this.map.off('zoomstart', this.hideLink, this);
            document.removeEventListener('click', this.showLinkBind);
        },
        linkClick: function (data, evt) {
            var input = evt.target;
            if (input) {
                input.select();
            }
            evt.stopPropagation();
            return false;
        },
        selectLayer: function (sysId, typeId) {
            var layerActive = this.layerActive();
            var system;
            var type;
            var setLayer;

            if (layerActive.sys && layerActive.sys.id === sysId && layerActive.type.id === typeId) {
                return;
            }

            system = this.getSysById(sysId || defaults.sys) || this.getSysById(defaults.sys);
            type = this.getTypeById(system, typeId || defaults.type) || this.getTypeById(system, defaults.type);
            if (type === undefined) {
                // It is likely that required type does not exist in this
                // system, fallback to default system and type.
                system = this.getSysById(defaults.sys);
                type = this.getTypeById(system, defaults.type);
            }

            setLayer = function (type) {
                this.map.addLayer(type.obj);
                this.markerManager.layerChange();
                this.map.options.maxZoom = type.maxZoom;
                this.map.options.minZoom = type.minZoom || defaults.minZoom;
                if (this.navSliderVM && Utils.isType('function', this.navSliderVM.recalcZooms)) {
                    this.navSliderVM.recalcZooms(type.limitZoom || type.maxZoom, true);
                }
                // If curent map zoom is out of range of layer settings, adjust accordingly.
                let center = this.map.getCenter();
                if (type.limitZoom !== undefined && this.map.getZoom() > type.limitZoom) {
                    this.map.setView(center, type.limitZoom);
                } else if (this.map.getZoom() > type.maxZoom) {
                    this.map.setView(center, type.maxZoom);
                } else if (type.minZoom !== undefined && this.map.getZoom() < type.minZoom) {
                    this.map.setView(center, type.minZoom);
                }

                this.setLocalState();
            }.bind(this);

            if (layerActive.sys && layerActive.type) {
                layerActive.sys.selected(false);
                layerActive.type.selected(false);
                this.map.removeLayer(layerActive.type.obj);
            }

            system.selected(true);
            type.selected(true);
            this.layerActiveDesc(this.embedded ? system.desc : system.desc + ': ' + type.desc);
            this.layerActive({ sys: system, type: type });

            if (system.deps && !type.obj) {
                require([system.deps], function (Construct) {
                    type.obj = new Construct(type.params);
                    setLayer(type);
                    type = null;
                });
            } else {
                setLayer(type);
            }
        },
        onChange: function (callback, ctx) {
            this.changeSubscribers.push({callback: callback, ctx: ctx});
        },
        offChange: function (callback, ctx) {
            this.changeSubscribers = _.remove(this.changeSubscribers, {callback: callback, ctx: ctx});
        },
        getCenter: function () {
            return Utils.geo.latlngToArr(this.map.getCenter());
        },

        yearSliderRefresh: function () {
            var $slider = this.$dom.find('.yearSlider');
            $slider.slider('destroy');

            //P.window.square.unsubscribe();
            window.clearTimeout(this.yearRefreshMarkersTimeout);

            var type = this.type();

            this.setYears(
                Utils.getLocalStorage('map.year.' + type),
                Utils.getLocalStorage('map.year2.' + type)
            );

            $('.mapYearSelector').replaceWith(
                '<div class="mapYearSelector">' +
                '<div class="yearSlider"><div class="ui-slider-handle L"></div><div class="ui-slider-handle R"></div></div>' +
                '<div class="yearOuter L"></div><div class="yearOuter R"></div>' +
                '</div>'
            );
            this.yearSliderCreate();
        },
        yearSliderCreate: function () {
            var self = this;
            var years = statuses.years[this.type()];
            var yearLowOrigin = years.min;
            var yearHighOrigin = years.max;
            var yearsDelta = yearHighOrigin - yearLowOrigin;
            var $slider = this.$dom.find('.yearSlider');
            var sliderStep = $slider.width() / yearsDelta;
            var slideOuterL = this.$dom.find('.yearOuter.L')[0];
            var slideOuterR = this.$dom.find('.yearOuter.R')[0];
            var handleL = $slider[0].querySelector('.ui-slider-handle.L');
            var handleR = $slider[0].querySelector('.ui-slider-handle.R');
            var currMin;
            var currMax;
            var culcSlider = function (min, max) {
                if (currMin !== min) {
                    slideOuterL.style.width = (sliderStep * Math.abs(min - yearLowOrigin) >> 0) + 'px';
                    currMin = min;
                    handleL.innerHTML = min || 1;
                }
                if (currMax !== max) {
                    slideOuterR.style.width = (sliderStep * Math.abs(yearHighOrigin - max) >> 0) + 'px';
                    currMax = max;
                    handleR.innerHTML = max || 1;
                }
            };

            $slider.slider({
                range: true,
                min: years.min,
                max: years.max,
                step: 1,
                values: [this.yearLow, this.yearHigh],
                create: function () {
                    var values = $slider.slider('values');
                    culcSlider(values[0], values[1]);
                },
                start: function () {
                    window.clearTimeout(self.yearRefreshMarkersTimeout);
                },
                slide: function (event, ui) {
                    culcSlider(ui.values[0], ui.values[1]);
                },
                change: function (event, ui) {
                    self.hideLink();
                    culcSlider(ui.values[0], ui.values[1]);
                    self.yearLow = currMin;
                    self.yearHigh = currMax;
                    self.yearRefreshMarkersTimeout = window.setTimeout(self.yearRefreshMarkersBind, 400);
                }
            });

            //Подписываемся на изменение размеров окна для пересчета шага и позиций покрывал
            this.subscriptions.sizeSlider = P.window.square.subscribe(function () {
                var values = $slider.slider('values');

                sliderStep = $slider.width() / yearsDelta;
                slideOuterL.style.width = (sliderStep * Math.abs(values[0] - yearLowOrigin) >> 0) + 'px';
                slideOuterR.style.width = (sliderStep * Math.abs(yearHighOrigin - values[1]) >> 0) + 'px';
            });
        },
        yearRefreshMarkers: function () {
            this.markerManager.setYearLimits(this.yearLow || 1, this.yearHigh || 1);
            this.setLocalState();
            this.notifySubscribers();
        }
    });
});
