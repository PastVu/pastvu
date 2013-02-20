/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
    'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'globalVM', 'leaflet', 'm/Photo'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, globalVM, L, Photo) {
    'use strict';

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

        this.pane = this.map.getPanes().markerPane;
        this.calcBound = null;
        this.calcBoundPrev = null;
        this.firstNoClusterZoom = 17;
        this.currZoom = this.map.getZoom();
        this.refreshByZoomTimeout = null;
        this.refreshDataByMoveBind = this.refreshDataByMove.bind(this, true);
        this.refreshDataByZoomBind = this.refreshDataByZoom.bind(this, true);
        this.aggregateDelta = P.settings.CLUSTERING_ON_CLIENT_PIX_DELTA();

        this.animationOn = false;

        this.panePopup = this.map.getPanes().popupPane;
        this.popup = new L.Popup({maxWidth: 89, minWidth: 89, offset: new L.Point(0, -10), autoPan: false, zoomAnimation: false, closeButton: false});
        this.popupTempl = _.template('<img class="popupImg" src="${ img }"/><div class="popupCap">${ txt }</div>');

        //Events
        this.map
            .on('zoomstart', this.onZoomStart, this)
            .on('moveend', this.onMapMoveEnd, this);
            /*.on('mousemove', function (evt) {
                console.log(evt.latlng.lat, evt.latlng.lng);
            }, this);*/

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
        this.layerClusters.clearLayers();
        delete this.mapObjects.clusters;
        this.mapObjects.clusters = {};
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
        this.reCalcBound(true);
        this.startPendingAt = Date.now();

        var newZoom = this.map.getZoom(),
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

        if (this.currZoom >= this.firstNoClusterZoom && newZoom >= this.firstNoClusterZoom) {
            // Если на клиенте уже есть все фотографии для данного зума
            if (newZoom > this.currZoom) {
                // Если новый зум больше предыдущего, то просто отбрасываем объекты, не попадающие в новый баунд
                pollServer = false;
                this.cropByBound();
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
                newZoom = bound = null;
                delete this.startPendingAt;
            }.bind(this));
            socket.emit('getBounds', {z: newZoom, bounds: bounds, startAt: this.startPendingAt});
        }

        this.currZoom = newZoom;
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
                        curr.marker
                            .on('mouseover', this.overMarker, this)
                            .on('mouseout', this.outMarker, this);
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
                    //curr.marker.on('mouseover', this.overMarker);
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
        this.cropByBound();

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
     * Удаляет объекты не входящие в баунд
     * @param {?Object=} bound Учитывать хэш поиска.
     */
    MarkerManager.prototype.cropByBound = function (bound) {
        bound = bound || this.calcBound;
        var i;

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
    };

    /**
     * @param evt
     */
    MarkerManager.prototype.overMarker = function (evt) {
        this.popup
            .setLatLng(evt.target.getLatLng())
            .setContent(this.popupTempl({img: evt.target.options.data.obj.sfile || '', txt: 'WOWOWO'}));
        this.map.openPopup(this.popup);
    };
    /**
     * @param evt
     */
    MarkerManager.prototype.outMarker = function (evt) {
        this.map.closePopup();
    };

    MarkerManager.prototype.MarkerAddEvents = function (marker) {
        Utils.Event.add(marker.over, 'touchstart', marker.TouchStart.bind(marker));
        Utils.Event.add(marker.over, 'touchend', marker.TouchEnd.bind(marker));
        Utils.Event.add(marker.over, 'click', marker.MarkerClick.bind(marker));
        Utils.Event.add(marker.over, 'mouseover', marker.MarkerOver.bind(marker));
        Utils.Event.add(marker.over, 'mouseout', marker.MarkerOut.bind(marker));
    };

    return MarkerManager;
});