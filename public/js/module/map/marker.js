/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
    'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'globalVM', 'leaflet', 'm/Photo'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, globalVM, L, Photo) {
    'use strict';

    var cams2 = {cameras: {}, clusters: {}, groups: {}};

    function MarkerManager(map, options) {
        this.map = map;

        this.mapObjects = { photos: {}, clusters: {}, clustersLocal: {} };
        this.layerPhotos = L.layerGroup().addTo(this.map); // Слой фотографий
        this.layerClusters = L.layerGroup().addTo(this.map); // Слой кластеров
        this.layerClustersLocal = L.layerGroup().addTo(this.map); // Слой кластеров

        this.objects = {};
        this.objectsNew = {};

        this.sizePoint = new L.Point(8, 8);
        this.sizeClusters = new L.Point(42, 42);
        this.sizeClusterm = new L.Point(52, 52);
        this.sizeCluster = new L.Point(62, 62);

        this.pane = this.map._panes.markerPane;
        this.calcBound = null;
        this.calcBoundPrev = null;
        this.currZoom = this.map.getZoom();
        this.refreshByZoomTimeout = null;
        this.refreshDataByMoveBind = this.refreshDataByMove.bind(this, true);
        this.refreshDataByZoomBind = this.refreshDataByZoom.bind(this, true);
        this.refreshingRequest = null;
        this.aggregateDelta = P.settings.CLUSTERING_ON_CLIENT_PIX_DELTA();

        this.animationOn = false;
        //Events
        this.map.on('zoomstart', this.onZoomStart, this);
        //this.map.on('zoomanim', this.onZoomAnim, this);
        this.map.on('moveend', this.onMapMoveEnd, this);

        this.reCalcBound();
        this.refreshDataByZoom();
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
            this.calcBound = this.map.getBounds().pad(0.1);
            result = true;
        }
        return result;
    };

    /**
     * Вызывается по событию начала изменения масштаба карты
     */
    MarkerManager.prototype.onZoomStart = function (opt) {
        window.clearTimeout(this.refreshByZoomTimeout);
        this.layerClusters.clearLayers();
        delete this.mapObjects.clusters;
        this.mapObjects.clusters = {};
        /*if (!this.animationOn) {
         this.changeMarkersDisplayByType('none');
         }*/
    };

    /**
     * Вызывается по событию начала изменения масштаба карты с анимацией.
     * @param {!Object} opt Опции, которые передает API карты.
     */
    MarkerManager.prototype.onZoomAnim = function (opt) {
        var matchedMarkers,
            m;
        if (this.animationOn === true) {
            matchedMarkers = this.getMarkersByType(this.objects, ['cluster', 'cam', 'car']);
            for (m in matchedMarkers) {
                if (matchedMarkers.hasOwnProperty(m)) {
                    L.DomUtil.setPosition(matchedMarkers[m].dom, this.map._latLngToNewLayerPoint(matchedMarkers[m].point, opt.zoom, opt.center), false);
                }
            }
            this.changeMarkersDisplayByType('none', ['group']);
        }
    };

    /**
     * Вызывается по событию изменения базового слоя карты
     * Определяет, активна ли анимация изменения масштаба для данного слоя или нет
     */
    MarkerManager.prototype.layerChange = function () {
        if (this.map.options.zoomAnimation && this.map.options.markerZoomAnimation) {
            if (!this.animationOn) {
                this.pane.classList.add('neo-animate');
                this.animationOn = true;
            }
        } else if (this.animationOn) {
            this.pane.classList.remove('neo-animate');
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
                this.refreshDataByMoveBind(false);
            }
        }
    };

    /**
     * Обновление данных маркеров по зуму.
     */
    MarkerManager.prototype.refreshDataByZoom = function () {
        this.currZoom = this.map.getZoom();
        this.reCalcBound(true);
        this.startPendingAt = Date.now();

        var zoom = this.currZoom,
            bound = _.clone(this.calcBound);

        socket.once('getBoundsResult', function (data) {
            var needClientClustering, // Смотрим нужно ли использовать клиентскую кластеризацию
                boundChanged; // Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд

            if (data && !data.error) {
                // Данные устарели и должны быть отброшены, если уже был отправлен другой запрос на данные по зуму или текущий зум не равен запрашиваемомоу или текущий баунд уже успел выйти за пределы запрашиваемого
                if (this.startPendingAt !== data.startAt || zoom !== this.currZoom || !bound.intersects(this.calcBound)) {
                    console.log('Полученные данные нового зума устарели');
                    return;
                }

                needClientClustering = (this.currZoom !== this.map.getMaxZoom()) && P.settings.CLUSTERING_ON_CLIENT().indexOf(this.currZoom) > -1;
                boundChanged = !bound.equals(this.calcBound);

                if (needClientClustering) {
                    this.processIncomingDataZoomClientClustering(data, boundChanged);
                } else {
                    this.processIncomingDataZoom(data, boundChanged);
                }
            } else {
                console.log('Ошибка загрузки новых камер: ' + data.message);
            }
            zoom = bound = null;
            delete this.startPendingAt;
        }.bind(this));
        socket.emit('getBounds', {z: zoom, bounds: [[Utils.geo.latlngToArr(bound.getSouthWest(), true), Utils.geo.latlngToArr(bound.getNorthEast(), true)]], startAt: this.startPendingAt});
    };

    /**
     * Обрабатывает входящие данные по зуму
     */
    MarkerManager.prototype.processIncomingDataZoom = function (data, boundChanged) {
        var photos = {},
            clusters = {},
            divIcon,
            curr,
            existing,
            i;

        // Заполняем новый объект фото
        if (Array.isArray(data.photos) && data.photos.length > 0) {
            i = data.photos.length;
            while (i) { // while loop, reversed
                curr = data.photos[--i];
                existing = this.mapObjects.photos[curr.cid];
                if (existing !== undefined) {
                    // Если такое фото уже есть, то просто записываем его в новый объект
                    photos[curr.cid] = existing;
                    delete this.mapObjects.photos[curr.cid];
                } else {
                    // Если оно новое - создаем его объект и маркер
                    curr.geo.reverse();
                    if (!boundChanged || this.calcBound.contains(curr.geo)) {
                        photos[curr.cid] = Photo.factory(curr, 'mapdot', 'mini');
                        divIcon = L.divIcon({className: 'photoIcon ' + curr.dir, iconSize: this.sizePoint});
                        curr.marker = L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr}});
                        this.layerPhotos.addLayer(curr.marker);
                    }
                }
            }
        }

        // В текущем объекте остались только фото на удаление
        for (i in this.mapObjects.photos) {
            if (this.mapObjects.photos.hasOwnProperty(i)) {
                this.layerPhotos.removeLayer(this.mapObjects.photos[i].marker);
                delete this.mapObjects.photos[i];
            }
        }
        this.mapObjects.photos = photos;

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
        this.mapObjects.clusters = clusters; // Сливаем группы в основной объект кластеров this.mapObjects.clusters

        //Чистим ссылки
        delete data.photos;
        delete data.clusters;
        photos = clusters = curr = existing = data = null;
    };

    /**
     * Обрабатывает входящие данные по зуму с локальной кластеризацией
     */
    MarkerManager.prototype.processIncomingDataZoomClientClustering = function (data, boundChanged) {
        var localClusteringResult,
            photos = {},
            clusters = {},
            clustersLocal = {},
            divIcon,
            curr,
            existing,
            i;

        // Заполняем новый объект фото
        if (Array.isArray(data.photos) && data.photos.length > 0) {
            i = data.photos.length;
            while (i) { // while loop, reversed
                curr = data.photos[--i];
                existing = this.mapObjects.photos[curr.cid];
                if (existing !== undefined) {
                    // Если такое фото уже есть, то просто записываем его в новый объект
                    photos[curr.cid] = existing;
                } else {
                    curr.geo.reverse();
                    if (!boundChanged || (boundChanged && this.calcBound.contains(curr.geo))) {
                        photos[curr.cid] = Photo.factory(curr, 'mapdot', 'mini');
                    }
                }
            }
        }

        // В текущем объекте остались только фото на удаление
        for (i in this.mapObjects.photos) {
            if (this.mapObjects.photos.hasOwnProperty(i)) {
                this.layerPhotos.removeLayer(this.mapObjects.photos[i].marker);
                delete this.mapObjects.photos[i];
            }
        }
        this.mapObjects.photos = photos;


        // Если кластеры должны строиться на клиенте, то не берем их из результата сервера
        localClusteringResult = this.localClustering(this.mapObjects.photos);
        clusters = localClusteringResult.clusters;

        i = localClusteringResult.photosGoesToLocalCluster.length;
        while (i) {
            curr = localClusteringResult.photosGoesToLocalCluster[--i];
            if (curr.marker) {
                this.layerPhotos.removeLayer(curr.marker);
            }
            delete photos[curr.cid];
            delete this.mapObjects.photos[curr.cid];
        }


        // Создаем маркеры для новых фото
        for (i in photos) {
            if (photos.hasOwnProperty(i)) {
                curr = photos[i];
                divIcon = L.divIcon({className: 'photoIcon ' + curr.dir, iconSize: this.sizePoint});
                curr.marker = L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr}});
                this.layerPhotos.addLayer(curr.marker);
            }
        }

        // Создаем маркеры для кластеров
        for (i in clusters) {
            if (clusters.hasOwnProperty(i)) {
                curr = clusters[i];
                divIcon = L.divIcon({className: 'clusterIcon fringe2', iconSize: this['sizeCluster' + curr.measure], html: '<img class="clusterImg" onload="this.parentNode.classList.add(\'show\')" src="' + curr.sfile + '"/><div class="clusterCount">' + curr.c + '</div>'});
                curr.marker = L.marker(curr.geo, {icon: divIcon, riseOnHover: true, data: {cid: 'cl' + i, type: 'clust', obj: curr, c: curr.c}});
                this.layerClusters.addLayer(curr.marker);
            }
        }
        this.mapObjects.clusters = clusters; // Сливаем группы в основной объект кластеров this.mapObjects.clusters

        //Чистим ссылки
        delete data.photos;
        delete data.clusters;
        photos = clusters = clustersLocal = curr = existing = data = null;
    };


    /**
     * Обновление данных маркеров.
     * @param {?boolean=} reposExisting Пересчитывать позиции существующих маркеров. Например, при изменении масштаба надо пересчитывать.
     */
    MarkerManager.prototype.refreshDataByMove = function (reposExisting) {
        var zoom = this.currZoom,
            bound = _.clone(this.calcBound),
            bounds = [],
            a = {west: this.calcBoundPrev._southWest.lng, north: this.calcBoundPrev._northEast.lat, east: this.calcBoundPrev._northEast.lng, south: this.calcBoundPrev._southWest.lat},
            b = {west: bound._southWest.lng, north: bound._northEast.lat, east: bound._northEast.lng, south: bound._southWest.lat},
            c1,
            c2,
            i;

        //Удаляем маркеры, не входящие в новый баунд
        for (i in this.mapObjects.photos) {
            if (this.mapObjects.photos.hasOwnProperty(i) && !bound.contains(this.mapObjects.photos[i].geo)) {
                this.layerPhotos.removeLayer(this.mapObjects.photos[i].marker);
                delete this.mapObjects.photos[i];
            }
        }
        for (i in this.mapObjects.clusters) {
            if (this.mapObjects.clusters.hasOwnProperty(i) && !bound.contains(this.mapObjects.clusters[i].geo)) {
                this.layerClusters.removeLayer(this.mapObjects.clusters[i].marker);
                delete this.mapObjects.clusters[i];
            }
        }

        //Считаем новые баунды для запроса
        if (b.east > a.east) {
            c2 = {west: a.east, east: b.east};
        } else if (b.east < a.east) {
            c2 = {west: b.west, east: a.west};
        }
        if (a.north !== b.north) {
            c1 = {west: b.west, east: b.east};

            if (b.north > a.north) {
                c1.north = b.north;
                c1.south = a.north;

                if (c2) {
                    c2.north = a.north;
                    c2.south = b.south;
                }
            } else {
                c1.north = a.south;
                c1.south = b.south;

                if (c2) {
                    c2.north = b.north;
                    c2.south = a.south;
                }
            }
        }
        if (this.b1) {
            this.map.removeLayer(this.b1);
            this.b1 = null;
        }
        if (this.b2) {
            this.map.removeLayer(this.b2);
            this.b2 = null;
        }
        if (c1) {
            bounds.push([[c1.west, c1.south], [c1.east, c1.north]]);
            this.b1 = L.polygon([
                [c1.north, c1.west],
                [c1.north, c1.east],
                [c1.south, c1.east],
                [c1.south, c1.west]
            ], {color: '#f00', weight: 1}).addTo(this.map);
        }
        if (c2) {
            bounds.push([[c2.west, c2.south], [c2.east, c2.north]]);
            this.b2 = L.polygon([
                [c2.north, c2.west],
                [c2.north, c2.east],
                [c2.south, c2.east],
                [c2.south, c2.west]
            ], {color: '#f90', weight: 1}).addTo(this.map);
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
                        photos[curr.cid] = Photo.factory(curr, 'mapdot', 'mini');
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
        delete data.photos;
        delete data.clusters;
        photos = clusters = curr = data = null;
    };


    /**
     * Локальная кластеризация камер, пришедших клиенту. Проверяем на совпадение координат камер с учетом дельты. Связываем такие камеры
     */
    MarkerManager.prototype.localClustering = function (data) {
        /*       var deltaLAT = Math.abs(this.map.layerPointToLatLng(new L.Point(1, this.aggregateDelta)).lat - this.map.layerPointToLatLng(new L.Point(1, 0)).lat),
         deltaLNG = Math.abs(this.map.layerPointToLatLng(new L.Point(this.aggregateDelta, 1)).lng - this.map.layerPointToLatLng(new L.Point(0, 1)).lng),
         cutLAT = deltaLAT.toPrecision(1).length - 3,
         cutLNG = deltaLNG.toPrecision(1).length - 3,
         i,
         j,
         photo,
         currCoordId = '',
         cluster;
         for (i in data) {
         if (data.hasOwnProperty(i)) {
         photo = data[i];
         currCoordId = photo.geo[0].toFixed(cutLAT) + photo.geo[1].toFixed(cutLNG);
         if (!clusters[currCoordId]) {
         clusters[currCoordId] = {lats: 0, lngs: 0, camsnum: 0, cams: {}};
         }
         cluster = clusters[currCoordId];
         cluster.cams[i] = photo;
         cluster.camsnum += 1;
         cluster.lats += photo.geo[0];
         cluster.lngs += photo.geo[1];
         }
         }
         this.mapObjects.clustersLocal = clusters;

         // Создаем маркеры фото и кластеров и добавляем их в текущий менеджер маркеров
         for (i in clusters) {
         if (!clusters.hasOwnProperty(i)) {
         cluster = clusters[i];
         curr = Utils.getObjectOneOwnProperty(cluster['cams']);
         if (cluster['camsnum'] > 1) {
         for (j in cluster['cams']) {
         if (cluster['cams'].hasOwnProperty(j)) {
         cluster['cams'][j].cluster = i;
         }
         }
         this.addMarker(
         cluster.marker = new L.NeoMarker(new L.LatLng(cluster['lats'] / cluster['camsnum'], cluster['lngs'] / cluster['camsnum']), {id: 'p' + i, type: 'cluster', obj: cluster})
         );
         } else if (!curr.marker) {
         this.addMarker(
         curr.marker = new L.NeoMarker((curr.lat && curr.lng ? new L.LatLng(curr.lat, curr.lng) : mapDefCenter), {id: curr.id, type: 'cam', obj: curr, img: curr.icon})
         );
         }
         }
         }*/
    };

    /**
     * Перерисовывает маркеры. Влючает в себя обновление и репозиционирование маркеров
     * @param {?boolean=} reposExisting Пересчитывать позиции существующих маркеров. Например, при изменении масштаба надо пересчитывать
     */
    MarkerManager.prototype.redraw = function (reposExisting) {
        this.updateObjects();

        if (!this.animationOn) {
            this.changeMarkersDisplayByType('block', ['cam', 'car', 'cluster']);
        }
    };

    /**
     * Обновляет хэш отображаемых маркеров.
     * Удаляет ненужные и добавляет нужные (новые).
     * @param {?boolean=} reposExisting Пересчитывать позиции существующих маркеров. Например, при изменении масштаба надо пересчитывать.
     * @param {?boolean=} searchRespectHash Учитывать хэш поиска.
     */
    MarkerManager.prototype.updateObjects = function (reposExisting, searchRespectHash) {
        var m, marker, markersAlreadyAdded = {}, respectHash = false, toDelete = true;

        if (!searchRespectHash && SearchInVM.open() && SearchInVM.applyMap && SearchInVM.applyMap() && SearchInVM.resultHash) {
            searchRespectHash = SearchInVM.resultHash;
        }
        respectHash = !!searchRespectHash;

        console.log('New objects: ' + Utils.getObjectPropertyLength(this.objectsNew) + ', current objects: ' + Utils.getObjectPropertyLength(this.objects));

        for (m in this.objects) {
            if (this.objects.hasOwnProperty(m)) {

                marker = this.objects[m];
                toDelete = true;

                switch (marker.type) {

                case 'cam':
                    if (respectHash) {
                        if (searchRespectHash[m]) {
                            toDelete = false;
                        }
                    } else {
                        if (cams2.cameras[m] && !cams2.cameras[m].cluster) {
                            toDelete = false;
                        }
                    }
                    break;

                case 'car':
                    marker.dom.style.display = (Cars.visibleZooms.indexOf(this.currZoom) >= 0) ? 'block' : 'none';
                    toDelete = false;
                    break;
                }


                if (toDelete) {
                    Utils.Event.removeAll(marker.over);
                    marker.remove();
                    delete this.objects[m];
                }
                else {
                    if (reposExisting) {
                        marker.repos();
                    }
                }
            }
        }


        var fragment = document.createDocumentFragment();
        for (m in this.objectsNew) {
            if (this.objectsNew.hasOwnProperty(m)) {
                marker = this.objectsNew[m];

                if (marker.type === 'cam' && respectHash && !searchRespectHash[m]) {
                    continue;
                }
                if (marker.type === 'car' && marker.dom) {
                    marker.dom.style.display = (Cars.visibleZooms.indexOf(this.currZoom) >= 0) ? 'block' : 'none';
                }

                fragment.appendChild(marker.createDom());
                marker.repos();
                this.MarkerAddEvents(marker);
                this.objects[m] = marker;
                delete this.objectsNew[m];
            }
        }
        this.pane.appendChild(fragment);

        console.log('Still new (not added) objects: ' + Utils.getObjectPropertyLength(this.objectsNew) + ', current objects: ' + Utils.getObjectPropertyLength(this.objects));
        markersAlreadyAdded = m = fragment = null;
    };

    MarkerManager.prototype.MarkerAddEvents = function (marker) {
        Utils.Event.add(marker.over, 'touchstart', marker.TouchStart.bind(marker));
        Utils.Event.add(marker.over, 'touchend', marker.TouchEnd.bind(marker));
        Utils.Event.add(marker.over, 'click', marker.MarkerClick.bind(marker));
        Utils.Event.add(marker.over, 'mouseover', marker.MarkerOver.bind(marker));
        Utils.Event.add(marker.over, 'mouseout', marker.MarkerOut.bind(marker));
    };

    /**
     * Изменение свойства display маркеров указанных типов.
     * @param {!string} display Значение видимости
     * @param {?Array.<string>=} typeArray Массив типов
     */
    MarkerManager.prototype.changeMarkersDisplayByType = function (display, typeArray) {
        var matchedMarkers = typeArray ? this.getMarkersByType(this.objects, typeArray) : this.objects,
            m;
        for (m in matchedMarkers) {
            if (matchedMarkers.hasOwnProperty(m)) {
                matchedMarkers[m].dom.style.display = display;
            }
        }
        matchedMarkers = m = null;
    };

    /**
     * Репозиционирование маркеров
     * @param {?Array.<string>=} typeArray Массив типов
     */
    MarkerManager.prototype.reposByType = function (typeArray) {
        var matchedMarkers = typeArray ? this.getMarkersByType(this.objects, typeArray) : this.objects,
            m;
        for (m in matchedMarkers) {
            if (matchedMarkers.hasOwnProperty(m)) {
                matchedMarkers[m].repos();
            }
        }
        matchedMarkers = m = null;
    };

    /**
     * Возвращает из заданного хеша маркеров хэш маркеров с указанными типами
     * @param {!Object} objects Хэш маркеров
     * @param {!Array.<string>} typeArray Массив типов
     * @return {Object}
     */
    MarkerManager.prototype.getMarkersByType = function (objects, typeArray) {
        typeArray.sort();
        return _.filter(objects, function (marker) {
            return _.indexOf(typeArray, marker.type, true) >= 0;
        });
    };

    return MarkerManager;
});