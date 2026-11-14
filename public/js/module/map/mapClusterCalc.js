/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define([
    'underscore', 'jquery', 'Browser', 'Utils', 'socket!', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'i18n',
    'renderer', 'model/User', 'model/storage', 'leaflet', 'leaflet-extends/L.neoMap', 'noties',
    'text!tpl/map/mapClusterCalc.pug', 'css!style/map/mapClusterCalc', 'jquery-ui/draggable', 'jquery-ui/resizable',
    'jquery-ui/effect-highlight', 'css!style/jquery/ui/core', 'css!style/jquery/ui/resizable', 'css!style/jquery/ui/theme',
], function (_, $, Browser, Utils, socket, P, ko, Cliche, globalVM, i18n, renderer, User, storage, L, Map, noties, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            deferredWhenReady: null, // Deffered wich will be resolved when map ready
        },
        defaults: {
            w: 40,
            h: 40,
        },
        create: function () {
            this.destroy = _.wrap(this.destroy, this.localDestroy);
            this.auth = globalVM.repository['m/common/auth'];

            this.map = null;

            this.exe = ko.observable(false); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.exePercent = ko.observable(0); //Указывает, что сейчас идет обработка запроса на действие к серверу
            this.wCurr = ko.observable(this.defaults.w);
            this.wNew = ko.observable(this.defaults.w);
            this.hCurr = ko.observable(this.defaults.h);
            this.hNew = ko.observable(this.defaults.h);
            this.changed = this.co.changed = ko.computed(function () {
                return this.wCurr() !== this.wNew() || this.hCurr() !== this.hNew();
            }, this);
            // Rebuilding clusters at current size, for photos and/or paintings.
            this.rebuildTypes = [
                { id: 'photos', desc: i18n('Photos'), types: [1] },
                { id: 'paintings', desc: i18n('Paintings'), types: [2] },
                { id: 'both', desc: i18n('Photos and paintings'), types: [1, 2] },
            ];
            this.rebuildType = ko.observable('both');
            this.rebuilding = ko.observable(false);
            this.isDefault = ko.computed(function () {
                return this.wCurr() === this.defaults.w || this.hCurr() === this.defaults.h;
            }, this);

            ko.applyBindings(globalVM, this.$dom[0]);

            socket.run('cluster.getClusterConditions').then(function (data) {
                if (data) {
                    this.wCurr(data.sw);
                    this.hCurr(data.sh);
                    this.wNew(data.sw);
                    this.hNew(data.sh);
                }
            }.bind(this));

            this.show();
        },
        show: function () {
            const _this = this;

            globalVM.func.showContainer(this.$container, function () {
                this.map = new L.NeoMap(this.$dom.find('.map')[0], {
                    center: [55.753395, 37.621994],
                    zoom: 13,
                    minZoom: 3,
                    maxZoom: 18,
                    zoomAnimation: false,
                    trackResize: false,
                });

                // Самостоятельно обновлем размеры карты
                this.subscriptions.sizes = P.window.square.subscribe(function () {
                    this.map._onResize();
                }.bind(this));

                // Cluster sizes are computed in degrees, so any Web Mercator
                // tile layer gives the same result. OSM is all we need here.
                this.map.addLayer(new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    updateWhenIdle: false,
                    attribution: i18n('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'),
                }));

                // Same zoom slider as on the general map.
                renderer(
                    [
                        {
                            module: 'm/map/navSlider',
                            container: '.mapNavigation',
                            options: {
                                map: this.map,
                                minZoom: this.map.getMinZoom(),
                                maxZoom: this.map.getMaxZoom(),
                                canOpen: true,
                            },
                            ctx: this,
                            callback: function (vm) {
                                this.childModules[vm.id] = vm;
                                this.navSliderVM = vm;
                            }.bind(this),
                        },
                    ],
                    {
                        parent: this,
                        level: this.level + 1,
                    }
                );

                this.map.whenReady(function () {
                    if (this.options.deferredWhenReady && Utils.isType('function', this.options.deferredWhenReady.resolve)) {
                        this.options.deferredWhenReady.resolve();
                    }

                    this.$dom.find('.clusterRect').draggable({
                        containment: this.$dom.find('.mapContainer'),
                        scroll: false,
                        cursor: 'move',
                    }).resizable({
                        minHeight: 40,
                        minWidth: 40,
                        maxHeight: 300,
                        maxWidth: 300,
                        aspectRatio: 1,
                        resize: function (event, ui) {
                            _this.wNew(ui.size.width);
                            _this.hNew(ui.size.height);
                        },
                    });
                }, this);
            }, this);

            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        localDestroy: function (destroy) {
            this.hide();
            this.map = null;
            destroy.call(this);
        },
        setDefaults: function () {
            this.wNew(this.defaults.w);
            this.hNew(this.defaults.h);
        },
        save: function () {
            const _this = this;

            const $clusterRect = this.$dom.find('.clusterRect');
            const w = this.wNew();
            const h = this.hNew();
            const pos = $clusterRect.position();

            const centerGeo = this.map.containerPointToLatLng(new L.Point(pos.left + w / 2, pos.top + h / 2));

            const wMap = this.$dom.find('.mapContainer').width();
            const hMap = this.$dom.find('.mapContainer').height();

            const zooms = _.range(3, 16 + 1); // Уровни 3 - 16
            const result = [];

            const setZoom = function (z) {
                if (_this.exe()) {
                    _this.map.setView(centerGeo, z);
                }
            };
            const calcOnZoom = function (z) {
                const rectCenter = _this.map.latLngToContainerPoint(_this.map.getCenter());
                const rectTopLeft = _this.map.containerPointToLatLng(new L.Point(rectCenter.x - w / 2, rectCenter.y - h / 2));
                const rectBottomRight = _this.map.containerPointToLatLng(new L.Point(rectCenter.x + w / 2, rectCenter.y + h / 2));

                return {
                    z: z,
                    w: Utils.math.toPrecision(Math.abs(rectTopLeft.lng - rectBottomRight.lng)),
                    h: Utils.math.toPrecision(Math.abs(rectTopLeft.lat - rectBottomRight.lat)),
                };
            };
            const changeZoomRecursive = _.debounce(function () {
                const z = _this.map.getZoom();

                result.push(calcOnZoom(z));
                this.exePercent(Math.ceil(100 * (zooms.indexOf(z) + 1) / zooms.length)); // Обновляем прогресс-бар подсчета

                if (z === _.last(zooms)) {
                    _this.map.off('moveend', changeZoomRecursive, this);
                    _this.calcDeffered.resolve(result);
                    delete _this.calcDeffered;
                    delete _this.setZoomTimeout;
                } else {
                    $clusterRect.effect('highlight', { color: '#ffffff' }, 400); // Эффект вспышки
                    _this.setZoomTimeout = _.delay(setZoom, 430, z + 1);
                }
            }, 800);

            this.saveParams = {
                sgeo: Utils.geo.geoToPrecision([centerGeo.lng, centerGeo.lat]),
                sz: this.map.getZoom(),
                sw: this.wNew(),
                sh: this.hNew(),
            };
            this.calcDeffered = new $.Deferred();
            // Ставим статус, что идет пересчет
            this.exe(true);
            this.exePercent(0);
            // Ставим прямоугольник по центру
            $clusterRect.css({ left: wMap / 2 - w / 2, top: hMap / 2 - h / 2 });
            // Подписываемся на изменение зума карты
            this.map.on('moveend', changeZoomRecursive, this);
            // Начинаем подсчет
            setZoom(_.head(zooms));
            // По окончании пересчета вызываем функцию отправки данных
            $.when(this.calcDeffered.promise()).done(this.send.bind(this));
        },
        send: function (arr) {
            const _this = this;

            noties.confirm({
                message: i18n('New cluster parameters have been calculated for all {{count}} zoom levels. <br>Send the data to the server to build a new cluster grid for all photos?<br>It may take several minutes', { count: arr.length }),
                okText: i18n('Yes'),
                okClass: 'btn-warning',
                onOk: function (confirmer) {
                    confirmer.disable();

                    socket.run('cluster.recalcAll', { params: arr, conditions: _this.saveParams }, true)
                        .then(function () {
                            if (confirmer) {
                                confirmer.success(i18n('New cluster grid built'), 'Ok', null, function () {
                                    _this.finish();
                                });
                            }
                        })
                        .catch(function () {
                            if (confirmer) {
                                confirmer.close();
                            }

                            _this.cancel();
                        });

                    confirmer.success(
                        i18n('The data has been sent to the server for recalculation.<br>You can close this dialog — the calculation continues server-side.<br>The dialog will update when the server returns the result'), i18n('Close'), null, function () {
                            confirmer = null;
                            _this.finish();
                        });
                },
                onCancel: function () {
                    _this.cancel();
                },
            });
        },
        rebuild: function () {
            const _this = this;
            const rebuildType = _.find(this.rebuildTypes, { id: this.rebuildType() });

            if (!rebuildType || this.rebuilding() || this.exe()) {
                return;
            }

            noties.confirm({
                message: i18n('Rebuild clusters at the current cluster size for image type {{what}}?<br>It may take several minutes', { what: rebuildType.desc.toLowerCase() }),
                okText: i18n('Yes'),
                okClass: 'btn-warning',
                onOk: function (confirmer) {
                    confirmer.disable();
                    _this.rebuilding(true);

                    socket.run('cluster.rebuild', { types: rebuildType.types }, true)
                        .then(function () {
                            if (confirmer) {
                                confirmer.success(i18n('Clusters rebuilt'), 'Ok', null, null);
                            }
                        })
                        .catch(function () {
                            if (confirmer) {
                                confirmer.close();
                            }
                        })
                        .finally(function () {
                            _this.rebuilding(false);
                        });

                    confirmer.success(
                        i18n('The request has been sent to the server.<br>You can close this dialog — the rebuild continues server-side.<br>The dialog will update when the server returns the result'), i18n('Close'), null, function () {
                            confirmer = null;
                        });
                },
            });
        },
        cancel: function () {
            if (this.exe()) {
                this.exe(false);
                this.exePercent(0);
                this.map.off('moveend');
                window.clearTimeout(this.setZoomTimeout);

                if (this.calcDeffered) {
                    this.calcDeffered.reject();
                }

                delete this.calcDeffered;
                delete this.setZoomTimeout;
                delete this.saveParams;
            }

            this.wNew(this.wCurr());
            this.hNew(this.hCurr());
            this.$dom.find('.clusterRect').css({ width: this.wCurr(), height: this.hCurr() });
        },
        finish: function () {
            this.exe(false);
            this.exePercent(0);
            this.wCurr(this.wNew());
            this.hCurr(this.hNew());
            this.$dom.find('.clusterRect').css({ width: this.wCurr(), height: this.hCurr() });
            delete this.saveParams;
        },
    });
});
