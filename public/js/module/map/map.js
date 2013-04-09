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
			embedded: undefined, // Режим встроенной карты
			editing: undefined, // Режим редактирования
			deferredWhenReady: undefined // Deffered witch will be resolved when map ready
		},
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);

			// Modes
			this.embedded = ko.observable(this.options.embedded);
			this.editing = ko.observable(this.options.editing);
			this.openNewTab = ko.observable(!this.embedded());

			// Map objects
			this.map = null;
			this.mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng);
			this.layers = ko.observableArray();
			this.layersOpen = ko.observable(false);
			this.layerActive = ko.observable({sys: null, type: null});
			this.layerActiveDesc = ko.observable('');

			this.markerManager = null;
			this.point = null; // Фотография для выделения
			this.pointLayer = L.layerGroup();

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
							obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {updateWhenIdle: false, maxZoom: 19}),
							maxZoom: 19,
							limitZoom: 18,
							maxAfter: 'google.scheme'
						},
						{
							id: 'mapnik',
							desc: 'Mapnik',
							selected: ko.observable(false),
							obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {updateWhenIdle: false, maxZoom: 19}),
							maxZoom: 19,
							limitZoom: 18,
							maxAfter: 'google.scheme'
						},
						{
							id: 'mapquest',
							desc: 'Mapquest',
							selected: ko.observable(false),
							obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {updateWhenIdle: false, maxZoom: 20}),
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
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
							maxZoom: 16,
							limitZoom: 15,
							maxAfter: 'google.scheme'
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
							maxZoom: 18,
							limitZoom: 17,
							maxAfter: 'yandex.pub'
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
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						},
						{
							id: 'pubhyb',
							desc: 'Народный гибрид',
							selected: ko.observable(false),
							params: 'publicMapHybrid',
							maxZoom: 20,
							limitZoom: 19,
							maxAfter: 'google.scheme'
						}
					])
				});
			}

			ko.applyBindings(globalVM, this.$dom[0]);

			// Subscriptions
			this.subscriptions.edit = this.editing.subscribe(this.editHandler, this);
			this.subscriptions.openNewTab = this.openNewTab.subscribe(function (val) {
				if (this.markerManager) {
					this.markerManager.openNewTab = val;
				}
			}, this);

			this.show();
		},
		show: function () {
			this.$container.fadeIn(400, function () {

				this.map = new L.neoMap(this.$dom.find('.map')[0], {center: this.mapDefCenter, zoom: this.embedded() ? 18 : Locations.current.z, minZoom: 3, zoomAnimation: L.Map.prototype.options.zoomAnimation && true, trackResize: false});

				// Создаем менеджер маркеров.
				// В случае встроенной карты делаем его не активным (enabled: false), и ждем от контроллера фотографии получения статуса редактирования
				this.markerManager = new MarkerManager(this.map, {openNewTab: this.openNewTab(), enabled: !this.embedded(), embedded: this.embedded()});

				Locations.subscribe(function (val) {
					this.mapDefCenter = new L.LatLng(val.lat, val.lng);
					this.setMapDefCenter(true);
				}.bind(this));

				//Самостоятельно обновляем размеры карты
				P.window.square.subscribe(_.debounce(function (newVal) {
					this.map._onResize();
				}.bind(this), 300));

				this.map.whenReady(function () {
					this.selectLayer('osm', 'osmosnimki');
					if (this.options.deferredWhenReady && Utils.isType('function', this.options.deferredWhenReady.resolve)) {
						this.options.deferredWhenReady.resolve();
					}

					if (this.embedded()) {
						this.map.addLayer(this.pointLayer);
					}

					this.map.on('zoomend', function () {
						var maxAfter = this.layerActive().type.maxAfter,
							layers;
						if (this.layerActive().type.limitZoom !== undefined && maxAfter !== undefined && this.map.getZoom() > this.layerActive().type.limitZoom) {
							layers = maxAfter.split('.');
							if (this.layerActive().sys.id === 'osm') {
								this.layerActive().type.obj.on('load', function (evt) {
									this.selectLayer(layers[0], layers[1]);
								}, this);
							} else {
								window.setTimeout(_.bind(this.selectLayer, this, layers[0], layers[1]), 500);
							}

						}
					}, this);
				}, this);

				renderer(
					[
						{module: 'm/map/navSlider', container: '.mapNavigation', options: {map: this.map, canOpen: !this.embedded()}, ctx: this, callback: function (vm) {
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
			this.pointEditDestroy();
			this.map = null;
			destroy.call(this);
		},

		// Обработчик переключения режима редактирования
		editHandler: function (edit) {
			if (edit) {
				this.markerManager.disable();
				this.pointHighlightDestroy();
				this.pointEditCreate();
			} else {
				this.markerManager.enable();
				this.pointEditDestroy();
				this.pointHighlightCreate();
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

		pointHighlightCreate: function () {
			if (this.point && this.pointMarkerHL === undefined) {
				var divIcon = L.divIcon(
					{
						className: 'photoIcon highlight ' + 'y' + this.point.year() + ' ' + this.point.dir(),
						iconSize: new L.Point(8, 8)
					}
				);
				this.pointMarkerHL = L.marker(this.point.geo(), {zIndexOffset: 10000, draggable: false, title: this.point.title(), icon: divIcon, riseOnHover: true});
				this.pointLayer.addLayer(this.pointMarkerHL);
			}
			return this;
		},
		pointHighlightDestroy: function () {
			if (this.pointMarkerHL !== undefined) {
				this.pointLayer.removeLayer(this.pointMarkerHL);
				delete this.pointMarkerHL;
			}
		},

		// Создает маркер для редактирования установленной точки
		pointEditCreate: function () {
			if (this.point && this.pointMarkerEdit === undefined) {
				this.pointMarkerEdit = L.marker(this.point.geo(), {draggable: true, title: 'Shooting point', icon: L.icon({iconSize: [26, 43], iconAnchor: [13, 36], iconUrl: '/img/map/pinEdit.png', className: 'pointMarkerEdit'})});
				this.pointLayer.addLayer(this.pointMarkerEdit);
				this.pointMarkerEdit.on('dragend', function () {
					this.update();
					var latlng = this.getLatLng();
					console.log(_.pick(latlng, 'lng', 'lat'));
				});
				this.map.on('click', function (e) {
					this.pointMarkerEdit.setLatLng(Utils.geo.geoToPrecision(e.latlng));
				}, this);
			}
			return this;
		},
		// Уничтожает маркер редактирования
		pointEditDestroy: function () {
			if (this.pointMarkerEdit !== undefined) {
				this.map.off('click');
				this.pointMarkerEdit.off('dragend');
				this.pointLayer.removeLayer(this.pointMarkerEdit);
				delete this.pointMarkerEdit;
			}
			return this;
		},

		setPoint: function (photo) {
			var geo = photo.geo();
			this.point = photo;
			if (this.editing() && this.pointMarkerEdit) {
				this.pointMarkerEdit.setLatLng(geo);
			}
			if (!this.editing() && this.pointMarkerHL) {
				this.pointHighlightDestroy();
				this.pointHighlightCreate();
			}
			if (geo[0] || geo[1]) {
				this.map.panTo(geo);
			}
			return this;
		},
		getPointGeo: function () {
			var latlng = Utils.geo.geoToPrecision(this.pointMarkerEdit.getLatLng());
			return [latlng.lat, latlng.lng];
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
					this.markerManager.layerChange();
					this.map.options.maxZoom = type.maxZoom;
					if (this.navSliderVM && Utils.isType('function', this.navSliderVM.recalcZooms)) {
						this.navSliderVM.recalcZooms();
					}
					if (type.limitZoom !== undefined && this.map.getZoom() > type.limitZoom) {
						this.map.setZoom(type.limitZoom);
					} else if (this.map.getZoom() > type.maxZoom) {
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
						if (layerActive.sys.id === 'osm') {
							layerActive.type.obj.off('load');
						}
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