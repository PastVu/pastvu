/*global define:true*/

/**
 * Модель региона
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'leaflet', 'noties', 'm/photo/status',
    'text!tpl/admin/region.jade', 'css!style/admin/region', 'css!style/leaflet/leaflet'
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, L, noties, statuses, jade) {
    'use strict';

    var regionDef = {
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
        title_local: ''
    };

    ko.bindingHandlers.centerInput = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            var $element = $(element);

            setFromObserve(viewModel.region.center());
            subscrObserve();

            $(element)
                .on('focus', function () {
                    if (!viewModel.region.centerAuto()) {
                        viewModel.subscriptions.centerInput.dispose();
                        $(element).on('keyup', function () {
                            var geo = '[' + $element.val() + ']';
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
        }
    };
    ko.bindingHandlers.bboxhomeInput = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            var $element = $(element);

            setFromObserve(viewModel.region.bboxhome());
            subscrObserve();

            $(element)
                .on('focus', function () {
                    if (!viewModel.bboxAuto()) {
                        viewModel.subscriptions.bboxhomeInput.dispose();
                        $(element).on('keyup', function () {
                            var bbox = '[' + $element.val() + ']';
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
        }
    };

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];
            this.formatNum = Utils.format.numberByThousands; //Передаем функцию форматирования числа в шаблон
            this.createMode = ko.observable(true);
            this.exe = ko.observable(true); //Указывает, что сейчас идет обработка запроса на действие к серверу

            this.showGeo = ko.observable(false);
            this.statuses = statuses;

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
                owner: this
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
            var height = P.window.h() - this.$dom.find('.map').offset().top >> 0;

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
            var $children = this.$dom.find('.children');
            var childrenExpand = this.childrenExpand();

            if (!childrenExpand && $children[0].scrollWidth > $children.width()) {
                this.childrenExpand(1);
            } else if (childrenExpand && $children[0].scrollWidth <= $children.width() && $children.height() < 30) {
                this.childrenExpand(0);
            }
        },
        routeHandler: function () {
            this.exe(true);
            var cid = globalVM.router.params().cid;

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
            var region = data.region;

            this.regionOrigin = region;
            koMapping.fromJS(region, this.region);

            if (region.bbox) {
                this.bboxLBound = [
                    [region.bbox[0], region.bbox[1]],
                    [region.bbox[2], region.bbox[3]]
                ];
            } else {
                this.bboxLBound = null;
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
                    noties.error({ message: 'GeoJSON client parse error!\n' + err.message });
                    this.geoStringOrigin = null;
                    this.geoObj = null;
                    return false;
                }
            }

            var photostat = region.photostat;
            var paintstat = region.paintstat;
            var imagestat = _.mergeWith(_.cloneDeep(photostat), paintstat, function (photoval, paintval) {
                return (photoval || 0) + (paintval || 0);
            });

            photostat.statuses = _.transform(statuses.keys, function (result, status, key) {
                result.push({ status: status, count: photostat['s' + status] || 0, title: statuses[key].filter_title });
            }, []);
            photostat.icon = 'camera';
            photostat.title = 'Photos';
            photostat.linkprefix = '/ps?f=r!' + region.cid + '_t!1';
            this.photostat(photostat);

            paintstat.statuses = _.transform(statuses.keys, function (result, status, key) {
                result.push({ status: status, count: paintstat['s' + status] || 0, title: statuses[key].filter_title });
            }, []);
            paintstat.icon = 'picture';
            paintstat.title = 'Paintings';
            paintstat.linkprefix = '/ps?f=r!' + region.cid + '_t!2';
            this.paintstat(paintstat);

            imagestat.statuses = _.transform(statuses.keys, function (result, status, key) {
                result.push({ status: status, count: imagestat['s' + status] || 0, title: statuses[key].filter_title });
            }, []);
            imagestat.icon = 'camera';
            imagestat.title = 'Images';
            if (paintstat.all) {
                imagestat.alterAll = imagestat.all + ' (' + paintstat.all + ' картин)';
            }
            imagestat.linkprefix = '/ps?f=r!' + region.cid;
            this.imagestat(imagestat);

            var cstat = region.cstat;
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
            var mapInit = !this.map;

            this.createMap();
            this.removeLayers();

            this.map.whenReady(function () {
                var addLayers = function () {
                    if (this.bboxLBound) {
                        this.layerBBOX = L.rectangle(this.bboxLBound,
                            { color: '#F70', weight: 1, opacity: 0.9, fillOpacity: 0.1, clickable: false }
                        ).addTo(this.map);
                    }

                    if (this.geoObj) {
                        this.layerGeo = L.geoJson(this.geoObj, {
                            style: { color: '#F00', weight: 2, opacity: 0.8, clickable: false }
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
                maxZoom: 15,
                trackResize: false
            });
            if (this.bboxLBound) {
                this.map.fitBounds(this.bboxLBound);
            }

            this.map
                .addLayer(this.markerLayer)
                .on('click', function (e) {
                    var geo = Utils.geo.geoToPrecision([e.latlng.lat, e.latlng.lng]);

                    this.centerSet(geo);
                    this.region.centerAuto(false);
                }, this);

            L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 15 }).addTo(this.map);
        },
        //Создание маркера центра региона
        centerMarkerCreate: function () {
            var _this = this;
            this.centerMarker = L.marker(this.region.center(),
                {
                    draggable: true,
                    title: 'Center of the region',
                    icon: L.icon({
                        iconSize: [26, 43],
                        iconAnchor: [13, 36],
                        iconUrl: '/img/map/pinEdit.png',
                        className: 'centerMarker'
                    })
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
            var newCenterAuto = !this.region.centerAuto();
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
                    clickable: false
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
                [bbox[2], bbox[3]]
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
                    var error = !this.fillData(data, true);

                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, data, error);
                    }
                }.bind(this));
        },
        save: function () {
            if (this.exe()) {
                return false;
            }

            var saveData = koMapping.toJS(this.region);
            var needRedraw;
            var parentIsChanged;

            if (!saveData.geo) {
                noties.alert({
                    message: 'GeoJSON is required!',
                    type: 'warning',
                    timeout: 2000
                });
                return false;
            }
            if (saveData.geo === this.geoStringOrigin) {
                delete saveData.geo;
            }

            if (!saveData.title_en) {
                noties.alert({
                    message: 'It is necessary to fill in English name',
                    type: 'warning',
                    timeout: 2000
                });
                return false;
            }

            if (!saveData.bboxhome && this.regionOrigin.bboxhome) {
                saveData.bboxhome = null; //Если bboxhome был и ставим auto, то надо передать на сервер null, чтобы обнулить его
            }

            //Перерисовка будет нужна, если изменился geojson(сл-во и bbox) или расчет центра поставили auto
            needRedraw = !!saveData.geo || (saveData.centerAuto && !this.regionOrigin.centerAuto);

            if (this.haveParent() === '1') {
                saveData.parent = Number(this.parentCid());
                if (!saveData.parent) {
                    noties.alert({
                        message: 'If the level is below the country level, you must specify the id of the parent region!',
                        type: 'warning',
                        timeout: 5000,
                        ok: true
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
                    var resultStat = data && data.resultStat;

                    if (confirmer) {
                        confirmer.close();
                    }

                    if (!error) {
                        var msg = 'Region <b>' + this.region.title_en() + '</b> has been successfully ' + (parentIsChanged ? 'transferred and ' : '') + 'saved<br>';
                        var geoChangePhotosCount;

                        if (resultStat && Object.keys(resultStat).length) {
                            if (typeof resultStat.photosCountBefore === 'number' && typeof resultStat.photosCountAfter === 'number') {
                                geoChangePhotosCount = resultStat.photosCountAfter - resultStat.photosCountBefore;

                                if (geoChangePhotosCount) {
                                    msg += '<br><b>' + Math.abs(geoChangePhotosCount) + '</b> photos are ' + (geoChangePhotosCount > 0 ? 'added to the region' : 'removed from the region') + ' because of polygon coordinates changing.';
                                }
                            }
                            if (typeof resultStat.commentsCountBefore === 'number' && typeof resultStat.commentsCountAfter === 'number') {
                                geoChangePhotosCount = resultStat.commentsCountAfter - resultStat.commentsCountBefore;

                                if (geoChangePhotosCount) {
                                    msg += '<br><b>' + Math.abs(geoChangePhotosCount) + '</b> comments are ' + (geoChangePhotosCount > 0 ? 'added to the region' : 'removed from the region') + ' because of photos transfer.';
                                }
                            }
                            if (resultStat.affectedPhotos) {
                                msg += '<br><b>' + resultStat.affectedPhotos + '</b> photos have been moved following the region.';
                            }
                            if (resultStat.affectedComments) {
                                msg += '<br><b>' + resultStat.affectedComments + '</b> comments have been moved following their photos. ';
                            }
                            if (resultStat.affectedUsers) {
                                msg += '<br><b>' + resultStat.affectedUsers + '</b> users have been reduced in "my regions" count.';
                            }
                            if (resultStat.affectedMods) {
                                msg += '<br><b>' + resultStat.affectedMods + '</b> moderators have been reduced moderators regions.';
                            }
                        }
                        noties.alert({
                            message: msg,
                            type: 'alert',
                            ok: true
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

            var cid = this.region.cid();
            var title = this.region.title_en();
            var regionParent;
            var that = this;
            var childLenArr = this.childLenArr();
            var msg = 'Регион <b>' + title + '</b> будет удален<br>';

            if (childLenArr.length) {
                msg += '<br>Also <b>' +
                    childLenArr.reduce(function (previousValue, currentValue) {
                        return previousValue + currentValue;
                    }) + '</b> children regions will be removed<br>';
            }
            msg += 'All objects within the region and it children, ';
            if (!this.region.parents().length) {
                msg += 'will be assigned to the <b>Open sea</b><br>';
            } else {
                regionParent = _.last(this.region.parents());
                msg += 'will remain in upper region <b>' + regionParent.title_en() + '</b><br>';
            }
            msg += '<br>It may take a few minutes. Confirm?<br>' +
                '<small><i>The operation continues to run even if you close your browser</i></small>';

            noties.confirm({
                message: msg,
                okText: 'Yes',
                onOk: function (confirmer) {
                    confirmer.close();

                    noties.confirm({
                        message: 'The changes will be irreversible.<br>Are you sure you want to delete the region ' +
                        '<b>' + title + '</b>?',
                        okText: 'Yes',
                        onOk: function (confirmer) {
                            confirmer.disable();

                            socket.run('region.remove', { cid: cid })
                                .then(function (data) {
                                    msg = 'Region <b>' + title + '</b> removed successfully<br>';
                                    if (data.affectedPhotos) {
                                        msg += '<b>' + data.affectedPhotos + '</b> ' +
                                            'photo have been changed their regions.<br>';
                                    }
                                    if (data.affectedComments) {
                                        msg += '<b>' + data.affectedComments + '</b> ' +
                                            'comments have been moved following their photos.<br>';
                                    }
                                    if (data.homeAffectedUsers) {
                                        msg += '<b>' + data.homeAffectedUsers + '</b> ' +
                                            'users chenged theire home regions to ' + data.homeReplacedWith.title_en +
                                            ' (id ' + data.homeReplacedWith.cid + ').<br>';
                                    }
                                    if (data.affectedUsers) {
                                        msg += '<b>' + data.affectedUsers + '</b> ' +
                                            'users have been reduced in "my regions" count.<br>';
                                    }
                                    if (data.affectedMods) {
                                        msg += '<b>' + data.affectedMods + '</b> ' +
                                            'moderators have been reduced moderators regions.';
                                        if (data.affectedModsLose) {
                                            msg += '<b>' + data.affectedModsLose + '</b> ' +
                                                'of them lost moderation status.';
                                        }
                                        msg += '<br>';
                                    }

                                    confirmer.success(msg, 'Ok', null, function () {
                                        var href = '/admin/region';
                                        if (regionParent) {
                                            href += '?hl=' + regionParent.cid();
                                        }
                                        document.location.href = href;
                                    });
                                })
                                .catch(function (error) {
                                    console.error(error);
                                    confirmer.error(error, 'Close', null, function () {
                                        that.exe(false);
                                    });
                                });

                        },
                        cancelText: 'No',
                        canceClass: 'btn-success',
                        onCancel: function () {
                            that.exe(false);
                        }
                    });
                },
                cancelText: 'Cancel',
                onCancel: function () {
                    that.exe(false);
                }
            });

            return false;
        },
        changeParentWarn: function (cb, ctx) {
            var msg = 'You want to change the position of the region in the hierarchy.';
            var childLenArr = this.childLenArr();

            if (childLenArr.length) {
                msg += '<br>Also will be moved <b>' +
                    childLenArr.reduce(function (previousValue, currentValue) {
                        return previousValue + currentValue;
                    }) + '</b> child regions<br>';
            }
            msg += '<br>Users, who signed on moved regions and their new parents, ' +
                'subscription on moved will be removed, because subscription includes parent and child regions. ' +
                'The same applies to regional moderator permissions.';
            msg += '<br>It may take a few minutes. Confirm?<br>' +
                '<small><i>The operation continues to run even if you close your browser</i></small>';

            noties.confirm({
                message: msg,
                okText: 'Yes',
                okClass: 'btn-warning',
                onOk: function (confirmer) {
                    confirmer.disable();
                    cb.call(ctx, confirmer);
                },
                cancelText: 'No',
                cancelClass: 'btn-success',
                onCancel: function () {
                    cb.call(ctx, false);
                }
            });
        }
    });
});