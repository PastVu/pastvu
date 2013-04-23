/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
	'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'globalVM', 'leaflet', 'm/Photo'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, globalVM, L, Photo) {
	'use strict';

	function MarkerManager(map, options) {
		var _this = this;

		this.map = map;

		this.openNewTab = options.openNewTab;
		this.embedded = options.embedded;

		this.photosAll = [];
		this.mapObjects = {photos: {}, clusters: {}};
		this.layerClusters = L.layerGroup(); // Слой кластеров
		this.layerPhotos = L.layerGroup(); // Слой фотографий

		this.firstClientWorkZoom = P.settings.FIRST_CLIENT_WORK_ZOOM();
		this.clientClustering = P.settings.CLUSTERING_ON_CLIENT();
		this.clientClusteringDelta = ko_mapping.toJS(P.settings.CLUSTERING_ON_CLIENT_PIX_DELTA);

		this.sizePoint = new L.Point(8, 8);
		this.sizeCluster = new L.Point(42, 42);
		this.sizeClusterm = new L.Point(52, 52);
		this.sizeClusterb = new L.Point(62, 62);


		this.sizeClusterL = new L.Point(12, 12);
		this.sizeClusterLm = new L.Point(16, 16);
		this.sizeClusterLb = new L.Point(18, 18);

		this.paneMarkers = this.map.getPanes().markerPane;
		this.calcBound = null;
		this.calcBoundPrev = null;
		this.currZoom = this.map.getZoom();
		this.zoomChanged = false;
		this.refreshByZoomTimeout = null;
		this.refreshDataByZoomBind = this.refreshDataByZoom.bind(this);
		this.visBound = false;

		this.animationOn = false;

		this.popupPhoto = new L.Popup({className: 'popupPhoto', minWidth: 151, maxWidth: 151, offset: new L.Point(0, -14), autoPan: false, zoomAnimation: false, closeButton: false});
		this.popupPhotoTpl = _.template('<img class="popupImg" src="${ img }"/><div class="popupCap">${ txt }</div><div class="popupYear">${ year }</div>');

		this.popupClusterPhoto = new L.Popup({className: 'popupClusterPhoto', minWidth: 70, maxWidth: 151, offset: new L.Point(0, -21), autoPan: false, zoomAnimation: false, closeButton: false});
		this.popupClusterPhotom = new L.Popup({className: 'popupClusterPhoto', minWidth: 70, maxWidth: 151, offset: new L.Point(0, -26), autoPan: false, zoomAnimation: false, closeButton: false});
		this.popupClusterPhotob = new L.Popup({className: 'popupClusterPhoto', minWidth: 70, maxWidth: 151, offset: new L.Point(0, -31), autoPan: false, zoomAnimation: false, closeButton: false});
		this.popupClusterPhotoTpl = _.template('<div class="popupCap">${ txt }</div><div class="popupYear">${ year }</div>');

		this.popupCluster = new L.Popup({className: 'popupCluster', minWidth: 151, maxWidth: 151, /*maxHeight: 223,*/ offset: new L.Point(0, -8), autoPan: true, autoPanPadding: new L.Point(10, 10), zoomAnimation: false, closeButton: false});
		this.popupClusterFive = new L.Popup({className: 'popupCluster five', minWidth: 247, maxWidth: 247, /* maxHeight: 277,*/ offset: new L.Point(0, -8), autoPan: true, autoPanPadding: new L.Point(10, 10), zoomAnimation: false, closeButton: false});
		this.popupClusterFiveScroll = new L.Popup({className: 'popupCluster five scroll', minWidth: 249, maxWidth: 249, /* maxHeight: 277,*/ offset: new L.Point(0, -8), autoPan: true, autoPanPadding: new L.Point(10, 10), zoomAnimation: false, closeButton: false});
		this.popupClusterClickFN = '_' + Utils.randomString(10);
		this.popupClusterOverFN = '_' + Utils.randomString(10);
		this.popupClusterTpl = _.template('<img alt="" class="popupImgPreview fringe2" ' +
			'onclick="' + this.popupClusterClickFN + '(this)" ' +
			'onmouseover="' + this.popupClusterOverFN + '(this)" ' +
			'src="${ img }" data-cid="${ cid }" data-sfile="${ sfile }" data-title="${ title }" data-href="${ href }" data-year="${ year }"/>'
		);
		window[this.popupClusterClickFN] = function (element) {
			var url = element.getAttribute('data-href');
			if (Utils.isType('string', url) && url.length > 0) {
				_this.photoNavigate(url);
			}
		};
		window[this.popupClusterOverFN] = function (element) {
			var root = element.parentNode.parentNode,
				div = root.querySelector('.popupPoster'),
				img = root.querySelector('.popupImg'),
				title = root.querySelector('.popupCap'),
				year = root.querySelector('.popupYear');

			div.setAttribute('data-href', element.getAttribute('data-href'));
			img.setAttribute('src', element.getAttribute('data-sfile'));
			title.innerHTML = element.getAttribute('data-title');
			year.innerHTML = element.getAttribute('data-year');
		};

		this.popupOpened = null;

		this.markerToPopup = null;
		this.popupPhotoOpenBind = this.popupPhotoOpen.bind(this);
		this.popupTimeout = null;

		this.enabled = false;
		if (options.enabled) {
			this.enable();
		}
	}

	MarkerManager.prototype.enable = function () {
		if (!this.enabled) {
			// Добавляем слои на карту
			this.map.addLayer(this.layerClusters).addLayer(this.layerPhotos);

			//Events ON
			this.map
				.on('zoomstart', this.onZoomStart, this)
				.on('moveend', this.onMapMoveEnd, this);

			// Запрашиваем данные
			this.refreshDataByZoom(true);
			this.enabled = true;
		}
		return this;
	};
	MarkerManager.prototype.disable = function () {
		if (this.enabled) {
			// Закрываем попапы и очищаем слои
			this.popupClose();
			this.clearClusters();
			this.clearPhotos();

			//Удаляем слои с карты
			this.map.removeLayer(this.layerClusters).removeLayer(this.layerPhotos);

			//Events OFF
			this.map
				.off('zoomstart', this.onZoomStart, this)
				.off('moveend', this.onMapMoveEnd, this);

			this.enabled = false;
		}
		return this;
	};
	MarkerManager.prototype.destroy = function () {
		this.disable();
		delete window[this.popupClusterClickFN];
		delete window[this.popupClusterOverFN];
		delete this.map;
	};

	/**
	 * Обновляет границы области отображения маркеров.
	 * Если расчитанная ранее область включает текущую, обновление не происходит.
	 * @param {?boolean=} force Принудительный пересчет области. Например, при изменении масштаба в +, текущая область будет содержаться в предыдущей, тем не менее пересчет нужен.
	 * @return {boolean} Флаг того, что границы изменились.
	 */
	MarkerManager.prototype.reCalcBound = function (force) {
		var result = false,
			localWork = this.map.getZoom() >= this.firstClientWorkZoom;
		if (force || !this.calcBound || !this.calcBound.contains(this.map.getBounds())) {
			this.calcBoundPrev = this.calcBound;
			this.calcBound = this.map.getBounds().pad(localWork ? 0.1 : 0.25);
			this.calcBound._northEast.lat = Utils.math.toPrecision(this.calcBound._northEast.lat);
			this.calcBound._northEast.lng = Utils.math.toPrecision(this.calcBound._northEast.lng);
			this.calcBound._southWest.lat = Utils.math.toPrecision(this.calcBound._southWest.lat);
			this.calcBound._southWest.lng = Utils.math.toPrecision(this.calcBound._southWest.lng);
			result = true;
		}
		return result;
	};

	/**
	 * Вызывается по событию изменения базового слоя карты
	 * Определяет, активна ли анимация изменения масштаба для данного слоя или нет
	 */
	MarkerManager.prototype.layerChange = function () {
		if (this.map.options.zoomAnimation && this.map.options.markerZoomAnimation) {
			if (!this.animationOn) {
				//this.paneMarkers.classList.add('neo-animate');
				this.animationOn = true;
			}
		} else if (this.animationOn) {
			//this.paneMarkers.classList.remove('neo-animate');
			this.animationOn = false;
		}
	};

	/**
	 * Задает новые временные рамки и вызывает обновление данных
	 */
	MarkerManager.prototype.setYearLimits = function (year, year2) {
		if (year !== this.year || year2 !== this.year2) {
			this.year = year || undefined;
			this.year2 = year2 || undefined;
			this.clearState();
			this.clearPhotos();
			this.refreshDataByZoom(true);
		}
	};

	/**
	 * Вызывается по событию начала изменения масштаба карты
	 */
	MarkerManager.prototype.clearState = function () {
		window.clearTimeout(this.refreshByZoomTimeout);
		this.popupClose();
		this.clearClusters();
	};

	/**
	 * Вызывается по событию начала изменения масштаба карты
	 */
	MarkerManager.prototype.onZoomStart = function () {
		this.clearState();
		this.zoomChanged = true;
	};

	/**
	 * Вызывается по событию завершения движения карты - перемещения или изменения масштаба
	 * При изменении масштаба отсрачиваем обновление данных, т.к. масштаб может меняться многократно за короткий промежуток времени
	 */
	MarkerManager.prototype.onMapMoveEnd = function () {
		if (this.zoomChanged && this.currZoom !== this.map.getZoom()) {
			if (this.currZoom >= this.firstClientWorkZoom && this.map.getZoom() >= this.firstClientWorkZoom) {
				this.refreshByZoomTimeout = window.setTimeout(this.refreshDataByZoomBind, 50);
			} else {
				this.refreshByZoomTimeout = window.setTimeout(this.refreshDataByZoomBind, 400);
			}
			this.zoomChanged = false;
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
			willLocalWork = newZoom >= this.firstClientWorkZoom,
			crossingLocalWorkZoom = (this.currZoom < this.firstClientWorkZoom && willLocalWork) || (this.currZoom >= this.firstClientWorkZoom && !willLocalWork),
			direction = newZoom > this.currZoom ? 'down' : 'up',
			bound = L.latLngBounds(this.calcBound.getSouthWest(), this.calcBound.getNorthEast()),
			bounds,
			pollServer = true,
			curr,
			i;

		this.currZoom = newZoom;

		if (!init && willLocalWork && !crossingLocalWorkZoom) {
			// Если на клиенте уже есть все фотографии для данного зума
			if (direction === 'down') {
				// Если новый зум больше предыдущего, то просто отбрасываем объекты, не попадающие в новый баунд
				// и пересчитываем кластеры
				pollServer = false;
				this.cropByBound(null, true);
				this.processIncomingDataZoom(null, false, true, this.clientClustering);
			} else {
				// Если новый зум меньше, то определяем четыре новых баунда, и запрашиваем объекты только для них
				bounds = this.boundSubtraction(bound, this.calcBoundPrev);
			}
		} else {
			// При пересечении границы "вверх" обнуляем массив всех фото на клиенте
			if (crossingLocalWorkZoom && !willLocalWork) {
				this.photosAll = [];
			}
			// Запрашиваем объекты полностью для нового баунда
			bounds = [
				[Utils.geo.latlngToArr(bound.getSouthWest()), Utils.geo.latlngToArr(bound.getNorthEast())]
			];
		}

		if (pollServer) {

			if (this.visBound) {
				//Визуализация баундов, по которым будет отправлен запрос к серверу
				i = 4;
				while (i--) {
					if (this['b' + i] !== undefined) {
						this.map.removeLayer(this['b' + i]);
						this['b' + i] = undefined;
					}
				}
				i = bounds.length;
				while (i) {
					curr = bounds[--i];
					this['b' + i] = L.rectangle(curr, {color: "#25CE00", weight: 1}).addTo(this.map);
				}
			}

			socket.once('getBoundsResult', function (data) {
				var localWork, // Находимся ли мы на уровне локальной работы
					localCluster, // Смотрим нужно ли использовать клиентскую кластеризацию
					boundChanged; // Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд

				if (data && !data.error) {
					// Данные устарели и должны быть отброшены, если уже был отправлен другой запрос на данные по зуму или текущий зум не равен запрашиваемомоу или текущий баунд уже успел выйти за пределы запрашиваемого
					if (this.startPendingAt !== data.startAt || newZoom !== this.currZoom || !bound.intersects(this.calcBound)) {
						console.log('Полученные данные нового зума устарели');
						return;
					}

					boundChanged = !bound.equals(this.calcBound);
					localWork = this.currZoom >= this.firstClientWorkZoom;
					localCluster = localWork && this.clientClustering;

					this.processIncomingDataZoom(data, boundChanged, localWork, localCluster);
				} else {
					console.log('Ошибка загрузки новых камер: ' + data.message);
				}
				newZoom = bound = null;
				this.startPendingAt = undefined;
			}.bind(this));
			socket.emit('getBounds', {z: newZoom, bounds: bounds, startAt: this.startPendingAt, year: this.year, year2: this.year2});
		}
	};

	/**
	 * Обрабатывает входящие данные по зуму
	 */
	MarkerManager.prototype.processIncomingDataZoom = function (data, boundChanged, localWork, localCluster) {
		var photos = {},
			divIcon,
			curr,
			existing,
			i;

		// На уровне локальной работы этот медот учавствует только в "поднятии" зума,
		// когда сервер отдает только фотографии "в рамке, обрамляющей предыдущий баунд", следовательно,
		// полученные фото мы должны присоединить к существующим и локально кластеризовать их объединение (т.к. изменился зум)
		if (localWork) {
			if (data) {
				this.photosAll = this.photosAll.concat(data.photos);
			}
			if (localCluster) {
				data = this.createClusters(this.photosAll, true);
			} else {
				data = {photos: this.photosAll};
			}
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
				if (!boundChanged || this.calcBound.contains(curr.geo)) {
					curr.sfile = Photo.picFormats.midi + curr.file;
					divIcon = L.divIcon(
						{
							className: 'photoIcon ' + 'y' + curr.year + ' ' + curr.dir,
							iconSize: this.sizePoint
						}
					);
					curr.marker =
						L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr}})
							.on('click', this.clickMarker, this)
							.on('mouseover', this.popupPhotoOver, this);
					this.layerPhotos.addLayer(curr.marker);
					photos[curr.cid] = curr;
				}
			}
		}

		// В текущем объекте остались только фото на удаление
		for (i in this.mapObjects.photos) {
			if (this.mapObjects.photos[i] !== undefined) {
				this.layerPhotos.removeLayer(this.mapObjects.photos[i].marker.clearAllEventListeners());
			}
		}
		this.mapObjects.photos = photos;


		// Создаем маркеры кластеров
		if (!localWork) {
			this.drawClusters(data.clusters, boundChanged);
		} else if (localCluster) {
			this.drawClustersLocal(data.clusters, boundChanged);
		}

		//Чистим ссылки
		photos = curr = existing = data = null;
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

		//Считаем новые баунды для запроса
		bounds = this.boundSubtraction(bound, this.calcBoundPrev);

		if (this.visBound) {
			//Визуализация баундов, по которым будет отправлен запрос к серверу
			i = 4;
			while (i--) {
				if (this['b' + i] !== undefined) {
					this.map.removeLayer(this['b' + i]);
					this['b' + i] = undefined;
				}
			}
			i = bounds.length;
			while (i) {
				curr = bounds[--i];
				this['b' + i] = L.rectangle(curr, {color: "#25CE00", weight: 1}).addTo(this.map);
			}
		}

		socket.once('getBoundsResult', function (data) {
			var localWork, // Находимся ли мы на уровне локальной работы
				localCluster, // Смотрим нужно ли использовать клиентскую кластеризацию
				boundChanged; // Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд

			if (data && !data.error) {
				// Данные устарели и должны быть отброшены, если текущий зум не равен запрашиваемомоу или текущий баунд уже успел выйти за пределы запрашиваемого
				if (zoom !== this.currZoom || !bound.intersects(this.calcBound)) {
					console.log('Полученные данные перемещения устарели');
					return;
				}

				localWork = this.currZoom >= this.firstClientWorkZoom;
				localCluster = localWork && this.clientClustering;
				boundChanged = !bound.equals(this.calcBound);

				//Удаляем маркеры и кластеры, не входящие в новый баунд после получения новой порции данных
				this.cropByBound(null, localWork);

				this.processIncomingDataMove(data, boundChanged, localWork, localCluster);
			} else {
				console.log('Ошибка загрузки новых камер: ' + data.message);
			}
			zoom = bound = null;
		}.bind(this));
		socket.emit('getBounds', {z: zoom, bounds: bounds, year: this.year, year2: this.year2});
	};

	/**
	 * Обрабатывает входящие данные
	 */
	MarkerManager.prototype.processIncomingDataMove = function (data, boundChanged, localWork, localCluster) {
		var photos = {},
			divIcon,
			curr,
			i;

		// На уровне локальных кластеризаций,
		// сервер отдает только фотографии в новых баундах, следовательно,
		// полученные фото мы должны присоединить к существующим и локально кластеризовать только их
		if (localWork) {
			this.photosAll = this.photosAll.concat(data.photos);
		}
		if (localCluster) {
			data = this.createClusters(data.photos, true);
		}

		// Заполняем новый объект фото
		if (Array.isArray(data.photos) && data.photos.length > 0) {
			i = data.photos.length;
			while (i) {
				curr = data.photos[--i];
				if (!this.mapObjects.photos[curr.cid]) {
					// Если оно новое - создаем его объект и маркер
					if (!boundChanged || this.calcBound.contains(curr.geo)) {
						curr.sfile = Photo.picFormats.midi + curr.file;
						divIcon = L.divIcon(
							{
								className: 'photoIcon ' + 'y' + curr.year + ' ' + curr.dir,
								iconSize: this.sizePoint
							}
						);
						curr.marker =
							L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr}})
								.on('click', this.clickMarker, this)
								.on('mouseover', this.popupPhotoOver, this);
						this.layerPhotos.addLayer(curr.marker);
						photos[curr.cid] = curr;
					}
				}
			}
		}
		_.assign(this.mapObjects.photos, photos);

		// Создаем маркеры кластеров
		if (!localWork) {
			this.drawClusters(data.clusters, boundChanged, true);
		} else if (localCluster) {
			this.drawClustersLocal(data.clusters, boundChanged, true);
		}

		//Чистим ссылки
		photos = curr = data = null;
	};


	/**
	 * Локальная кластеризация камер, пришедших клиенту. Проверяем на совпадение координат камер с учетом дельты. Связываем такие камеры
	 */
	MarkerManager.prototype.createClusters = function (data, withGravity) {
		var start = Date.now(),
			delta = this.clientClusteringDelta[this.currZoom] || this.clientClusteringDelta['default'],
			clusterW = Utils.math.toPrecision(Math.abs(this.map.layerPointToLatLng(new L.Point(delta, 1)).lng - this.map.layerPointToLatLng(new L.Point(0, 1)).lng)),
			clusterH = Utils.math.toPrecision(Math.abs(this.map.layerPointToLatLng(new L.Point(1, delta)).lat - this.map.layerPointToLatLng(new L.Point(1, 0)).lat)),
			clusterWHalf = Utils.math.toPrecision(clusterW / 2),
			clusterHHalf = Utils.math.toPrecision(clusterH / 2),
			result = {photos: [], clusters: []},
			i,

			photo,
			geoPhoto,
			geoPhotoCorrection,

			geo,
			cluster,
			clusters = {},
			clustCoordId,
			clustCoordIdS = [];

		i = data.length;
		while (i) {
			photo = data[--i];
			geoPhoto = photo.geo;
			geoPhotoCorrection = [geoPhoto[0] > 0 ? 1 : 0, geoPhoto[1] < 0 ? -1 : 0];

			geo = Utils.geo.geoToPrecision([clusterH * ((geoPhoto[0] / clusterH >> 0) + geoPhotoCorrection[0]), clusterW * ((geoPhoto[1] / clusterW >> 0) + geoPhotoCorrection[1])]);
			clustCoordId = geo[0] + '@' + geo[1];
			cluster = clusters[clustCoordId];
			if (cluster === undefined) {
				clusters[clustCoordId] = {cid: clustCoordId, geo: geo, lats: geo[0] - clusterHHalf, lngs: geo[1] + clusterWHalf, year: 0, c: 1, photos: []};
				clustCoordIdS.push(clustCoordId);
				cluster = clusters[clustCoordId];
			}
			cluster.c += 1;
			cluster.year += photo.year;
			if (withGravity) {
				cluster.lats += photo.geo[0];
				cluster.lngs += photo.geo[1];
			}
			cluster.photos.push(photo);
		}

		// Заполняем массивы кластеров и фото
		i = clustCoordIdS.length;
		while (i) {
			clustCoordId = clustCoordIdS[--i];
			cluster = clusters[clustCoordId];
			if (cluster.c > 2) {
				if (withGravity) {
					cluster.geo = [Utils.math.toPrecision(cluster.lats / cluster.c), Utils.math.toPrecision(cluster.lngs / cluster.c)];
				}
				cluster.c -= 1;
				cluster.year = (cluster.year / cluster.c) >> 0;
				cluster.lats = undefined;
				cluster.lngs = undefined;
				result.clusters.push(cluster);
			} else {
				result.photos.push(cluster.photos[0]);
			}
		}

		console.log('Clustered in ' + (Date.now() - start));
		return result;
	};

	MarkerManager.prototype.drawClusters = function (clusters, boundChanged, add) {
		var i,
			size,
			measure,
			picFormat,
			cluster,
			divIcon,
			result = {};

		if (Array.isArray(clusters) && clusters.length > 0) {
			i = clusters.length;
			while (i) {
				cluster = clusters[--i];
				if (!boundChanged || this.calcBound.contains(cluster.geo)) {
					cluster.cid = cluster.geo[0] + '@' + cluster.geo[1];
					if (cluster.c > 499) {
						if (cluster.c > 2999) {
							size = this.sizeClusterb;
							measure = 'b';
							picFormat = Photo.picFormats.micro;
						} else {
							size = this.sizeClusterm;
							measure = 'm';
							picFormat = Photo.picFormats.microm;
						}
					} else {
						size = this.sizeCluster;
						measure = '';
						picFormat = Photo.picFormats.micros;
					}
					cluster.p.sfile = picFormat + cluster.p.file;
					divIcon = L.divIcon({
						className: 'clusterIcon fringe2 ' + measure,
						iconSize: size,
						html: '<img class="clusterImg" onload="this.parentNode.classList.add(\'show\')" src="' + cluster.p.sfile + '"/><div class="clusterFoot"><span class="clusterCount">' + cluster.c + '</span></div>'
					});
					cluster.measure = measure;
					cluster.marker =
						L.marker(cluster.geo, {icon: divIcon, riseOnHover: true, data: {type: 'clust', obj: cluster}})
							.on('click', this.clickMarker, this)
							.on('mouseover', this.popupPhotoOver, this);
					this.layerClusters.addLayer(cluster.marker);
					result[cluster.cid] = cluster;
				}
			}
		}
		if (add) {
			_.assign(this.mapObjects.clusters, result);
		} else {
			this.mapObjects.clusters = result;
		}
	};

	MarkerManager.prototype.drawClustersLocal = function (clusters, boundChanged, add) {
		var i,
			size,
			measure,
			cluster,
			divIcon,
			result = {};

		if (Array.isArray(clusters) && clusters.length > 0) {
			i = clusters.length;
			while (i) {
				cluster = clusters[--i];
				if (!boundChanged || this.calcBound.contains(cluster.geo)) {
					if (cluster.c > 9) {
						if (cluster.c > 49) {
							size = this.sizeClusterLb;
							measure = 'b';
						} else {
							size = this.sizeClusterLm;
							measure = 'm';
						}
					} else {
						size = this.sizeClusterL;
						measure = '';
					}
					divIcon = L.divIcon({className: 'clusterIconLocal ' + 'y' + cluster.year + ' ' + measure, iconSize: size, html: cluster.c});
					cluster.marker =
						L.marker(cluster.geo, {icon: divIcon, riseOnHover: true, data: {type: 'clust', obj: cluster}})
							.on('click', this.clickMarker, this);
					this.layerClusters.addLayer(cluster.marker);
					result[cluster.cid] = cluster;
				}
			}
		}
		if (add) {
			_.assign(this.mapObjects.clusters, result);
		} else {
			this.mapObjects.clusters = result;
		}
	};

	MarkerManager.prototype.clearClusters = function () {
		this.layerClusters.clearLayers();
		this.mapObjects.clusters = {};
	};
	MarkerManager.prototype.clearPhotos = function () {
		this.layerPhotos.clearLayers();
		this.mapObjects.photos = {};
		this.photosAll = [];
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
		} else if (minuend.intersects(subtrahend)) {
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
			} else {
				c[1].north = a.north;
				c[1].south = a.south;
			}
		} else {
			c[0] = a;
		}
		c = _.compact(c);

		i = c.length;
		while (i) {
			curr = c[--i];
			result[i] = [
				[curr.south, curr.west],
				[curr.north, curr.east]
			];
		}

		return result;
	};

	/**
	 * Удаляет объекты не входящие в баунд
	 */
	MarkerManager.prototype.cropByBound = function (bound, localWork) {
		bound = bound || this.calcBound;
		var i,
			curr,
			arr;

		// На уровнях локальной кластеризации обрезаем массив всех фотографий
		if (localWork) {
			arr = [];
			i = this.photosAll.length;
			while (i) {
				curr = this.photosAll[--i];
				if (bound.contains(curr.geo)) {
					arr.push(curr);
				}
			}
			this.photosAll = arr;
		}

		// Удаляем невходящие маркеры фотографий
		arr = Object.keys(this.mapObjects.photos);
		i = arr.length;
		while (i) {
			curr = this.mapObjects.photos[arr[--i]];
			if (curr !== undefined && !bound.contains(curr.geo)) {
				this.layerPhotos.removeLayer(curr.marker.clearAllEventListeners());
				this.mapObjects.photos[curr.cid] = undefined;
			}
		}

		// Удаляем невходящие маркеры кластеров
		arr = Object.keys(this.mapObjects.clusters);
		i = arr.length;
		while (i) {
			curr = this.mapObjects.clusters[arr[--i]];
			if (curr !== undefined && !bound.contains(curr.geo)) {
				this.layerClusters.removeLayer(curr.marker.clearAllEventListeners());
				this.mapObjects.clusters[curr.cid] = undefined;
			}
		}

		i = curr = arr = null;
	};

	/**
	 * Zoom animation to mouse pointer position.
	 * @param point
	 * @param newZoom
	 * @return {*}
	 */
	MarkerManager.prototype.zoomApproachToPoint = function (point, newZoom) {
		var scale = this.map.getZoomScale(newZoom),
			viewHalf = this.map.getSize().divideBy(2),
			centerOffset = point.subtract(viewHalf).multiplyBy(1 - 1 / scale),
			newCenterPoint = this.map._getTopLeftPoint().add(viewHalf).add(centerOffset);

		return this.map.unproject(newCenterPoint);
	};

	/**
	 * @param evt
	 */
	MarkerManager.prototype.clickMarker = function (evt) {
		var marker = evt.target,
			object = marker.options.data.obj,
			eventPoint = this.map.mouseEventToContainerPoint(evt.originalEvent),
			nextZoom;

		if (marker.options.data.type === 'photo' && object.cid) {
			this.photoNavigate('/p/' + object.cid);
		} else if (marker.options.data.type === 'clust') {
			if (evt.originalEvent.target.classList.contains('clusterImg')) {
				this.photoNavigate('/p/' + object.p.cid);
			} else {
				if (this.map.getZoom() === this.map.getMaxZoom()) {
					this.popupClusterLocalOpen(marker);
				} else {
					nextZoom = this.map.getZoom() + 1;
					this.map.setView(this.zoomApproachToPoint(eventPoint, nextZoom), nextZoom);
				}
			}
		}
	};
	MarkerManager.prototype.photoNavigate = function (url) {
		if (this.embedded) {
			globalVM.router.navigateToUrl(url);
		} else if (this.openNewTab) {
			window.open(url, '_blank');
		} else {
			location.href = url;
		}
	};

	MarkerManager.prototype.popupClusterLocalOpen = function (marker) {
		var photos = marker.options.data.obj.photos,
			photo,
			i = -1,
			len = photos.length,
			small = len <= 3,
			popup = small ? this.popupCluster : (len <= 15 ? this.popupClusterFive : this.popupClusterFiveScroll),
			content = '<div class="popupPreviews">';

		photos.sort(function (a, b) {
			var result = 0;
			if (a.year > b.year) {
				result = -1;
			} else if (a.year < b.year) {
				result = 1;
			}
			return result;
		});

		while (++i < len) {
			photo = photos[i];
			photo.sfile = Photo.picFormats.midi + photo.file;
			if (i > 0 && i % 5 === 0) {
				content += '<br/>';
			}
			content += this.popupClusterTpl({img: Photo.picFormats.micros + photo.file || '', cid: photo.cid || '', sfile: small ? photo.sfile : Photo.picFormats.thumb + photo.file, title: photo.title, href: '/p/' + photo.cid, year: this.makeTextYear(photo)});
		}
		content += '</div><div class="popupPoster" data-href="' + '/p/' + photos[photos.length - 1].cid + '" onclick="' + this.popupClusterClickFN + '(this)" >' + this.popupPhotoTpl({img: small ? photos[photos.length - 1].sfile : Photo.picFormats.thumb + photos[photos.length - 1].file, year: this.makeTextYear(photos[photos.length - 1]), txt: photos[photos.length - 1].title}) + '<div class="h_separatorWhite"></div> ' + '</div>';
		popup
			.setLatLng(marker.getLatLng())
			.setContent(content);

		this.popupOpen(popup);
	};


	MarkerManager.prototype.makeTextYear = function (photo) {
		return photo.year + (photo.year2 && photo.year2 > photo.year ? ' - ' + photo.year2 : '');
	};
	MarkerManager.prototype.popupPhotoOpen = function () {
		var popup,
			type = this.markerToPopup.options.data.type,
			obj = this.markerToPopup.options.data.obj;
		if (this.markerToPopup) {
			if (type === 'photo') {
				popup = this.popupPhoto
					.setContent(this.popupPhotoTpl({img: obj.sfile, txt: obj.title, year: this.makeTextYear(obj)}));
			} else if (type === 'clust') {
				popup = this['popupClusterPhoto' + obj.measure]
					.setContent(this.popupClusterPhotoTpl({txt: obj.p.title, year: this.makeTextYear(obj.p)}));
			}
			popup.setLatLng(this.markerToPopup.getLatLng());
			this.popupOpen(popup);
		}
	};
	MarkerManager.prototype.popupPhotoOver = function (evt) {
		var type = evt.target.options.data.type;

		window.clearTimeout(this.popupTimeout);
		if (type === 'photo' || (type === 'clust' && evt.originalEvent.target.classList.contains('clusterImg'))) {
			this.popupTimeout = window.setTimeout(this.popupPhotoOpenBind, 200);
			this.markerToPopup = evt.target.on('mouseout', this.popupPhotoOut, this);
		}

	};

	MarkerManager.prototype.popupPhotoOut = function (evt) {
		// Закрываем попап, только если это попап фото. Чтобы при наведения и убыстрого уведения без открытия не закрывался попап кластера
		if (this.popupOpened !== this.popupCluster && this.popupOpened !== this.popupClusterFive && this.popupOpened !== this.popupClusterFiveScroll) {
			this.popupClose();
		}
		this.markerToPopup = null;
		window.clearTimeout(this.popupTimeout);
		evt.target.off('mouseout', this.popupPhotoOut, this);
	};

	MarkerManager.prototype.popupOpen = function (popup) {
		window.clearTimeout(this.popupTimeout);
		this.popupClose();
		this.map.addLayer(popup);
		this.popupOpened = popup;
	};
	MarkerManager.prototype.popupClose = function () {
		if (this.popupOpened) {
			this.map.removeLayer(this.popupOpened);
			this.popupOpened = null;
		}
	};

	return MarkerManager;
});