/*global define:true*/

/**
 * Модель региона
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'leaflet', 'noties', 'model/storage',
    'text!tpl/admin/region.jade', 'css!style/admin/region', 'css!style/leaflet/leaflet'
], function (_, $, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, L, noties, storage, jade) {
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

            this.region = ko_mapping.fromJS(regionDef);
            this.haveParent = ko.observable('0');
            this.parentCid = ko.observable(0);
            this.parentCidOrigin = 0;
            this.childLenArr = ko.observableArray();
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
        sizesCalc: function () {
            var height = P.window.h() - this.$dom.find('.map').offset().top - 37 >> 0;

            this.mh(height + 'px');
            if (this.map) {
                this.map.whenReady(this.map._onResize, this.map); //Самостоятельно обновляем размеры карты
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
            ko_mapping.fromJS(regionDef, this.region);

            this.haveParent('0');
            this.parentCid(0);
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
            ko_mapping.fromJS(region, this.region);

            if (region.bbox) {
                this.bboxLBound = [
                    [region.bbox[0], region.bbox[1]],
                    [region.bbox[2], region.bbox[3]]
                ];
            } else {
                this.bboxLBound = null;
            }

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
                    window.noty({
                        text: 'GeoJSON client parse error!',
                        type: 'error',
                        layout: 'center',
                        timeout: 3000,
                        force: true
                    });
                    this.geoStringOrigin = null;
                    this.geoObj = null;
                    return false;
                }
            }
            if (needRedraw) {
                this.drawData();
            }

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
                            { color: "#F70", weight: 1, opacity: 0.9, fillOpacity: 0.1, clickable: false }
                        ).addTo(this.map);
                    }

                    if (this.geoObj) {
                        this.layerGeo = L.geoJson(this.geoObj, {
                            style: { color: "#F00", weight: 2, opacity: 0.8, clickable: false }
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

            this.map = new L.map(this.$dom.find('.map')[0], {
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
            this.centerMarker = L.marker(this.region.center(), {
                    draggable: true,
                    title: 'Центр региона',
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

        //Создание прямоугольника bboxhome
        bboxhomeLayerCreate: function () {
            this.layerBBOXHome = L.rectangle(this.bboxhomeLBound,
                {
                    color: "#070",
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
        bboxhomeUnSet: function (bbox) {
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
                    error = !this.fillData(data, true);

                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, data);
                    }
                }, this);
        },
        save: function () {
            if (this.exe()) {
                return false;
            }

            var saveData = ko_mapping.toJS(this.region),
                needRedraw,
                parentIsChanged;

            if (!saveData.geo) {
                window.noty({
                    text: 'GeoJSON обязателен!',
                    type: 'error',
                    layout: 'center',
                    timeout: 2000,
                    force: true
                });
                return false;
            }
            if (saveData.geo === this.geoStringOrigin) {
                delete saveData.geo;
            }

            if (!saveData.title_en) {
                window.noty({
                    text: 'Нужно заполнить английское название',
                    type: 'error',
                    layout: 'center',
                    timeout: 2000,
                    force: true
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
                    window.noty({
                        text: 'Если уровень региона ниже Страны, необходимо указать номер родительского региона!',
                        type: 'error',
                        layout: 'center',
                        timeout: 5000,
                        force: true
                    });
                    return false;
                }
            } else {
                saveData.parent = 0;
            }

            if (!this.createMode() && saveData.parent !== this.parentCidOrigin) {
                parentIsChanged = true;
                this.changeParentWarn(function (confirm) {
                    if (confirm) {
                        processSave(this);
                    }
                }, this);
            } else {
                processSave(this);
            }

            function processSave(ctx) {
                ctx.exe(true);
                ctx.sendSave(saveData, needRedraw, function (data, error) {
                    var resultStat = data && data.resultStat;

                    if (!error) {
                        var msg = 'Регион <b>' + this.region.title_local() + '</b> успешно ' + (parentIsChanged ? 'перенесён и ' : '') + 'сохранен<br>',
                            geoChangePhotosCount;

                        if (resultStat && Object.keys(resultStat).length) {
                            if (typeof resultStat.photosCountBeforeGeo === 'number' && typeof resultStat.photosCountAfterGeo === 'number') {
                                geoChangePhotosCount = resultStat.photosCountAfterGeo - resultStat.photosCountBeforeGeo;

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
                        window.noty({
                            text: msg, type: 'alert', layout: 'center', force: true,
                            buttons: [
                                {
                                    addClass: 'btn btn-primary', text: 'Ok', onClick: function ($noty) {
                                    $noty.close();
                                }
                                }
                            ]
                        });
                    }
                    this.exe(false);
                }, ctx);
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

                    if (Utils.isType('function', cb)) {
                        cb.call(ctx, data);
                    }
                }.bind(this))
                .catch(function (error) {
                    if (error.code === 'REGION_GEOJSON_PARSE') {
                        error.message += '\n' + error.why;
                    }
                    noties.error(error);
                });
        },
        remove: function () {
            if (this.exe()) {
                return false;
            }
            this.exe(true);

            var cid = this.region.cid(),
                title = this.region.title_local(),
                regionParent,
                that = this,
                childLenArr = this.childLenArr(),
                msg = 'Регион <b>' + title + '</b> будет удален<br>';

            if (childLenArr.length) {
                msg += '<br>Также будут удалено <b>' + childLenArr.reduce(function (previousValue, currentValue) {
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
            msg += '<br>Это может занять несколько минут. Подтверждаете?<br><small><i>Операция продолжит выполняться даже при закрытии браузера</i></small>';

            window.noty(
                {
                    text: msg,
                    type: 'confirm',
                    layout: 'center',
                    modal: true,
                    force: true,
                    animation: {
                        open: { height: 'toggle' },
                        close: {},
                        easing: 'swing',
                        speed: 500
                    },
                    buttons: [
                        {
                            addClass: 'btn btn-danger', text: 'Да', onClick: function ($noty) {
                            $noty.close();

                            window.noty(
                                {
                                    text: 'Изменения будут необратимы.<br>Вы действительно хотите удалить регион <b>' + title + '</b>?',
                                    type: 'confirm',
                                    layout: 'center',
                                    modal: true,
                                    force: true,
                                    buttons: [
                                        {
                                            addClass: 'btn btn-danger', text: 'Да', onClick: function ($noty) {
                                            // this = button element
                                            // $noty = $noty element
                                            var okButton = $noty.$buttons.find('button').attr('disabled', true);

                                            socket.run('region.remove', { cid: cid })
                                                .then(function (data) {
                                                    $noty.$buttons.find('.btn-danger').remove();
                                                    okButton.attr('disabled', false).off('click');

                                                    msg = 'Регион <b>' + title + '</b> успешно удалён<br>';
                                                    if (data.affectedPhotos) {
                                                        msg += '<b>' + data.affectedPhotos + '</b> фотографий сменили региональную принадлежность.<br>';
                                                    }
                                                    if (data.affectedComments) {
                                                        msg += '<b>' + data.affectedComments + '</b> комментариев сменили региональную принадлежность вслед за своими фотографиями.<br>';
                                                    }
                                                    if (data.homeAffectedUsers) {
                                                        msg += 'У <b>' + data.homeAffectedUsers + '</b> пользователей домашние регионы были заменены на ' + data.homeReplacedWith.title_en + ' (номер ' + data.homeReplacedWith.cid + ').<br>';
                                                    }
                                                    if (data.affectedUsers) {
                                                        msg += 'У <b>' + data.affectedUsers + '</b> пользователей были сокрашены "Мои регионы".<br>';
                                                    }
                                                    if (data.affectedMods) {
                                                        msg += 'У <b>' + data.affectedMods + '</b> модераторов были сокрашены модерируемые регионы.';
                                                        if (data.affectedModsLose) {
                                                            msg += 'Из них <b>' + data.affectedModsLose + '</b> пользователей лишились роли модератора.';
                                                        }
                                                        msg += '<br>';
                                                    }
                                                    $noty.$message.children().html(msg);

                                                    okButton.text('Ok').on('click', function () {
                                                        var href = '/admin/region';
                                                        if (regionParent) {
                                                            href += '?hl=' + regionParent.cid();
                                                        }
                                                        document.location.href = href;
                                                    });
                                                })
                                                .catch(function (error) {
                                                    $noty.$message.children().html(error.message || 'Error occurred');
                                                    okButton.text('Close').on('click', function () {
                                                        $noty.close();
                                                        that.exe(false);
                                                    });
                                                });

                                        }
                                        },
                                        {
                                            addClass: 'btn btn-success', text: 'Нет', onClick: function ($noty) {
                                            $noty.close();
                                            that.exe(false);
                                        }
                                        }
                                    ]
                                }
                            );
                        }
                        },
                        {
                            addClass: 'btn btn-primary', text: 'Отмена', onClick: function ($noty) {
                            $noty.close();
                            that.exe(false);
                        }
                        }
                    ]
                }
            );
            return false;
        },
        changeParentWarn: function (cb, ctx) {
            var msg = 'Вы хотите поменять положение региона в иерархии.',
                childLenArr = this.childLenArr();

            if (childLenArr.length) {
                msg += '<br>При этом также будут перенесены <b>' + childLenArr.reduce(function (previousValue, currentValue) {
                        return previousValue + currentValue;
                    }) + '</b> дочерних регионов<br>';
            }
            msg += '<br>У пользователей, одновременно подписанных на переносимые регионы и их новые родительские, подписка на переносимые будет удалена, т.к. подписка родительских включает и дочерние регионы. То же касается региональных модераторских прав.';
            msg += '<br>Это может занять несколько минут. Подтверждаете?<br><small><i>Операция продолжит выполняться даже при закрытии браузера</i></small>';

            window.noty(
                {
                    text: msg,
                    type: 'confirm',
                    layout: 'center',
                    modal: true,
                    force: true,
                    buttons: [
                        {
                            addClass: 'btn btn-warning', text: 'Да', onClick: function ($noty) {
                            cb.call(ctx, true);
                            $noty.close();
                        }
                        },
                        {
                            addClass: 'btn btn-success', text: 'Нет', onClick: function ($noty) {
                            cb.call(ctx, false);
                            $noty.close();
                        }
                        }
                    ]
                }
            );
        }
    });
});