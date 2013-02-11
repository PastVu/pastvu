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
        var result = false;
        if (force || !this.calcBound || !this.calcBound.contains(this.map.getBounds())) {
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
     * Обновление данных маркеров.
     */
    MarkerManager.prototype.refreshDataByZoom = function () {
        this.currZoom = this.map.getZoom();
        this.reCalcBound(true);
        this.startPendingAt = Date.now();

        var zoom = this.currZoom,
            bound = _.clone(this.calcBound);

        socket.once('getBoundResult', function (data) {
            if (data && !data.error) {
                if (this.startPendingAt !== data.startAt || zoom !== this.currZoom || !bound.intersects(this.calcBound)) {
                    console.log('Полученные данные нового зума устарели');
                    return;
                }
                this.processIncomingDataZoom(data, bound); // Обрабатываем
                //this.redraw(); // Запускаем перерисовку
            } else {
                console.log('Ошибка загрузки новых камер: ' + data.message);
            }
            this.startPendingAt = null;
        }.bind(this));
        socket.emit('getBound', {z: this.currZoom, sw: Utils.geo.latlngToArr(this.calcBound.getSouthWest(), true), ne: Utils.geo.latlngToArr(this.calcBound.getNorthEast(), true), startAt: this.startPendingAt});
    };

    /**
     * Обновление данных маркеров.
     * @param {?boolean=} reposExisting Пересчитывать позиции существующих маркеров. Например, при изменении масштаба надо пересчитывать.
     */
    MarkerManager.prototype.refreshDataByMove = function (reposExisting) {
        var zoom = this.currZoom;
        socket.once('getBoundResult', function (data) {
            if (data && !data.error) {
                if (zoom !== this.currZoom) {
                    console.log('Полученные данные перемещения устарели, так как запрашивались для другого зума');
                    return;
                }
                this.processIncomingDataMove(data); // Обрабатываем
                this.redraw(); // Запускаем перерисовку
            } else {
                console.log('Ошибка загрузки новых камер: ' + data.message);
            }
        }.bind(this));
        socket.emit('getBound', {z: this.currZoom, sw: Utils.geo.latlngToArr(this.calcBound.getSouthWest(), true), ne: Utils.geo.latlngToArr(this.calcBound.getNorthEast(), true)});
    };

    /**
     * Обрабатывает входящие данные
     */
    MarkerManager.prototype.processIncomingDataZoom = function (data, bound) {
        var needClientClustering = (this.currZoom !== this.map.getMaxZoom()) && P.settings.CLUSTERING_ON_CLIENT().indexOf(this.currZoom) > -1,
            boundChanged = !bound.equals(this.calcBound), //Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд
            localClusteringResult,
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
        if (needClientClustering) {
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
        } else if (Array.isArray(data.clusters) && data.clusters.length > 0) {
            i = data.clusters.length;
            while (i) {
                curr = data.clusters[--i];
                curr.geo.reverse();
                if (!boundChanged || (boundChanged && this.calcBound.contains(curr.geo))) {
                    clusters[i] = Photo.factory(curr, 'mapclust');
                }
            }
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
     * Обрабатывает входящие данные
     */
    MarkerManager.prototype.processIncomingDataMove = function (data) {
        var needClientClustering = (this.currZoom !== this.map.getMaxZoom()) && P.settings.CLUSTERING_ON_CLIENT().indexOf(this.currZoom) > -1,
            boundChanged = !bound.equals(this.calcBound), //Если к моменту получения входящих данных нового зума, баунд изменился, значит мы успели подвигать картой, поэтому надо проверить пришедшие точки на вхождение в актуальный баунд
            localClusteringResult,
            photos = {},
            clusters = {},
            clustersLocal = {},
            curr,
            i;

        // Заполняем объект новых фото
        if (Array.isArray(data.photos) && data.photos.length > 0) {
            i = data.photos.length;
            while (i) { // while loop, reversed
                curr = data.photos[--i];
                if (this.mapObjects.photos[curr.cid] === undefined) {
                    curr.geo.reverse();
                    if (this.calcBound.contains(curr.geo)) {
                        photos[curr.cid] = curr;
                    }
                }
            }
        }

        // Проверяем, если старые фото выходят за пределы актуального bound
        for (i in this.mapObjects.photos) {
            if (this.mapObjects.photos.hasOwnProperty(i)) {
                if (!this.calcBound.contains(this.mapObjects.photos[i].geo)) {
                    this.layerPhotos.removeLayer(this.mapObjects.photos[i].marker);
                    delete this.mapObjects.photos[i];
                }
            }
        }
        _.assign(this.mapObjects.photos, photos);


        // Если кластеры должны строиться на клиенте, то не берем их из результата сервера
        if (needClientClustering) {
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
        } else {
            // Проверяем, если старые кластеры выходят за пределы актуального bound
            for (i in this.mapObjects.clusters) {
                if (this.mapObjects.clusters.hasOwnProperty(i)) {
                    if (!this.calcBound.contains(this.mapObjects.clusters[i].geo)) {
                        this.layerClusters.removeLayer(this.mapObjects.clusters[i].marker);
                        delete this.mapObjects.clusters[i];
                    }
                }
            }
            if (Array.isArray(data.clusters) && data.clusters.length > 0) {
                i = data.clusters.length;
                while (i) {
                    curr = data.clusters[--i];
                    if (this.calcBound.contains(curr.geo)) {
                        clusters[i] = curr;
                    }
                }
            }
        }

        // Создаем маркеры для новых фото
        for (i in photos) {
            if (photos.hasOwnProperty(i)) {
                curr = photos[i];
                curr.marker = L.marker(curr.geo, {riseOnHover: true, data: {cid: curr.cid, type: 'photo', obj: curr, img: curr.icon}});
                this.layerPhotos.addLayer(curr.marker);
            }
        }

        // Создаем маркеры для кластеров
        for (i in clusters) {
            if (clusters.hasOwnProperty(i)) {
                curr = clusters[i];
                curr.marker = L.marker(curr.geo, {riseOnHover: true, data: {cid: 'cl' + i, type: 'clust', obj: curr, count: curr.count}});
                this.layerClusters.addLayer(curr.marker);
            }
        }
        _.assign(this.mapObjects.clusters, clusters);  // Сливаем группы в основной объект кластеров this.mapObjects.clusters

        //Чистим ссылки
        delete data.photos;
        delete data.clusters;
        photos = clusters = clustersLocal = curr = data = null;
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