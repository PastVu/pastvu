/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define([
    'underscore', 'Browser', 'Utils', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'renderer',
    'model/User', 'model/storage', 'Locations', 'leaflet', 'leaflet-extends/L.neoMap', 'm/map/marker',
    'm/photo/status', 'text!tpl/map/map.pug', 'css!style/map/map', 'jquery-ui/draggable', 'jquery-ui/slider',
    'jquery-ui/effect-highlight', 'css!style/jquery/ui/core', 'css!style/jquery/ui/theme', 'css!style/jquery/ui/slider',
    'css!style/jquery/ui/tooltip',
], function (_, Browser, Utils, P, ko, Cliche, globalVM, renderer, User, storage, Locations, L, Map, MarkerManager, statuses, pug) {
    'use strict';

    const defaults = {
        sys: 'yandex',
        type: 'scheme',
        minZoom: 3,
        maxZoom: 18,
        zoom: 17,
        geolocationZoom: 12,
    };

    const geoStatus = {
        READY: 'ready',
        PENDING: 'pending',
        ERROR: 'error',
        DENIED: 'denied',
    };

    return Cliche.extend({
        pug: pug,
        options: {
            isPainting: undefined,
            embedded: undefined, // Режим встроенной карты
            editing: undefined, // Режим редактирования
            point: undefined,
            center: undefined,
        },
        create: function () {
            const self = this;
            const qParams = globalVM.router.params();
            const qType = Number(qParams.type);

            this.destroy = _.wrap(this.destroy, this.localDestroy);

            // Promise which will be resolved when map ready
            this.readyPromise = new Promise(function (resolve) {
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
                        const geo = this.point.geo();

                        return _.isEmpty(geo) ? '' : geo.join(',');
                    },
                    write: function (value) {
                        const geo = this.point.geo();
                        let inputGeo;

                        if (_.isEmpty(value)) {
                            this.delPointGeo();
                        } else {
                            inputGeo = Utils.geo.parseCoordinates(value);

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
                    owner: this,
                });
            }

            const type = this.type();

            this.setYears(
                !this.embedded && (Number(qParams.y) || Utils.getLocalStorage('map.year.' + type)),
                !this.embedded && (Number(qParams.y2) || Utils.getLocalStorage('map.year2.' + type))
            );

            this.yearRefreshMarkersBind = this.yearRefreshMarkers.bind(this);
            this.yearRefreshMarkersTimeout = null;

            // Geolocation
            this.geolocationStatus = ko.observable(geoStatus.READY);

            if ('permissions' in navigator) {
                navigator.permissions.query({ name: 'geolocation' }).then(result => {
                    if (result.state === 'denied') {
                        // Use of geolocation is already denied for this site.
                        this.geolocationStatus(geoStatus.DENIED);
                    }
                });
            }

            this.layers.push({
                id: 'osm',
                desc: 'OSM',
                selected: ko.observable(false),
                types: ko.observableArray([

                    /* Define map types (layers).
                     *
                     * For fixed max zoom: specify maxZoom in TileLayer. It
                     * will be possible to zoom map up to maxZoom value.
                     *
                     * For "overzoom", set maxNativeZoom and maxZoom in
                     * TileLayer. It will be possible to zoom map up to
                     * maxZoom value. Layer will be "stretched" if current
                     * zoom is above maxNativeZoom.
                     *
                     * For switching layer, set maxNativeZoom and maxZoom in
                     * TileLayer type object. Set limitZoom in type object. It
                     * will be possible to zoom map up to maxZoom value.  When
                     * current zoom > limitZoom, map will switch to maxAfter
                     * layer, keeping current zoom value. maxAfter value
                     * format is "<sys id>.<type id>", e.g. 'osm.mapnik'.
                     */
                    {
                        id: 'osmosnimki',
                        desc: 'Kosmosnimki',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://{s}tilecart.kosmosnimki.ru/kosmo/{z}/{x}/{y}.png',
                            attribution: '&copy; <a href="https://kosmosnimki.ru/">ScanEx</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                            updateWhenIdle: false,
                            maxZoom: 18,
                            maxNativeZoom: 17,
                        },
                        limitZoom: 17,
                        maxAfter: 'osm.mapnik',
                    },
                    {
                        id: 'mapnik_de',
                        desc: 'Mapnik De',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
                            updateWhenIdle: false,
                            maxZoom: 19,
                            maxNativeZoom: 18,
                            attribution: 'OSM Deutsch | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        },
                        limitZoom: 18,
                        maxAfter: 'osm.mapnik',
                    },
                    {
                        id: 'mapnik_fr',
                        desc: 'Mapnik Fr',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
                            updateWhenIdle: false,
                            maxZoom: 19,
                            maxNativeZoom: 18,
                            attribution: 'OSM Française | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        },
                        limitZoom: 18,
                        maxAfter: 'osm.mapnik',
                    },
                    {
                        id: 'opentopomap',
                        desc: 'Topographer',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                            updateWhenIdle: false,
                            maxZoom: 18,
                            maxNativeZoom: 17,
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
                        },
                        limitZoom: 17,
                        maxAfter: 'osm.mapnik',
                    },
                    {
                        id: 'stamen_bw',
                        desc: 'Stamen b/w',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.{ext}',
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>',
                            subdomains: 'abcd',
                            maxZoom: 19,
                            maxNativeZoom: 18,
                            ext: 'png',
                            updateWhenIdle: false,
                        },
                    },
                ]),
            });

            if (P.settings.USE_GOOGLE_API()) {
                this.layers.push({
                    id: 'google',
                    desc: 'Google',
                    deps: 'leaflet-extends/L.Google',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Scheme',
                            selected: ko.observable(false),
                            options: {
                                type: 'roadmap',
                                maxZoom: 21,
                            },
                        },
                        {
                            id: 'sat',
                            desc: 'Satellite',
                            selected: ko.observable(false),
                            options: {
                                type: 'satellite',
                                maxZoom: 21,
                            },
                        },
                        {
                            id: 'hyb',
                            desc: 'Hybrid',
                            selected: ko.observable(false),
                            options: {
                                type: 'hybrid',
                                maxZoom: 21,
                            },
                        },
                        {
                            id: 'land',
                            desc: 'Terrain',
                            selected: ko.observable(false),
                            options: {
                                type: 'terrain',
                                maxZoom: 21,
                            },
                        },
                    ]),
                });
            }

            if (P.settings.USE_YANDEX_API()) {
                this.layers.push({
                    id: 'yandex',
                    desc: 'Yandex',
                    deps: 'leaflet-extends/L.Yandex',
                    selected: ko.observable(false),
                    types: ko.observableArray([
                        {
                            id: 'scheme',
                            desc: 'Scheme',
                            selected: ko.observable(false),
                            options: {
                                type: 'map',
                                maxZoom: 21,
                            },
                        },
                        {
                            id: 'sat',
                            desc: 'Satellite',
                            selected: ko.observable(false),
                            options: {
                                type: 'satellite',
                                maxZoom: 19,
                            },
                        },
                        {
                            id: 'hyb',
                            desc: 'Hybrid',
                            selected: ko.observable(false),
                            options: {
                                type: 'hybrid',
                                maxZoom: 19,
                            },
                        },
                    ]),
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
                        options: {
                            urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                            attribution: '&copy; Esri &mdash; Sources: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                            updateWhenIdle: false,
                            maxZoom: 20,
                            maxNativeZoom: 19,
                        },
                    },
                    {
                        id: 'mtb',
                        desc: 'MTB',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png',
                            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="http://mtbmap.cz/">mtbmap.cz</a>',
                            updateWhenIdle: false,
                            maxZoom: 19,
                            maxNativeZoom: 18,
                        },
                        limitZoom: 18,
                        maxAfter: 'osm.mapnik',
                    },
                    {
                        id: 'warfly',
                        desc: 'WWII Aerial',
                        selected: ko.observable(false),
                        options: {
                            urlTemplate: 'https://17200.selcdn.ru/AerialWWII/Z{z}/{y}/{x}.jpg',
                            attribution: 'WWII Aerial photos <a href="http://warfly.ru/about">warfly.ru</a> (coverage is limited to some locations)',
                            updateWhenIdle: false,
                            minZoom: 9,
                            maxZoom: 19,
                            maxNativeZoom: 17,
                        },
                    },
                ]),
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
            const layerActive = this.layerActive();

            Utils.setLocalStorage(this.embedded ? 'map.embedded.opennew' : 'map.opennew', this.openNewTab());
            Utils.setLocalStorage(this.embedded ? 'map.embedded.sys' : 'map.sys', layerActive.sys.id);
            Utils.setLocalStorage(this.embedded ? 'map.embedded.type' : 'map.type', layerActive.type.id);

            if (!this.embedded) {
                Utils.setLocalStorage('map.isPainting', this.isPainting());
                Utils.setLocalStorage('map.center', Utils.geo.latlngToArr(this.map.getCenter()));
                Utils.setLocalStorage('map.zoom', this.map.getZoom());

                const type = this.type();
                const years = statuses.years[this.type()];

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
            const type = this.type();
            const years = statuses.years[type] || statuses.years[statuses.type.PHOTO];

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
            const data = this.getStatusData();

            this.changeSubscribers.forEach(function (item) {
                item.callback.call(item.ctx, data);
            }, this);
        },
        getStatusData: function () {
            return {
                isPainting: this.isPainting(),
                year: this.yearLow, year2: this.yearHigh,
                center: this.getCenter(),
            };
        },

        show: function () {
            let region;
            let center;
            let bbox;
            let fitBounds;
            const qParams = globalVM.router.params();
            const zoom = Number(qParams.z) || (this.embedded ? defaults.zoom : Utils.getLocalStorage('map.zoom') || Locations.current.z);
            const system = qParams.s || Utils.getLocalStorage(this.embedded ? 'map.embedded.sys' : 'map.sys') || defaults.sys;
            const type = qParams.t || Utils.getLocalStorage(this.embedded ? 'map.embedded.type' : 'map.type') || defaults.type;

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
                                    [bbox[3], bbox[2]],
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
                zoomControl: false, // Remove default zoom control (we use our own)
                tap: false, // TODO: Prevent double click in Safari, remove when Leaflet/Leaflet#7255 is addressed.
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
                year2: this.yearHigh,
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
                            maxZoom: defaults.maxZoom,
                            minZoom: defaults.minZoom,
                            canOpen: !this.embedded,
                        },
                        ctx: this,
                        callback: function (vm) {
                            this.childModules[vm.id] = vm;
                            this.navSliderVM = vm;

                            // When slider is ready, update its limits (if
                            // layer is loaded already, if not selectLayer
                            // will update them).
                            if (this.map.getMaxZoom() !== Infinity) {
                                this.navSliderVM.recalcZooms(this.map.getMaxZoom(), true);
                            }
                        }.bind(this),
                    },
                ],
                {
                    parent: this,
                    level: this.level + 1,
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
            const geo = point.geo();
            let bbox;
            let zoom;
            const region = _.last(point.regions());

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
                            [bbox[3], bbox[2]],
                        ], false);
                    }
                }

                this.map.setView([region.center()[1], region.center()[0]], zoom || this.map.getZoom());
            }

            return this;
        },
        geoInputBlur: function (vm, evt) {
            let geo = this.point.geo();
            const $inputGeo = $(evt.target);
            const inputGeo = $inputGeo.val();

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
                const divIcon = L.divIcon({
                    className: 'photoIcon highlight ' + 'y' + this.point.year() + ' ' + this.point.dir(),
                    iconSize: new L.Point(8, 8),
                });

                this.pointMarkerHL = L.marker(this.point.geo(), {
                    zIndexOffset: 10000,
                    draggable: false,
                    title: this.point.title(),
                    icon: divIcon,
                    riseOnHover: true,
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
                    const geo = Utils.geo.geoToPrecision([e.latlng.lat, e.latlng.lng]);

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
            const self = this;

            this.pointMarkerEdit = L.marker(this.point.geo(),
                {
                    draggable: true,
                    title: 'Точка съемки',
                    icon: L.icon({
                        iconSize: [26, 43],
                        iconAnchor: [13, 36],
                        iconUrl: '/img/map/pinEdit.png',
                        className: 'pointMarkerEdit',
                    }),
                })
                .on('dragend', function () {
                    const latlng = Utils.geo.geoToPrecision(this.getLatLng());

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
            const limitZoom = this.layerActive().type.limitZoom;
            const maxAfter = this.layerActive().type.maxAfter;

            if (limitZoom !== undefined && maxAfter !== undefined && this.map.getZoom() > limitZoom) {
                const layers = maxAfter.split('.');

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
                const center = Utils.geo.geoToPrecision(Utils.geo.latlngToArr(this.map.getCenter()));
                const layerActive = this.layerActive();

                setTimeout(function () {
                    this.$dom.find('.inputLink').focus().select();
                    document.addEventListener('click', this.showLinkBind);
                }.bind(this), 100);

                const years = statuses.years[this.type()];
                let y = '';

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
            const input = evt.target;

            if (input) {
                input.select();
            }

            evt.stopPropagation();

            return false;
        },
        isGeolocationSupported: function () {
            return !!('geolocation' in navigator);
        },
        showMyLocation: function () {
            // Geolocate current position. Query position even if we know
            // that user denied it already, in Chrome for example this will show
            // location icon in status bar, making easier to find
            // where to change this setting. Don't query if there is a pending
            // request already.
            if (this.geolocationStatus() !== geoStatus.PENDING) {
                this.geolocationStatus(geoStatus.PENDING);

                const success = function (position) {
                    this.geolocationStatus(geoStatus.READY);
                    this.map.setView(new L.LatLng(position.coords.latitude, position.coords.longitude),
                        defaults.geolocationZoom, { animate: true });
                }.bind(this);

                const error = function error(err) {
                    if (err.code === err.PERMISSION_DENIED) {
                        // User denied geolocation.
                        this.geolocationStatus(geoStatus.DENIED);
                    } else {
                        // Position unavilable due to timeout or device internal error.
                        this.geolocationStatus(geoStatus.ERROR);
                    }

                    console.warn(`Geolocation error: ${err.message}`);
                }.bind(this);

                navigator.geolocation.getCurrentPosition(success, error, { maximumAge: 30000, timeout: 10000 });
            }
        },
        copyGeo: function (data, evt) {
            if (this.point.geo()) {
                // Temporaly hide custom tooltip so it does not overlap flashing one.
                const tooltip = $(evt.currentTarget).siblings('.tltp').hide();

                Utils.copyTextToClipboard(this.geoInputComputed());
                Utils.flashTooltip(evt.currentTarget, 'Copied').then(function () {
                    tooltip.show();
                });
            }
        },
        selectLayer: function (sysId, typeId) {
            const layerActive = this.layerActive();
            let system;
            let type;

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

            const setLayer = function (type) {
                this.map.addLayer(type.obj);
                this.markerManager.layerChange();
                // Set maxZoom and minZoom as defined in TileLayer object, otherwise use defaults.
                this.map.options.maxZoom = type.obj.options.maxZoom || defaults.maxZoom;
                this.map.options.minZoom = type.obj.options.minZoom || defaults.minZoom;

                if (this.navSliderVM && Utils.isType('function', this.navSliderVM.recalcZooms)) {
                    // Adjust zoom slider.
                    this.navSliderVM.recalcZooms(type.limitZoom || this.map.getMaxZoom(), true);
                }

                // If curent map zoom is out of range of layer settings, adjust accordingly.
                const center = this.map.getCenter();

                if (type.limitZoom !== undefined && this.map.getZoom() > type.limitZoom) {
                    this.map.setView(center, type.limitZoom);
                } else if (this.map.getZoom() > this.map.getMaxZoom()) {
                    this.map.setView(center, this.map.getMaxZoom());
                } else if (this.map.getZoom() < this.map.getMinZoom()) {
                    this.map.setView(center, this.map.getMinZoom());
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

            if (system.deps && !type.options.urlTemplate) {
                // Layer needs to be created via plugin.
                require([system.deps], function (Construct) {
                    type.options = type.options || {};
                    type.obj = new Construct(type.options);
                    setLayer(type);
                });
            } else if (type.options.urlTemplate !== undefined) {
                // Layer needs to be created using L.TileLayer.
                const urlTemplate = type.options.urlTemplate;
                const options = _.omit(type.options, 'urlTemplate');

                type.obj = new L.TileLayer(urlTemplate, options);
                setLayer(type);
            } else {
                throw new Error(`Layer '${type.id}' definition is missing urlTemplate required property.`);
            }
        },
        onChange: function (callback, ctx) {
            this.changeSubscribers.push({ callback: callback, ctx: ctx });
        },
        offChange: function (callback, ctx) {
            this.changeSubscribers = _.remove(this.changeSubscribers, { callback: callback, ctx: ctx });
        },
        getCenter: function () {
            return Utils.geo.latlngToArr(this.map.getCenter());
        },

        yearSliderRefresh: function () {
            const $slider = this.$dom.find('.yearSlider');

            $slider.slider('destroy');

            //P.window.square.unsubscribe();
            window.clearTimeout(this.yearRefreshMarkersTimeout);

            const type = this.type();

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
            const self = this;
            const years = statuses.years[this.type()];
            const yearLowOrigin = years.min;
            const yearHighOrigin = years.max;
            const yearsDelta = yearHighOrigin - yearLowOrigin;
            const $slider = this.$dom.find('.yearSlider');
            let sliderStep = $slider.width() / yearsDelta;
            const slideOuterL = this.$dom.find('.yearOuter.L')[0];
            const slideOuterR = this.$dom.find('.yearOuter.R')[0];
            const handleL = $slider[0].querySelector('.ui-slider-handle.L');
            const handleR = $slider[0].querySelector('.ui-slider-handle.R');
            let currMin;
            let currMax;
            const culcSlider = function (min, max) {
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
                    const values = $slider.slider('values');

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
                },
            });

            //Подписываемся на изменение размеров окна для пересчета шага и позиций покрывал
            this.subscriptions.sizeSlider = P.window.square.subscribe(function () {
                const values = $slider.slider('values');

                sliderStep = $slider.width() / yearsDelta;
                slideOuterL.style.width = (sliderStep * Math.abs(values[0] - yearLowOrigin) >> 0) + 'px';
                slideOuterR.style.width = (sliderStep * Math.abs(yearHighOrigin - values[1]) >> 0) + 'px';
            });
        },
        yearRefreshMarkers: function () {
            this.markerManager.setYearLimits(this.yearLow || 1, this.yearHigh || 1);
            this.setLocalState();
            this.notifySubscribers();
        },
    });
});
