/*global define:true*/

/**
 * Модель региона
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'leaflet', 'noties', 'm/photo/status', 'renderer',
    'text!tpl/admin/region.pug', 'css!style/admin/region', 'css!style/leaflet/leaflet',
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, L, noties, statuses, renderer, pug) {
    'use strict';

    const collator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });
    const regionDef = {
        cid: 0,
        parents: [],
        geo: '',
        pointsnum: 0,
        polynum: { exterior: 0, interior: 0 },
        center: null,
        centerAuto: true,
        bbox: undefined,
        bboxhome: undefined,
        title_en: '',
        title_local: '',
    };

    ko.bindingHandlers.centerInput = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            const $element = $(element);

            setFromObserve(viewModel.region.center());
            subscrObserve();

            $(element)
                .on('focus', function () {
                    if (!viewModel.region.centerAuto()) {
                        viewModel.subscriptions.centerInput.dispose();
                        $(element).on('keyup', function () {
                            let geo = '[' + $element.val() + ']';

                            try {
                                geo = JSON.parse(geo);
                            } catch (err) {
                                console.log(err);
                            }

                            if (Utils.geo.checkLatLng(geo)) {
                                viewModel.centerSet(geo);
                            } else {
                                viewModel.centerValid(false);
                            }
                        });
                    }
                })
                .on('blur', function () {
                    if (!viewModel.region.centerAuto()) {
                        $(element).off('keyup');
                        subscrObserve();
                    }
                });

            function subscrObserve() {
                viewModel.subscriptions.centerInput = viewModel.region.center.subscribe(setFromObserve, viewModel);
            }

            function setFromObserve(val) {
                $element.val(Utils.geo.checkLatLng(val) ? val.join(', ') : '');
            }
        },
    };
    ko.bindingHandlers.bboxhomeInput = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            const $element = $(element);

            setFromObserve(viewModel.region.bboxhome());
            subscrObserve();

            $(element)
                .on('focus', function () {
                    if (!viewModel.bboxAuto()) {
                        viewModel.subscriptions.bboxhomeInput.dispose();
                        $(element).on('keyup', function () {
                            let bbox = '[' + $element.val() + ']';

                            try {
                                bbox = JSON.parse(bbox);
                            } catch (err) {
                                console.log(err);
                            }

                            if (Utils.geo.checkbboxLatLng(bbox)) {
                                viewModel.bboxhomeSet(bbox);
                            } else {
                                viewModel.bboxhomeValid(false);
                            }
                        });
                    }
                })
                .on('blur', function () {
                    if (!viewModel.bboxAuto()) {
                        $(element).off('keyup');
                        subscrObserve();
                    }
                });

            function subscrObserve() {
                viewModel.subscriptions.bboxhomeInput = viewModel.region.bboxhome.subscribe(setFromObserve, viewModel);
            }

            function setFromObserve(val) {
                $element.val(Utils.geo.checkbboxLatLng(val) ? val.join(', ') : '');
            }
        },
    };

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];
            this.createMode = ko.observable(true);
            this.exe = ko.observable(true); //Указывает, что сейчас идет обработка запроса на действие к серверу

            this.showGeo = ko.observable(false);
            this.statuses = statuses;
            this.maxRegionLevel = 5;

            this.region = koMapping.fromJS(regionDef);
            this.haveParent = ko.observable('0');
            this.parentCid = ko.observable(0);
            this.parentCidOrigin = 0;
            this.children = ko.observableArray();
            this.childLenArr = ko.observableArray();
            this.imagesByType = ko.observable(Utils.getLocalStorage('region.imagesStatByType') || false);
            this.imagestat = ko.observableArray();
            this.photostat = ko.observableArray();
            this.paintstat = ko.observableArray();
            this.cstat = ko.observableArray();
            this.childrenExpand = ko.observable(Utils.getLocalStorage('region.childrenExpand') || 0);
            this.geoStringOrigin = null;
            this.geoObj = null;

            this.bboxLBound = null;
            this.bboxhomeLBound = null;
            this.bboxAuto = this.co.bboxAuto = ko.computed({
                read: function () {
                    return !this.region.bboxhome();
                },
                owner: this,
            });

            this.map = null;
            this.markerLayer = L.layerGroup();
            this.layerGeo = null;
            this.layerBBOX = null;
            this.layerBBOXHome = null;

            this.centerValid = ko.observable(true);
            this.bboxhomeValid = ko.observable(true);

            this.mh = ko.observable('300px'); //Высота карты
            this.fDateIn = Utils.format.date.relativeIn;

            this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
            this.routeHandler();
        },
        show: function () {
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
            this.centerMarkerDestroy();
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
        sizesCalc: function (square) {
            this.mapCalc();

            if (square) {
                this.childrenCalc();
            }
        },
        mapCalc: function () {
            const height = P.window.h() - this.$dom.find('.map').offset().top >> 0;

            this.mh(height + 'px');

            if (this.map) {
                //Самостоятельно обновляем размеры карты
                this.map.whenReady(function () {
                    this.map._onResize();
                    this.map.fitBounds(this.bboxLBound);
                }, this);
            }
        },
        childrenCalc: function () {
            if (this.region.parents().length >= this.maxRegionLevel) {
                return;
            }

            const $children = this.$dom.find('.children');
            const childrenExpand = this.childrenExpand();

            if (!childrenExpand && $children[0].scrollWidth > $children.width()) {
                this.childrenExpand(1);
            } else if (childrenExpand && $children[0].scrollWidth <= $children.width()) {
                const $expand = this.$dom.find('.expand');
                let childrenHight = $children.height();

                if (childrenExpand === 2 && $expand.length) {
                    childrenHight -= $expand.height() / 2 + 2;
                }

                if (childrenHight < 30) {
                    this.childrenExpand(0);
                }
            }
        },
        routeHandler: function () {
            this.exe(true);

            let cid = globalVM.router.params().cid;

            if (cid === 'create') {
                this.createMode(true);
                this.resetData();

                if (Number(globalVM.router.params().parent)) {
                    this.parentCid(Number(globalVM.router.params().parent));
                    this.haveParent('1');
                }

                this.createMap();
                this.exe(false);
            } else {
                cid = Number(cid);

                if (!cid) {
                    return globalVM.router.navigate('/admin/region');
                }

                this.createMode(false);
                this.getOneRegion(cid, function () {
                    this.exe(false);
                }, this);
            }
        },
        resetData: function () {
            this.removeLayers();
            this.bboxLBound = null;
            this.bboxhomeLBound = null;

            this.regionOrigin = regionDef;
            koMapping.fromJS(regionDef, this.region);

            this.haveParent('0');
            this.parentCid(0);
            this.children([]);
            this.childLenArr([]);
        },
        removeLayers: function () {
            this.centerMarkerDestroy().bboxhomeLayerDestroy();

            if (this.layerGeo) {
                this.map.removeLayer(this.layerGeo);
                this.layerGeo = null;
            }

            if (this.layerBBOX) {
                this.map.removeLayer(this.layerBBOX);
                this.layerBBOX = null;
            }
        },

        fillData: function (data, needRedraw) {
            const region = data.region;

            this.regionOrigin = region;
            koMapping.fromJS(region, this.region);

            if (region.bbox) {
                this.bboxLBound = [
                    [region.bbox[0], region.bbox[1]],
                    [region.bbox[2], region.bbox[3]],
                ];
            } else {
                this.bboxLBound = null;
            }

            if (Array.isArray(data.children)) {
                data.children.sort(function (a, b) {
                    return collator.compare(a.title, b.title);
                });
            }

            this.children(data.children || []);
            this.childLenArr(data.childLenArr || []);

            if (data.region.parents && data.region.parents.length) {
                this.parentCidOrigin = data.region.parents[data.region.parents.length - 1].cid;
                this.haveParent('1');
            } else {
                this.haveParent('0');
                this.parentCidOrigin = 0;
            }

            this.parentCid(this.parentCidOrigin);

            if (region.geo) {
                this.geoStringOrigin = region.geo;

                try {
                    this.geoObj = JSON.parse(region.geo);
                } catch (err) {
                    console.log(err);
                    noties.error({ message: 'GeoJSON client parse error!<br>' + err.message });
                    this.geoStringOrigin = null;
                    this.geoObj = null;

                    return false;
                }
            }

            const photostat = region.photostat || {};
            const paintstat = region.paintstat || {};
            const imagestat = _.mergeWith(_.cloneDeep(photostat), paintstat, function (photoval, paintval) {
                return (photoval || 0) + (paintval || 0);
            });

            photostat.statuses = _.transform(statuses.keys, function (result, status, key) {
                result.push({ status: status, count: photostat['s' + status] || 0, title: statuses[key].filter_title });
            }, []);
            photostat.icon = 'camera';
            photostat.title = 'Фотографий';
            photostat.linkprefix = '/ps?f=r!' + region.cid + '_t!1';
            this.photostat(photostat);

            paintstat.statuses = _.transform(statuses.keys, function (result, status, key) {
                result.push({ status: status, count: paintstat['s' + status] || 0, title: statuses[key].filter_title });
            }, []);
            paintstat.icon = 'picture';
            paintstat.title = 'Картин';
            paintstat.linkprefix = '/ps?f=r!' + region.cid + '_t!2';
            this.paintstat(paintstat);

            imagestat.statuses = _.transform(statuses.keys, function (result, status, key) {
                result.push({ status: status, count: imagestat['s' + status] || 0, title: statuses[key].filter_title });
            }, []);
            imagestat.icon = 'camera';
            imagestat.title = 'Изображений';

            if (paintstat.all) {
                imagestat.alterAll = globalVM.intl.num(imagestat.all) + ' (' + globalVM.intl.num(paintstat.all) + ' картин)';
            }

            imagestat.linkprefix = '/ps?f=r!' + region.cid;
            this.imagestat(imagestat);

            const cstat = region.cstat || {};

            cstat.statuses = _.transform(statuses.keys, function (result, status, key) {
                if (_.isNumber(cstat['s' + status])) {
                    result.push({ status: status, count: cstat['s' + status], title: statuses[key].filter_title });
                }
            }, []);
            this.cstat(cstat);

            imagestat.cid = photostat.cid = paintstat.cid = cstat.cid = region.cid;

            if (needRedraw) {
                this.drawData();
            }

            this.childrenCalc();

            return true;
        },
        drawData: function () {
            const mapInit = !this.map;

            this.createMap();
            this.removeLayers();

            this.map.whenReady(function () {
                const addLayers = function () {
                    if (this.bboxLBound) {
                        this.layerBBOX = L.rectangle(this.bboxLBound,
                            { color: '#F70', weight: 1, opacity: 0.9, fillOpacity: 0.1, clickable: false }
                        ).addTo(this.map);
                    }

                    if (this.geoObj) {
                        this.layerGeo = L.geoJson(this.geoObj, {
                            style: { color: '#F00', weight: 2, opacity: 0.8, clickable: false },
                        }).addTo(this.map);
                    }

                    if (this.region.bboxhome()) {
                        this.bboxhomeSet(this.region.bboxhome());
                    }

                    this.centerMarkerCreate();
                }.bind(this);

                if (mapInit) {
                    addLayers();
                } else {
                    this.map.fitBounds(this.bboxLBound);
                    window.setTimeout(addLayers, 500); //Рисуем после анимации fitBounds
                }
            }, this);
        },
        createMap: function () {
            //Bind и show должны вызываться перед созданием карты для правильно расчета её высоты
            this.makeBinding();

            if (this.map) {
                return;
            }

            this.map = new L.Map(this.$dom.find('.map')[0], {
                center: [36, -25],
                zoom: 3,
                minZoom: 2,
                maxZoom: 16,
                trackResize: false,
            });

            if (this.bboxLBound) {
                this.map.fitBounds(this.bboxLBound);
            }

            this.map
                .addLayer(this.markerLayer)
                .on('click', function (e) {
                    const geo = Utils.geo.geoToPrecision([e.latlng.lat, e.latlng.lng]);

                    this.centerSet(geo);
                    this.region.centerAuto(false);
                }, this);

            L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 15 }).addTo(this.map);
        },
        //Создание маркера центра региона
        centerMarkerCreate: function () {
            const _this = this;

            this.centerMarker = L.marker(this.region.center(),
                {
                    draggable: true,
                    title: 'Центр региона',
                    icon: L.icon({
                        iconSize: [26, 43],
                        iconAnchor: [13, 36],
                        iconUrl: '/img/map/pinEdit.png',
                        className: 'centerMarker',
                    }),
                })
                .on('dragstart', function () {
                    _this.region.centerAuto(false);
                    _this.centerValid(true);
                })
                .on('drag', function () {
                    _this.region.center(Utils.geo.geoToPrecision(Utils.geo.latlngToArr(this.getLatLng())));
                })
                .addTo(this.markerLayer);

            return this;
        },
        //Удаление маркера центра
        centerMarkerDestroy: function () {
            if (this.centerMarker) {
                this.centerMarker.off('dragend');
                this.markerLayer.removeLayer(this.centerMarker);
                delete this.centerMarker;
            }

            return this;
        },
        centerSet: function (geo) {
            this.region.center(geo);
            this.centerValid(true);

            if (this.centerMarker) {
                this.centerMarker.setLatLng(geo);
            } else {
                this.centerMarkerCreate();
            }
        },
        //Переключаем задание центра Авто/Вручную
        centerAutoToggle: function () {
            const newCenterAuto = !this.region.centerAuto();

            this.region.centerAuto(newCenterAuto);

            if (newCenterAuto) {
                //Если ставим Авто, то возвращаем оригинальное значение центра
                this.region.center(this.regionOrigin.center || null);
                this.centerValid(true);

                if (this.regionOrigin.center) {
                    //Если есть предрасчитанный центр, то ставим маркер в него
                    this.centerMarker.setLatLng(this.regionOrigin.center);
                } else {
                    //Если в оригинале центр еще не расчитан (регион новый), то удаляем маркер
                    this.centerMarkerDestroy();
                }
            }
        },
        childrenExpandToggle: function () {
            if (this.childrenExpand()) {
                this.childrenExpand(this.childrenExpand() === 1 ? 2 : 1);
                this.mapCalc();
                Utils.setLocalStorage('region.childrenExpand', this.childrenExpand());
            }
        },
        toggleGeo: function () {
            this.showGeo(!this.showGeo());
            this.mapCalc();
        },
        toggleImagesStatType: function () {
            this.imagesByType(!this.imagesByType());
            Utils.setLocalStorage('region.imagesStatByType', this.imagesByType());
        },

        //Создание прямоугольника bboxhome
        bboxhomeLayerCreate: function () {
            this.layerBBOXHome = L.rectangle(this.bboxhomeLBound,
                {
                    color: '#070',
                    weight: 1,
                    dashArray: [5, 3],
                    opacity: 1,
                    fillColor: '#F70',
                    fillOpacity: 0.1,
                    clickable: false,
                }
            ).addTo(this.map);

            return this;
        },
        //Удаление прямоугольника bboxhome
        bboxhomeLayerDestroy: function () {
            if (this.layerBBOXHome) {
                this.map.removeLayer(this.layerBBOXHome);
                this.layerBBOXHome = null;
            }

            return this;
        },
        bboxhomeSet: function (bbox) {
            if (bbox[1] < -180) {
                bbox[1] += 360;
            } else if (bbox[1] > 180) {
                bbox[1] -= 360;
            }

            if (bbox[3] < -180) {
                bbox[3] += 360;
            } else if (bbox[3] > 180) {
                bbox[3] -= 360;
            }

            this.region.bboxhome(bbox);
            this.bboxhomeLBound = [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[3]],
            ];
            this.bboxhomeValid(true);

            if (this.layerBBOXHome) {
                this.layerBBOXHome.setBounds(this.bboxhomeLBound);
            } else {
                this.bboxhomeLayerCreate();
            }
        },
        bboxhomeUnSet: function () {
            this.bboxhomeLayerDestroy();
            this.region.bboxhome(undefined);
            this.bboxhomeLBound = null;
        },
        //Переключаем вид домашнего положения bbox
        bboxHomeToggle: function () {
            if (this.bboxAuto()) {
                //Если было оригинальное значение, возвращаем его. Если его не было нет - значение bbox
                //Если нет и bbox(режим создания), то берем ученьшенный bounds экрана карты
                this.bboxhomeSet(this.regionOrigin.bboxhome || this.region.bbox() || Utils.geo.bboxReverse(this.map.getBounds().pad(-0.2).toBBoxString().split(',')).map(Utils.math.toPrecision6));
            } else {
                this.bboxhomeUnSet();
            }
        },

        getOneRegion: function (cid, cb, ctx) {
            socket.run('region.give', { cid: cid }, true)
                .then(function (data) {
                    // Выборке региона подставляем дефолтные значения
                    _.defaults(data.region, regionDef);

                    const error = !this.fillData(data, true);

                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, data, error);
                    }
                }.bind(this));
        },
        save: function () {
            if (this.exe()) {
                return false;
            }

            const saveData = koMapping.toJS(this.region);
            let needRedraw;
            let parentIsChanged;

            if (!saveData.geo) {
                noties.alert({
                    message: 'GeoJSON обязателен!',
                    type: 'warning',
                    timeout: 2000,
                });

                return false;
            }

            if (saveData.geo === this.geoStringOrigin) {
                delete saveData.geo;
            }

            if (!saveData.title_en) {
                noties.alert({
                    message: 'Нужно заполнить английское название',
                    type: 'warning',
                    timeout: 2000,
                });

                return false;
            }

            if (!saveData.bboxhome && this.regionOrigin.bboxhome) {
                saveData.bboxhome = null; //Если bboxhome был и ставим auto, то надо передать на сервер null, чтобы обнулить его
            }

            //Перерисовка будет нужна, если изменился geojson(сл-во и bbox) или расчет центра поставили auto
            needRedraw = !!saveData.geo || saveData.centerAuto && !this.regionOrigin.centerAuto;

            if (this.haveParent() === '1') {
                saveData.parent = Number(this.parentCid());

                if (!saveData.parent) {
                    noties.alert({
                        message: 'Если уровень региона ниже Страны, необходимо указать номер родительского региона!',
                        type: 'warning',
                        timeout: 5000,
                        ok: true,
                    });

                    return false;
                }
            } else {
                saveData.parent = 0;
            }

            if (!this.createMode() && saveData.parent !== this.parentCidOrigin) {
                parentIsChanged = true;
                this.changeParentWarn(function (confirmer) {
                    if (confirmer) {
                        processSave.call(this, confirmer);
                    }
                }, this);
            } else {
                processSave.call(this);
            }

            function processSave(confirmer) {
                this.exe(true);
                this.sendSave(saveData, needRedraw, function (data, error) {
                    const resultStat = data && data.resultStat;

                    if (confirmer) {
                        confirmer.close();
                    }

                    if (!error) {
                        let msg = 'Регион <b>' + this.region.title_local() + '</b> успешно ' + (parentIsChanged ? 'перенесён и ' : '') + 'сохранен<br>';
                        let geoChangePhotosCount;

                        if (resultStat && Object.keys(resultStat).length) {
                            if (typeof resultStat.photosCountBefore === 'number' && typeof resultStat.photosCountAfter === 'number') {
                                geoChangePhotosCount = resultStat.photosCountAfter - resultStat.photosCountBefore;

                                if (geoChangePhotosCount) {
                                    msg += '<br><b>' + Math.abs(geoChangePhotosCount) + '</b> фотографий ' + (geoChangePhotosCount > 0 ? 'добавлено в регион' : 'удалено из региона') + ' вследствии изменения коордиант поолигона.';
                                }
                            }

                            if (typeof resultStat.commentsCountBefore === 'number' && typeof resultStat.commentsCountAfter === 'number') {
                                geoChangePhotosCount = resultStat.commentsCountAfter - resultStat.commentsCountBefore;

                                if (geoChangePhotosCount) {
                                    msg += '<br><b>' + Math.abs(geoChangePhotosCount) + '</b> комментариев ' + (geoChangePhotosCount > 0 ? 'добавлено в регион' : 'удалено из региона') + ' вследствии переноса фотографий.';
                                }
                            }

                            if (resultStat.affectedPhotos) {
                                msg += '<br><b>' + resultStat.affectedPhotos + '</b> фотографий переехали по дереву вслед за регионом.';
                            }

                            if (resultStat.affectedComments) {
                                msg += '<br><b>' + resultStat.affectedComments + '</b> комментариев переехали вслед за своими фотографиями.';
                            }

                            if (resultStat.affectedUsers) {
                                msg += '<br>У <b>' + resultStat.affectedUsers + '</b> пользователей были сокрашены "Мои регионы".';
                            }

                            if (resultStat.affectedMods) {
                                msg += '<br>У <b>' + resultStat.affectedMods + '</b> модераторов были сокрашены модерируемые регионы.';
                            }
                        }

                        noties.alert({
                            message: msg,
                            type: 'alert',
                            ok: true,
                        });
                    }

                    this.exe(false);
                }, this);
            }

            return false;
        },
        sendSave: function (saveData, needRedraw, cb, ctx) {
            socket.run('region.save', saveData)
                .then(function (data) {
                    this.region.pointsnum(data.region.pointsnum);

                    if (this.createMode()) {
                        //Если регион успешно создан, но переходим на его cid, и через роутер он нарисуется
                        globalVM.router.navigate('/admin/region/' + data.region.cid);
                    } else {
                        this.fillData(data, needRedraw);
                    }

                    cb.call(ctx, data);
                }.bind(this))
                .catch(function (error) {
                    if (error.code === 'REGION_GEOJSON_PARSE') {
                        error.message += '<br/>' + _.get(error, 'details.why');
                    }

                    noties.error(error);
                    cb.call(ctx, null, error);
                });
        },
        remove: function () {
            if (this.exe()) {
                return false;
            }

            this.exe(true);

            const cid = this.region.cid();
            const title = this.region.title_local();
            let regionParent;
            const that = this;
            const childLenArr = this.childLenArr();
            let msg = 'Регион <b>' + title + '</b> будет удален<br>';

            if (childLenArr.length) {
                msg += '<br>Также будут удалено <b>' +
                    childLenArr.reduce(function (previousValue, currentValue) {
                        return previousValue + currentValue;
                    }) + '</b> дочерних регионов<br>';
            }

            msg += 'Все объекты, входящие в этот регион и в дочерние, ';

            if (!this.region.parents().length) {
                msg += 'будут присвоены <b>Открытому морю</b><br>';
            } else {
                regionParent = _.last(this.region.parents());
                msg += 'остануться в вышестоящем регионе <b>' + regionParent.title_local() + '</b><br>';
            }

            msg += '<br>Это может занять несколько минут. Подтверждаете?<br>' +
                '<small><i>Операция продолжит выполняться даже при закрытии браузера</i></small>';

            noties.confirm({
                message: msg,
                okText: 'Да',
                onOk: function (confirmer) {
                    confirmer.close();

                    noties.confirm({
                        message: 'Изменения будут необратимы.<br>' +
                        'Вы действительно хотите удалить регион <b>' + title + '</b>?',
                        okText: 'Да',
                        onOk: function (confirmer) {
                            confirmer.disable();

                            socket.run('region.remove', { cid: cid })
                                .then(function (data) {
                                    msg = 'Регион <b>' + title + '</b> успешно удалён<br>';

                                    if (data.affectedPhotos) {
                                        msg += '<b>' + data.affectedPhotos + '</b> ' +
                                            'фотографий сменили региональную принадлежность.<br>';
                                    }

                                    if (data.affectedComments) {
                                        msg += '<b>' + data.affectedComments + '</b> ' +
                                            'комментариев сменили региональную принадлежность вслед за своими фотографиями.<br>';
                                    }

                                    if (data.homeAffectedUsers) {
                                        msg += 'У <b>' + data.homeAffectedUsers + '</b> ' +
                                            'пользователей домашние регионы были заменены на ' +
                                            data.homeReplacedWith.title_en + ' (номер ' + data.homeReplacedWith.cid + ').<br>';
                                    }

                                    if (data.affectedUsers) {
                                        msg += 'У <b>' + data.affectedUsers + '</b> ' +
                                            'пользователей были сокрашены "Мои регионы".<br>';
                                    }

                                    if (data.affectedMods) {
                                        msg += 'У <b>' + data.affectedMods + '</b> ' +
                                            'модераторов были сокрашены модерируемые регионы.';

                                        if (data.affectedModsLose) {
                                            msg += 'Из них <b>' + data.affectedModsLose + '</b> ' +
                                                'пользователей лишились роли модератора.';
                                        }

                                        msg += '<br>';
                                    }

                                    confirmer.success(msg, 'Ok', null, function () {
                                        let href = '/admin/region';

                                        if (regionParent) {
                                            href += '?hl=' + regionParent.cid();
                                        }

                                        document.location.href = href;
                                    });
                                })
                                .catch(function (error) {
                                    console.error(error);
                                    confirmer.error(error, 'Закрыть', null, function () {
                                        that.exe(false);
                                    });
                                });
                        },
                        cancelText: 'Нет',
                        cancelClass: 'btn-success',
                        onCancel: function () {
                            that.exe(false);
                        },
                    });
                },
                cancelText: 'Отмена',
                onCancel: function () {
                    that.exe(false);
                },
            });

            return false;
        },

        recalcStats: function () {
            if (this.exe()) {
                return false;
            }

            this.exe(true);

            const that = this;
            const cid = this.region.cid();
            const title = this.region.title_local();

            socket.run('region.recalcStatistics', { cids: [cid] })
                .then(function (data) {
                    let msg;

                    if (data.running) {
                        msg = 'В данный момент статистика пересчитывается по всем регионам';
                    } else {
                        msg = 'Статистика по региону ' + title + ' пересчитана<br>';

                        if (data.valuesChanged) {
                            msg += '<b>' + globalVM.intl.num(data.valuesChanged) + '</b> значений было изменено';
                        } else {
                            msg += 'Значения не изменились';
                        }
                    }

                    noties.alert({
                        message: msg,
                        ok: true,
                        text: 'Закрыть',
                        countdown: 10,
                        onOk: function () {
                            that.getOneRegion(cid, function () {
                                that.exe(false);
                            });
                        },
                    });
                })
                .catch(function (error) {
                    that.exe(false);
                    noties.error(error);
                });
        },

        changeParentWarn: function (cb, ctx) {
            let msg = 'Вы хотите поменять положение региона в иерархии.';
            const childLenArr = this.childLenArr();

            if (childLenArr.length) {
                msg += '<br>При этом также будут перенесены <b>' +
                    childLenArr.reduce(function (previousValue, currentValue) {
                        return previousValue + currentValue;
                    }) + '</b> дочерних регионов<br>';
            }

            msg += '<br>У пользователей, одновременно подписанных на переносимые регионы и их новые родительские, ' +
                'подписка на переносимые будет удалена, т.к. подписка родительских включает и дочерние регионы. ' +
                'То же касается региональных модераторских прав.';
            msg += '<br>Это может занять несколько минут. Подтверждаете?<br>' +
                '<small><i>Операция продолжит выполняться даже при закрытии браузера</i></small>';

            noties.confirm({
                message: msg,
                okText: 'Да',
                okClass: 'btn-warning',
                onOk: function (confirmer) {
                    confirmer.disable();
                    cb.call(ctx, confirmer);
                },
                cancelText: 'Нет',
                cancelClass: 'btn-success',
                onCancel: function () {
                    cb.call(ctx, false);
                },
            });
        },

        addFeatures: function () {
            if (!this.regfiVM) {
                renderer(
                    [
                        {
                            module: 'm/admin/regionFeatureInsert',
                            options: {
                                cid: this.region.cid(),
                            },
                            modal: {
                                topic: 'Вставка FeatureCollection',
                                initWidth: '950px',
                                maxWidthRatio: 0.95,
                                fullHeight: true,
                                withScroll: true,
                                offIcon: { text: 'Закрыть', click: this.closeFeatures, ctx: this },
                                btns: [{ css: 'btn-primary', text: 'Закрыть', click: this.closeFeatures, ctx: this }],
                            },
                            callback: function (vm) {
                                this.regfiVM = vm;
                                this.childModules[vm.id] = vm;
                            }.bind(this),
                        },
                    ],
                    {
                        parent: this,
                        level: this.level + 3, //Чтобы не удалился модуль карты
                    }
                );
            }
        },

        closeFeatures: function () {
            if (this.regfiVM) {
                this.routeHandler();
                this.regfiVM.destroy();
                delete this.regfiVM;
            }
        },
    });
});
