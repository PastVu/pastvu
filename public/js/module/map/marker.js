/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
	'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'globalVM', 'leaflet', 'm/Photo', 'LMarkerCluster'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, globalVM, L, Photo) {
	'use strict';

	function MarkerManager(map, options) {
		this.map = map;

		this.photosAll = [];
		this.mapObjects = {photos: {}, clusters: {}};
		this.layerPhotos = L.layerGroup().addTo(this.map); // Слой фотографий
		this.layerClusters = L.layerGroup().addTo(this.map); // Слой кластеров

		this.firstClientWorkZoom = P.settings.FIRST_CLIENT_WORK_ZOOM();
		this.clientClusteringDelta = P.settings.CLUSTERING_ON_CLIENT_PIX_DELTA();


		this.objects = {};
		this.objectsNew = {};

		this.sizePoint = new L.Point(10, 10);
		this.sizeClusters = new L.Point(42, 42);
		this.sizeClusterm = new L.Point(52, 52);
		this.sizeCluster = new L.Point(62, 62);

		this.paneMarkers = this.map.getPanes().markerPane;
		this.calcBound = null;
		this.calcBoundPrev = null;
		this.currZoom = this.map.getZoom();
		this.refreshByZoomTimeout = null;
		this.refreshDataByZoomBind = this.refreshDataByZoom.bind(this);

		this.animationOn = false;

		this.panePopup = this.map.getPanes().popupPane;
		this.popup = new L.Popup({maxWidth: 119, minWidth: 119, offset: new L.Point(0, -14), autoPan: false, zoomAnimation: false, closeButton: false});
		this.popupTempl = _.template('<img class="popupImg" src="${ img }"/><div class="popupCap">${ txt }</div>');
		this.popupOpened = false;

		this.markerToPopup = null;
		this.popupMarkerBind = this.popupMarker.bind(this);
		this.popupMarkerTimout = this.popupMarker.bind(this);

		this.openNewTab = options.openNewTab;
		globalVM.pb.subscribe('/map/openNewTab', function (bool) {
			var ahrefs = _.toArray(this.paneMarkers.querySelectorAll('a.photoA')),
				i = ahrefs.length,
				target = bool ? '_blank' : '_self';

			while (i) {
				ahrefs[--i].setAttribute("target", target);
			}
			this.openNewTab = bool;
		}.bind(this));

		//Events
		this.map
			.on('zoomstart', this.onZoomStart, this)
			.on('moveend', this.onMapMoveEnd, this);

		this.reCalcBound();
		this.refreshDataByZoom(true, true);
	}

	/**
	 * Обновляет границы области отображения маркеров.
	 * Если расчитанная ранее область включает текущую, обновление не происходит.
	 * @param {?boolean=} force Принудительный пересчет области. Например, при изменении масштаба в +, текущая область будет содержаться в предыдущей, тем не менее пересчет нужен.
	 * @return {boolean} Флаг того, что границы изменились.
	 */
	MarkerManager.prototype.reCalcBound = function (force) {
		//TODO: Изменяться баунд должен по шагам сетки кластеров
		var result = false;
		if (force || !this.calcBound || !this.calcBound.contains(this.map.getBounds())) {
			this.calcBoundPrev = this.calcBound;
			this.calcBound = this.map.getBounds().pad(0.2);
			result = true;
		}
		return result;
	};

	/**
	 * Вызывается по событию начала изменения масштаба карты
	 */
	MarkerManager.prototype.onZoomStart = function (opt) {
		window.clearTimeout(this.refreshByZoomTimeout);
	};

	/**
	 * Вызывается по событию изменения базового слоя карты
	 * Определяет, активна ли анимация изменения масштаба для данного слоя или нет
	 */
	MarkerManager.prototype.layerChange = function () {
		if (this.map.options.zoomAnimation && this.map.options.markerZoomAnimation) {
			if (!this.animationOn) {
				this.paneMarkers.classList.add('neo-animate');
				this.animationOn = true;
			}
		} else if (this.animationOn) {
			this.paneMarkers.classList.remove('neo-animate');
			this.animationOn = false;
		}
	};

	/**
	 * Вызывается по событию завершения движения карты - перемещения или изменения масштаба
	 * При изменении масштаба отсрачиваем обновление данных, т.к. масштаб может меняться многократно за короткий промежуток времени
	 */
	MarkerManager.prototype.onMapMoveEnd = function () {
		window.clearTimeout(this.refreshByZoomTimeout);
		if (this.currZoom !== this.map.getZoom()) {
			this.refreshByZoomTimeout = window.setTimeout(this.refreshDataByZoomBind, 400);
		} else {
			if (this.reCalcBound()) {
				this.refreshDataByMove();
			}
		}
	};

	/**
	 * Обновление данных маркеров по зуму.
	 */
	MarkerManager.prototype.refreshDataByZoom = function (init) {
		this.reCalcBound(true);
		this.startPendingAt = Date.now();

		var newZoom = this.map.getZoom(),
			crossingClientWorkZoom = (this.currZoom < this.firstClientWorkZoom && newZoom >= this.firstClientWorkZoom) || (this.currZoom >= this.firstClientWorkZoom && newZoom < this.firstClientWorkZoom),
			bound = L.latLngBounds(this.calcBound.getSouthWest(), this.calcBound.getNorthEast()),
			bounds,
			pollServer = true,
			curr,
			i;

		i = 4;
		while (i--) {
			if (this['b' + i]) {
				this.map.removeLayer(this['b' + i]);
				this['b' + i] = null;
			}
		}

		if (!init && this.currZoom >= this.firstClientWorkZoom && newZoom >= this.firstClientWorkZoom) {
			// Если на клиенте уже есть все фотографии для данного зума
			if (newZoom > this.currZoom) {
				// Если новый зум больше предыдущего, то просто отбрасываем объекты, не попадающие в новый баунд
				pollServer = false;
				this.layerClusters.clearLayers();
				this.cropByBound(null, P.settings.CLUSTERING_ON_CLIENT(), false);
				this.processIncomingDataZoom({photos: this.photosAll}, false, P.settings.CLUSTERING_ON_CLIENT(), false);
			} else {
				// Если новый зум меньше, то определяем четыре новых баунда, и запрашиваем объекты только для них
				bounds = this.boundSubtraction(bound, this.calcBoundPrev);

				//Визуализация полученных баундов
				i = bounds.length;
				while (i) {
					curr = _.clone(bounds[--i]);
					curr[0].reverse();
					curr[1].reverse();
					this['b' + i] = L.polygon([
						[curr[1][0], curr[0][1]],
						curr[1],
						[curr[0][0], curr[1][1]],
						curr[0]
					], {color: '#00C629', weight: 1}).addTo(this.map);
				}
			}
		} else {
			// Запрашиваем объекты полностью для нового баунда
			bounds = [
				[Utils.geo.latlngToArr(bound.getSouthWest(), true), Utils.geo.latlngToArr(bound.getNorthEast(), true)]
			];
		}

		if (pollServer) {
			socket.once('getBoundsResult', function (data) {
				var needClientClustering, // Смотрим нужно ли использовать клиентскую кластеризацию
					boundChanged; // Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд

				if (data && !data.error) {
					// Данные устарели и должны быть отброшены, если уже был отправлен другой запрос на данные по зуму или текущий зум не равен запрашиваемомоу или текущий баунд уже успел выйти за пределы запрашиваемого
					if (this.startPendingAt !== data.startAt || newZoom !== this.currZoom || !bound.intersects(this.calcBound)) {
						console.log('Полученные данные нового зума устарели');
						return;
					}

					needClientClustering = P.settings.CLUSTERING_ON_CLIENT() && this.currZoom >= this.firstClientWorkZoom;
					boundChanged = !bound.equals(this.calcBound);

					this.layerClusters.clearLayers();
					this.processIncomingDataZoom(data, boundChanged, needClientClustering, crossingClientWorkZoom, true);
				} else {
					console.log('Ошибка загрузки новых камер: ' + data.message);
				}
				newZoom = bound = null;
				this.startPendingAt = undefined;
			}.bind(this));
			socket.emit('getBounds', {z: newZoom, bounds: bounds, startAt: this.startPendingAt});
		}

		this.currZoom = newZoom;
	};

	/**
	 * Обрабатывает входящие данные по зуму
	 */
	MarkerManager.prototype.redraw = function (data) {

	};

	/**
	 * Обрабатывает входящие данные по зуму
	 */
	MarkerManager.prototype.processIncomingDataZoom = function (data, boundChanged, localCluster, crossingClientWorkZoom, concatArr) {
		var photos = {},
			clusters = {},
			markers = [],
			divIcon,
			curr,
			existing,
			i;

		if (localCluster) {
			if (concatArr) {
				this.photosAll = this.photosAll.concat(data.photos);
			} else {
				this.photosAll = data.photos;
			}
			data = this.localClustering(this.photosAll);
		}

		// Заполняем новый объект фото
		i = data.photos.length;
		while (i) { // while loop, reversed
			curr = data.photos[--i];
			existing = this.mapObjects.photos[curr.cid];
			if (existing !== undefined) {
				// Если такое фото уже есть, то просто записываем его в новый объект
				photos[curr.cid] = existing;
				this.mapObjects.photos[curr.cid] = undefined;
			} else {
				// Если оно новое - создаем его объект и маркер
				curr.geo.reverse();
				if (!boundChanged || this.calcBound.contains(curr.geo)) {
					photos[curr.cid] = Photo.factory(curr, 'mapdot', 'midi');
					divIcon = L.divIcon(
						{
							className: 'photoIcon ' + curr.dir,
							iconSize: this.sizePoint,
							html: '<a target="' + (this.openNewTab ? '_blank' : '_self') + '" class="photoA" href="/p/' + curr.cid + '"></a>'
						}
					);
					curr.marker =
						L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr}})
							.on('click', this.clickMarker, this)
							.on('mouseover', this.overMarker, this);
					this.layerPhotos.addLayer(curr.marker);
				}
			}
		}

		// В текущем объекте остались только фото на удаление
		for (i in this.mapObjects.photos) {
			if (this.mapObjects.photos[i] !== undefined) {
				this.layerPhotos.removeLayer(this.mapObjects.photos[i].marker);
			}
		}


		// Создаем маркеры для кластеров
		if (Array.isArray(data.clusters) && data.clusters.length > 0) {
			i = data.clusters.length;
			while (i) {
				curr = data.clusters[--i];
				curr.geo.reverse();
				if (!boundChanged || this.calcBound.contains(curr.geo)) {
					clusters[i] = Photo.factory(curr, 'mapclust');
					divIcon = L.divIcon({className: 'clusterIcon fringe2 show', iconSize: this['sizeCluster' + curr.measure], html: '<img class="clusterImg" onload="this.parentNode.classList.add(\'show\')" src="' + curr.sfile + '"/><div class="clusterCount">' + curr.c + '</div>'});
					curr.marker =
						L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: 'cl' + i, type: 'clust', obj: curr, c: curr.c}})
							.on('click', this.clickMarker, this);
					this.layerClusters.addLayer(curr.marker);
				}
			}
		}

		this.mapObjects.photos = photos;
		this.mapObjects.clusters = clusters;

		//Чистим ссылки
		photos = clusters = markers = curr = existing = data = null;
	};

	/**
	 * Обновление данных маркеров.
	 * @param {?boolean=} reposExisting Пересчитывать позиции существующих маркеров. Например, при изменении масштаба надо пересчитывать.
	 */
	MarkerManager.prototype.refreshDataByMove = function (reposExisting) {
		var zoom = this.currZoom,
			bound = L.latLngBounds(this.calcBound.getSouthWest(), this.calcBound.getNorthEast()),
			bounds,
			curr,
			i;

		//Удаляем маркеры, не входящие в новый баунд
		this.cropByBound(null, false, true);

		//Считаем новые баунды для запроса
		bounds = this.boundSubtraction(bound, this.calcBoundPrev);

		//Визуализация полученных баундов
		i = 4;
		while (i--) {
			if (this['b' + i]) {
				this.map.removeLayer(this['b' + i]);
				this['b' + i] = null;
			}
		}
		i = bounds.length;
		while (i) {
			curr = _.clone(bounds[--i]);
			curr[0].reverse();
			curr[1].reverse();
			this['b' + i] = L.polygon([
				[curr[1][0], curr[0][1]],
				curr[1],
				[curr[0][0], curr[1][1]],
				curr[0]
			], {color: '#00C629', weight: 1}).addTo(this.map);
		}

		socket.once('getBoundsResult', function (data) {
			var needClientClustering, // Смотрим нужно ли использовать клиентскую кластеризацию
				boundChanged; // Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд

			if (data && !data.error) {
				// Данные устарели и должны быть отброшены, если текущий зум не равен запрашиваемомоу или текущий баунд уже успел выйти за пределы запрашиваемого
				if (zoom !== this.currZoom || !bound.intersects(this.calcBound)) {
					console.log('Полученные данные перемещения устарели');
					return;
				}

				needClientClustering = (this.currZoom !== this.map.getMaxZoom()) && P.settings.CLUSTERING_ON_CLIENT().indexOf(this.currZoom) > -1;
				boundChanged = !bound.equals(this.calcBound);

				if (needClientClustering) {
					this.processIncomingDataMove(data, boundChanged);
				} else {
					this.processIncomingDataMove(data, boundChanged);
				}
			} else {
				console.log('Ошибка загрузки новых камер: ' + data.message);
			}
			zoom = bound = null;
		}.bind(this));
		socket.emit('getBounds', {z: zoom, bounds: bounds});
	};

	/**
	 * Обрабатывает входящие данные
	 */
	MarkerManager.prototype.processIncomingDataMove = function (data, boundChanged) {
		var photos = {},
			clusters = {},
			divIcon,
			curr,
			i;

		// Заполняем новый объект фото
		if (Array.isArray(data.photos) && data.photos.length > 0) {
			i = data.photos.length;
			while (i) {
				curr = data.photos[--i];
				if (!this.mapObjects.photos[curr.cid]) {
					curr.geo.reverse();
					// Если оно новое - создаем его объект и маркер
					if (!boundChanged || this.calcBound.contains(curr.geo)) {
						photos[curr.cid] = Photo.factory(curr, 'mapdot', 'midi');
						divIcon = L.divIcon({className: 'photoIcon ' + curr.dir, iconSize: this.sizePoint});
						curr.marker = L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr}});
						this.layerPhotos.addLayer(curr.marker);
					}
				}
			}
		}
		_.assign(this.mapObjects.photos, photos);


		// Создаем маркеры для кластеров
		if (Array.isArray(data.clusters) && data.clusters.length > 0) {
			i = data.clusters.length;
			while (i) {
				curr = data.clusters[--i];
				curr.geo.reverse();
				if (!boundChanged || this.calcBound.contains(curr.geo)) {
					clusters[i] = Photo.factory(curr, 'mapclust');
					divIcon = L.divIcon({className: 'clusterIcon fringe2', iconSize: this['sizeCluster' + curr.measure], html: '<img class="clusterImg" onload="this.parentNode.classList.add(\'show\')" src="' + curr.sfile + '"/><div class="clusterCount">' + curr.c + '</div>'});
					curr.marker = L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: 'cl' + i, type: 'clust', obj: curr, c: curr.c}});
					this.layerClusters.addLayer(curr.marker);
				}
			}
		}
		_.assign(this.mapObjects.clusters, clusters); // Сливаем группы в основной объект кластеров this.mapObjects.clusters

		//Чистим ссылки
		photos = clusters = curr = data = null;
	};


	/**
	 * Локальная кластеризация камер, пришедших клиенту. Проверяем на совпадение координат камер с учетом дельты. Связываем такие камеры
	 */
	MarkerManager.prototype.localClustering = function (data, keepPhotoList) {
		var start = Date.now(),
			deltaLng = Math.abs(this.map.layerPointToLatLng(new L.Point(this.clientClusteringDelta, 1)).lng - this.map.layerPointToLatLng(new L.Point(0, 1)).lng),
			deltaLat = Math.abs(this.map.layerPointToLatLng(new L.Point(1, this.clientClusteringDelta)).lat - this.map.layerPointToLatLng(new L.Point(1, 0)).lat),
			cutLng = deltaLng.toPrecision(1).length - 3,
			cutLat = deltaLat.toPrecision(1).length - 3,
			result = {photos: [], clusters: []},
			i,
			keys,
			photo,
			currCoordId = '',
			cluster,
			clusters = {};

		i = data.length;
		while (i) {
			photo = data[--i];
			currCoordId = photo.geo[1].toFixed(cutLat) + photo.geo[0].toFixed(cutLng);
			if (clusters[currCoordId] === undefined) {
				clusters[currCoordId] = {lats: 0, lngs: 0, c: 0, photos: []};
			}
			cluster = clusters[currCoordId];
			cluster.c += 1;
			cluster.lats += photo.geo[1];
			cluster.lngs += photo.geo[0];
			cluster.photos.push(photo);
		}

		// Заполняем массивы кластеров и фото
		keys = Object.keys(clusters);
		i = keys.length;
		while (i) {
			cluster = clusters[keys[--i]];
			if (cluster.c > 1) {
				result.clusters.push(
					{
						c: cluster.c,
						geo: [Utils.math.toPrecision(cluster.lngs / cluster.c), Utils.math.toPrecision(cluster.lats / cluster.c)],
						file: cluster.photos[0].file,
						photos: cluster.photos
					}
				);
			} else {
				result.photos.push(cluster.photos[0]);
			}
		}

		console.log('Clustered in ' + (Date.now() - start));
		return result;
	};

	/**
	 * Вычитает один баунд из другого
	 * @param minuend Уменьшаемый
	 * @param subtrahend Вычитаемый
	 * @return {Array} Массив баундов разницы вычитания
	 */
	MarkerManager.prototype.boundSubtraction = function (minuend, subtrahend) {
		var a = {west: minuend._southWest.lng, north: minuend._northEast.lat, east: minuend._northEast.lng, south: minuend._southWest.lat},
			b = {west: subtrahend._southWest.lng, north: subtrahend._northEast.lat, east: subtrahend._northEast.lng, south: subtrahend._southWest.lat},
			c = [],
			result = [],
			curr,
			i;


		if (minuend.contains(subtrahend)) {
			// Если вычитаемый баунд полностью включается в уменьшаемый, то будет от 2 до 4 результатов
			if (a.north > b.north) {
				c[0] = {north: a.north, south: b.north, east: a.east, west: a.west};
			}
			if (a.south < b.south) {
				c[1] = {north: b.south, south: a.south, east: a.east, west: a.west};
			}
			if (a.east > b.east) {
				c[2] = {west: b.east, east: a.east, north: b.north, south: b.south};
			}
			if (a.west < b.west) {
				c[3] = {west: a.west, east: b.west, north: b.north, south: b.south};
			}

		} else {
			// Если вычитаемый баунд пересекается с уменьшаемым, то будет от 1 до 2 результатов
			// or https://github.com/netshade/spatial_query polygon = sq.polygon([[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]]).subtract_2d([[a.west, a.north], [a.east, a.north], [a.east, a.south], [a.west, a.south]]).to_point_array();
			// or https://github.com/tschaub/geoscript-js
			// or https://github.com/bjornharrtell/jsts
			if (a.east > b.east) {
				c[1] = {west: b.east, east: a.east};
			} else if (a.east < b.east) {
				c[1] = {west: a.west, east: b.west};
			}
			if (b.north !== a.north) {
				c[0] = {west: a.west, east: a.east};

				if (a.north > b.north) {
					c[0].north = a.north;
					c[0].south = b.north;

					if (c[1]) {
						c[1].north = b.north;
						c[1].south = a.south;
					}
				} else {
					c[0].north = b.south;
					c[0].south = a.south;

					if (c[1]) {
						c[1].north = a.north;
						c[1].south = b.south;
					}
				}
			}
		}
		c = _.flatten(c, true);


		i = c.length;
		while (i) {
			curr = c[--i];
			result[i] = [
				[curr.west, curr.south],
				[curr.east, curr.north]
			];
		}

		return result;
	};

	/**
	 * Удаляет объекты не входящие в баунд
	 */
	MarkerManager.prototype.cropByBound = function (bound, localCluster, alsoCropClusters) {
		bound = bound || this.calcBound;
		var i,
			curr,
			arr;

		if (localCluster) {
			arr = [];
			i = this.photosAll.length;
			while (i) {
				curr = this.photosAll[--i];
				if (bound.contains(curr.geo)) {
					arr.push(curr);
					this.mapObjects.photos[curr.cid] = undefined;
				}
			}
			this.photosAll = arr;
		} else {
			arr = this.mapObjects.photos.keys();
			i = arr.length;
			while (i) {
				curr = this.mapObjects.photos[arr[--i]];
				if (bound.contains(curr.geo)) {
					this.layerPhotos.removeLayer(curr.marker);
					this.mapObjects.photos[curr.cid] = undefined;
				}
			}
		}

		if (alsoCropClusters) {
			arr = this.mapObjects.clusters.keys();
			i = arr.length;
			while (i) {
				curr = this.mapObjects.clusters[arr[--i]];
				if (bound.contains(curr.geo)) {
					this.layerClusters.removeLayer(curr.marker);
					this.mapObjects.clusters[curr.cid] = undefined;
				}
			}
		}

		i = curr = arr = null;
	};

	/**
	 * @param evt
	 */
	MarkerManager.prototype.clickMarker = function (evt) {
		if (evt.target.options.data.type === 'photo') {

		} else if (evt.target.options.data.type === 'clust') {
			this.map.setView(evt.target.getLatLng(), this.map.getZoom() + 1);
		}
	};

	MarkerManager.prototype.overMarker = function (evt) {
		window.clearTimeout(this.popupMarkerTimout);
		this.popupMarkerTimout = window.setTimeout(this.popupMarkerBind, 200);
		this.markerToPopup = evt.target.on('mouseout', this.outMarker, this);
	};
	MarkerManager.prototype.popupMarker = function () {
		if (this.markerToPopup) {
			this.popup
				.setLatLng(this.markerToPopup.getLatLng())
				.setContent(this.popupTempl({img: this.markerToPopup.options.data.obj.sfile || '', txt: this.markerToPopup.options.data.obj.title || ''}));
			this.map.openPopup(this.popup);
		}
	};
	MarkerManager.prototype.outMarker = function (evt) {
		this.map.closePopup();
		this.markerToPopup = null;
		window.clearTimeout(this.popupMarkerTimout);
		evt.target.off('mouseout', this.outMarker, this);
	};

	return MarkerManager;
});