/*global define:true*/

/**
 * Модель создания/редактирования новости
 */
define([
	'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'leaflet', 'lib/doT',
	'text!tpl/admin/regionCheck.jade', 'css!style/admin/regionCheck', 'css!style/leaflet'
], function (_, $, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, L, doT, jade) {
	'use strict';

	var $requestGoogle,
		popupLoadingTpl = doT.template(
			"<table style='text-align: center', border='0', cellspacing='5', cellpadding='0'><tbody>" +
				"<tr><td style='width: 200px;'>{{=it.geo}}<hr style='margin: 2px 0 5px;'></td></tr>" +
				"<tr><td><img src='/img/misc/load.gif' style='width: 67px; height: 10px'/></td></tr>" +
				"</tbody></table>"
		),
		popupTpl = doT.template(
			"<table style='text-align: center;', border='0', cellspacing='5', cellpadding='0'><tbody>" +
				"<tr><td colspan='2'>{{=it.geo}}<hr style='margin: 2px 0 5px;'></td></tr>" +
				"<tr style='font-weight: bold;'><td style='min-width:150px;'>PastVu</td><td style='min-width:150px;'>Google</td></tr>" +
				"<tr><td style='vertical-align: top;'>" +
				"{{~it.parr :value:index}}<a target='_blank' href='/admin/region/{{=value.cid}}'>{{=value.title_en}}</a><br>{{~}}" +
				"</td><td style='vertical-align: top;'>" +
				"{{~it.garr :value:index}}{{=value}}<br>{{~}}" +
				"</td></tr>" +
				"</tbody></table>"
		);

	function to6Precision(number) {
		return ~~(number * 1e+6) / 1e+6;
	}

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.regions = ko.observableArray();
			this.geo = null;
			this.link = ko.observable('');

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			var passedGeo = globalVM.router.params().geo;
			if (passedGeo) {
				passedGeo = passedGeo.split(',').map(function(element){
					return parseFloat(element);
				});
				if (!Utils.geoCheck(passedGeo)) {
					passedGeo = null;
				}
			}

			this.map = new L.map(this.$dom.find('.map')[0], {center: passedGeo || [55.751667, 37.617778], zoom: 6, minZoom: 3, maxZoom: 16, trackResize: true});
			this.pointLayer = L.layerGroup();

			L.tileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {
				maxZoom: 16
			}).addTo(this.map);

			this.map.whenReady(function () {
				this.map
					.addLayer(this.pointLayer)
					.on('click', function (e) {
						var geo = [to6Precision(e.latlng.lat), to6Precision(e.latlng.lng)];
						this.goToGeo(geo);
					}, this);

				if (Utils.geoCheck(passedGeo)) {
					this.goToGeo(passedGeo);
				}
			}, this);

			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			this.updateRegionAbort();
			socket.removeAllListeners('takeRegionsByGeo');
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		inputEnter: function (data, event) {
			if (event.keyCode === 13) {
				this.inputGeo();
			}
			return true;
		},
		inputGeo: function (data, event) {
			var val = this.$dom.find('input.inputGeo').val(),
				geo = val.split(',').map(function(element){
					return parseFloat(element);
				});

			if (Utils.geoCheck(geo)) {
				this.map.panTo(geo);
				this.goToGeo(geo);
			} else {
				window.noty({text: 'Неверный формат', type: 'error', layout: 'center', timeout: 1000, force: true});
			}
		},
		goToGeo: function (geo) {
			if (this.marker) {
				this.marker.closePopup();
				this.marker.setLatLng(geo);
			} else {
				this.markerCreate(geo);
			}
			this.updateRegion(geo);
		},
		markerCreate: function (geo) {
			this.marker = L.marker(geo, {draggable: true, title: 'Точка для проверки региона', icon: L.icon({iconSize: [26, 43], iconAnchor: [13, 36], popupAnchor: [0, -36], iconUrl: '/img/map/pinEdit.png', className: 'pointMarkerEdit'})})
				.on('dragstart', function () {
					this.updateRegionAbort();
					this.marker.closePopup();
					this.link('');
				}, this)
				.on('dragend', function () {
					var latlng = this.marker.getLatLng();
					this.updateRegion([to6Precision(latlng.lat), to6Precision(latlng.lng)]);
				}, this)
				.bindPopup(L.popup({maxWidth: 500, minWidth: 200, closeButton: false, offset: new L.Point(0, 60), autoPanPadding: new L.Point(5, 5)}))
				.addTo(this.pointLayer);
		},
		updateRegionAbort: function () {
			if (this.ownRegionsDeffered) {
				this.ownRegionsDeffered.reject();
				this.ownRegionsDeffered = null;
			}
			if (this.googRegionsDeffered) {
				this.googRegionsDeffered.reject();
				this.googRegionsDeffered = null;
			}
			if ($requestGoogle) {
				$requestGoogle.abort();
				$requestGoogle = null;
			}
		},
		updateRegion: function (geo) {
			//Если уже ожидаются запросы - отменяем их
			this.updateRegionAbort();

			var tplObj = {
				geo: geo[0] + ' , ' + geo[1],
				parr: [],
				garr: []
			};

			//Сразу показываем маркер загрузки регионов
			this.marker.setPopupContent(popupLoadingTpl({geo: tplObj.geo})).openPopup();
			this.link('?geo=' + geo[0] + ',' + geo[1]);
			this.geo = geo;

			//Так как $.when дожидается исполнения обоих событий только если они оба успешные
			//(если какой-то fail, то when выстрелит сразу и один раз),
			//то надо создать свои deffered, которые резолвить по окончанию обоих запросов (независимо от их итогового статуса),
			//а в случае повторного запроса реджектить.
			//Тогда нижележащий $.when.done выстрелит гарантированно по окончанию обоих запросов
			//и не выстрелит, если мы сами их отменим
			this.ownRegionsDeffered = new $.Deferred();
			this.googRegionsDeffered = new $.Deferred();
			this.ownRegionsDeffered.always(function () {
				this.ownRegionsDeffered = null;
			}.bind(this));
			this.googRegionsDeffered.always(function () {
				this.googRegionsDeffered = null;
			}.bind(this));
			$.when(this.ownRegionsDeffered, this.googRegionsDeffered)
				.done(function () {
					this.marker.setPopupContent(popupTpl(tplObj)).openPopup();
				}.bind(this));

			//Запрашиваем собственные регионы
			this.getPastvuRegion(geo, function (err, data) {
				if (err) {
					tplObj.parr.push(data.message);
				} else {
					tplObj.parr = data.regions.reverse();
				}
				if (this.ownRegionsDeffered) {
					this.ownRegionsDeffered.resolve();
				}
			}, this);

			//Запрашиваем регионы Google
			$requestGoogle = $.ajax(
				'http://maps.googleapis.com/maps/api/geocode/json?latlng=' + geo[0] + ',' + geo[1] + '&language=en&sensor=true',
				{
					crossDomain: true,
					dataType: 'json',
					cache: false,
					context: this
				}
			);
			$requestGoogle
				.fail(function (jqXHR, textStatus, errorThrown) {
					console.warn(textStatus, errorThrown);
					tplObj.garr.push(textStatus);
				})
				.done(function (result, textStatus, jqXHR) {
					if (result && Array.isArray(result.results)) {
						var level2 = {},
							level1 = {},
							country = {},
							i = result.results.length;

						if (result.status === 'OK') {
							while (i--) {
								if (Array.isArray(result.results[i].types)) {
									if (~result.results[i].types.indexOf('country')) {
										country = result.results[i].address_components[0];
									}
									if (~result.results[i].types.indexOf('administrative_area_level_1')) {
										level1 = result.results[i].address_components[0];
									}
									if (~result.results[i].types.indexOf('administrative_area_level_2')) {
										level2 = result.results[i].address_components[0];
									}
								}
							}
							if (country.long_name) {
								tplObj.garr.push(country.long_name);
							}
							if (level1.long_name) {
								tplObj.garr.push(level1.long_name);
							}
							/*
							 if (level2.long_name) {
							 tplObj.garr.push(level2.long_name);
							 }*/
						} else {
							tplObj.garr.push(result.status);
						}

					}
				})
				.always(function () {
					if (this.googRegionsDeffered) {
						this.googRegionsDeffered.resolve();
					}
					$requestGoogle = null;
				});
		},
		getPastvuRegion: function (geo, cb, ctx) {
			//Отменяем возможно существующий прошлый обработчик, так как в нем замкнут неактуальный cb
			socket.removeAllListeners('takeRegionsByGeo');
			//Устанавливаем on, а не once, чтобы он срабатывал всегда, в том числе и на последнем обработчике, который нам и нужен
			socket.on('takeRegionsByGeo', function (data) {
				//Если вернулись данные для другой(прошлой) точки, то выходи
				if (data && (!Array.isArray(data.geo) || data.geo[0] !== this.geo[0] || data.geo[1] !== this.geo[1])) {
					return;
				}

				var error = !data || !!data.error || !data.regions;
				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, error, data);
				}
			}.bind(this));
			socket.emit('giveRegionsByGeo', {geo: geo});
		}
	});
});