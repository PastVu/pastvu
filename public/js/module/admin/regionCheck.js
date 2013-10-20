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

	var $request,
		popupTpl = doT.template(
			"<table border='0', cellspacing='5', cellpadding='0'><tbody>" +
				"<tr><td colspan='2' style='text-align: center;'>{{=it.geo}}<hr></td></tr>" +
				"<tr><td style='vertical-align: top;'><i>Short:</i></td><td style='width:190px;'><strong>{{=it.sc}};</strong><br>{{=it.s1}};<br><small>{{=it.s2}}</small></td></tr>" +
				"<tr><td style='vertical-align: top;'><i>Long:</i></td><td style='width:190px;'><strong>{{=it.lc}};</strong><br>{{=it.l1}};<br><small>{{=it.l2}}</small></td></tr>" +
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

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			this.map = new L.map(this.$dom.find('.map')[0], {center: [55.751667, 37.617778], zoom: 6, minZoom: 3, maxZoom: 16, trackResize: true});
			this.pointLayer = L.layerGroup();

			L.tileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {
				maxZoom: 16
			}).addTo(this.map);

			this.map.whenReady(function () {
				this.map
					.addLayer(this.pointLayer)
					.on('click', function (e) {
						var geo = [to6Precision(e.latlng.lat), to6Precision(e.latlng.lng)];

						if (this.marker) {
							this.marker.closePopup();
							this.marker.setLatLng(geo);
						} else {
							this.markerCreate(geo);
						}
						this.updateRegion(geo);
					}, this);
			}, this);

			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		markerCreate: function (geo) {
			this.marker = L.marker(geo, {draggable: true, title: 'Точка для проверки региона', icon: L.icon({iconSize: [26, 43], iconAnchor: [13, 36], popupAnchor: [0, -36], iconUrl: '/img/map/pinEdit.png', className: 'pointMarkerEdit'})})
				.on('dragstart', function () {
					this.marker.closePopup();
				}, this)
				.on('dragend', function () {
					var latlng = this.marker.getLatLng();
					this.updateRegion([to6Precision(latlng.lat), to6Precision(latlng.lng)]);
				}, this)
				.bindPopup(L.popup({maxWidth: 500, minWidth: 200, closeButton: false, offset: new L.Point(0, 60), autoPanPadding: new L.Point(5, 5)}))
				.addTo(this.pointLayer);
		},
		updateRegion: function (geo) {
			if ($request) {
				$request.abort();
				$request = null;
			}
			$request = $.ajax(
				'http://maps.googleapis.com/maps/api/geocode/json?latlng=' + geo[0] + ',' + geo[1] + '&language=en&sensor=true',
				{
					crossDomain: true,
					dataType: 'json',
					cache: false,
					context: this,
					error: function (jqXHR, textStatus, errorThrown) {
						console.warn(textStatus, errorThrown);
						this.marker.setPopupContent('<div style="text-align: center;">' + geo[0] + ' ; ' + geo[1] + '<br>' + textStatus + '</div>').openPopup();
					},
					success: function (result, textStatus, jqXHR) {
						if (result && Array.isArray(result.results)) {
							var txt,
								level2 = {},
								level1 = {},
								country = {},
								i = result.results.length;

							if (result.status === 'OK') {
								txt = '<div style="text-align: center;">' + geo[0] + ' ; ' + geo[1] + '<br>' + 'Strange. Can\'t find administration levels' + '</div>';

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
								txt = popupTpl({
									geo: geo[0] + ' ; ' + geo[1],
									s2: level2.short_name, s1: level1.short_name, sc: country.short_name,
									l2: level2.long_name, l1: level1.long_name, lc: country.long_name
								});
							} else {
								txt = '<div style="text-align: center;">' + geo[0] + ' ; ' + geo[1] + '<br>' + result.status + '</div>';
							}

							this.marker.setPopupContent(txt).openPopup();
						}
						console.dir(result);
					}
				}
			)
				.always(function () {
					$request = null;
				});

			this.getPastvuRegion(geo);
		},
		getPastvuRegion: function (geo, cb, ctx) {
			socket.once('takeRegionsByGeo', function (data) {
				var error = !data || !!data.error || !data.regions;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					console.dir(data.regions);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegionsByGeo', {geo: geo});
		}
	});
});