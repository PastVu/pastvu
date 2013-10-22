/*global define:true*/

/**
 * Модель создания/редактирования новости
 */
define([
	'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'leaflet', 'model/storage',
	'text!tpl/admin/region.jade', 'css!style/admin/region', 'css!style/leaflet'
], function (_, $, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, L, storage, jade) {
	'use strict';

	var regionDef = {
		cid: 0,
		parents: [],
		geo: '',
		title_en: '',
		title_local: ''
	};

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/common/auth'];
			this.createMode = ko.observable(true);

			this.showGeo = ko.observable(false);

			this.region = ko_mapping.fromJS(regionDef);
			this.haveParent = ko.observable('0');
			this.parentCid = ko.observable(0);
			this.childLenArr = ko.observableArray();
			this.geoStringOrigin = null;
			this.geoObj = null;

			this.map = null;
			this.layerSaved = null;

			this.mh = ko.observable('300px'); //Высота карты

			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
			this.routeHandler();
		},
		show: function (cb, ctx) {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			this.sizesCalc();
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		localDestroy: function (destroy) {
			this.map.remove();
			delete this.map;

			this.hide();
			destroy.call(this);
		},
		makeBinding: function () {
			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
				this.binded = true;
			}
		},
		//Пересчитывает размер карты
		sizesCalc: function () {
			var height = P.window.h() - this.$dom.find('.map').offset().top - 37 >> 0;

			this.mh(height + 'px');
			if (this.map) {
				this.map.whenReady(this.map._onResize, this.map); //Самостоятельно обновляем размеры карты
			}
		},
		routeHandler: function () {
			var cid = globalVM.router.params().cid;

			if (cid === 'create') {
				this.createMode(true);
				this.resetData();
				if (Number(globalVM.router.params().parent)) {
					this.parentCid(Number(globalVM.router.params().parent));
					this.haveParent('1');
				}
				this.createMap();
			} else {
				cid = Number(cid);
				if (!cid) {
					return globalVM.router.navigateToUrl('/admin/region');
				}
				this.createMode(false);
				this.getOneRegion(cid);
			}
		},
		resetData: function () {
			if (this.layerSaved) {
				this.map.removeLayer(this.layerSaved);
			}
			ko_mapping.fromJS(regionDef, this.region);
			this.haveParent('0');
			this.parentCid(0);
			this.childLenArr([]);
		},
		fillData: function (data) {
			var region = data.region;

			ko_mapping.fromJS(region, this.region);

			this.childLenArr(data.childLenArr || []);
			if (data.region.parents && data.region.parents.length) {
				this.parentCid(data.region.parents[data.region.parents.length - 1].cid);
				this.haveParent('1');
			} else {
				this.haveParent('0');
				this.parentCid(0);
			}

			if (region.geo) {
				this.geoStringOrigin = region.geo;
				try {
					this.geoObj = JSON.parse(region.geo);
				} catch (err) {
					window.noty({text: 'GeoJSON client parse error!', type: 'error', layout: 'center', timeout: 3000, force: true});
					this.geoStringOrigin = null;
					this.geoObj = null;
					return false;
				}
				this.drawData();
			}

			return true;
		},
		drawData: function () {
			var mapInit = !this.map;

			if (this.layerSaved) {
				this.map.removeLayer(this.layerSaved);
			}
			this.layerSaved = L.geoJson(this.geoObj, {
				style: {
					color: "#F00",
					weight: 3,
					opacity: 0.6,
					clickable: false
				}
			});

			this.createMap();
			this.map.whenReady(function () {
				if (!mapInit) {
					this.map.fitBounds(this.layerSaved.getBounds());
				}
				window.setTimeout(this.layerSaved.addTo.bind(this.layerSaved, this.map), mapInit ? 100 : 500); //Рисуем после анимации fitBounds
			}, this);
		},
		createMap: function () {
			//Bind и show должны вызываться перед созданием карты для правильно расчета её высоты
			this.makeBinding();

			if (this.map) {
				return;
			}

			this.map = new L.map(this.$dom.find('.map')[0], {center: [36, -25], zoom: 2, minZoom: 2, maxZoom: 15, trackResize: false});
			if (this.layerSaved) {
				//window.setTimeout(this.map.fitBounds.bind(this.map, this.layerSaved.getBounds()), 200); //В 0.6.4 бывает после создания карты fitBounds её подвешивает (#2085), поэтому вызываем пока в setTimeout
				this.map.fitBounds(this.layerSaved.getBounds());
			}
			L.tileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {maxZoom: 15}).addTo(this.map);
		},
		getOneRegion: function (cid, cb, ctx) {
			socket.once('takeRegion', function (data) {
				var error = !data || !!data.error || !data.region;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					error = !this.fillData(data);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegion', {cid: cid});
		},
		save: function () {
			var saveData = ko_mapping.toJS(this.region);

			if (!saveData.geo) {
				window.noty({text: 'GeoJSON обязателен!', type: 'error', layout: 'center', timeout: 2000, force: true});
				return false;
			}
			if (saveData.geo === this.geoStringOrigin) {
				delete saveData.geo;
			}

			if (!saveData.title_en) {
				window.noty({text: 'Нужно заполнить английское название', type: 'error', layout: 'center', timeout: 2000, force: true});
				return false;
			}

			if (this.haveParent() === '1') {
				saveData.parent = this.parentCid();
				if (!saveData.parent) {
					window.noty({text: 'Если уровень региона ниже Страны, необходимо указать номер родительского региона!', type: 'error', layout: 'center', timeout: 5000, force: true});
					return false;
				}
			}

			socket.once('saveRegionResult', function (data) {
				if (!data || data.error || !data.region) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					window.noty({text: 'Сохранено', type: 'success', layout: 'center', timeout: 1800, force: true});

					if (this.createMode()) {
						//Если регион успешно создан, но переходим на его cid, и через роутер он нарисуется
						globalVM.router.navigateToUrl('/admin/region/' + data.region.cid);
					} else {
						this.fillData(data);
					}
				}
			}.bind(this));
			socket.emit('saveRegion', saveData);
			return false;
		}
	});
});