/*global define:true*/

/**
 * Модель проверки региона по координате
 */
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'noties', 'leaflet', 'lib/doT',
    'text!tpl/admin/regionCheck.pug', 'css!style/admin/regionCheck', 'css!style/leaflet/leaflet'
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, noties, L, doT, pug) {
    'use strict';

    var $requestGoogle;
    var popupLoadingTpl = doT.template(
        '<table style="text-align: center" border="0" cellspacing="5" cellpadding="0"><tbody>' +
        '<tr><td style="width: 200px;">{{=it.geo}}<hr style="margin: 2px 0 5px;"></td></tr>' +
        '<tr><td><img src="/img/misc/load.gif" style="width: 67px; height: 10px"/></td></tr>' +
        '</tbody></table>'
    );
    var popupTpl = doT.template(
        '<table style="text-align: center;" border="0" cellspacing="5" cellpadding="0"><tbody>' +
        '<tr><td colspan="2">{{=it.geo}}<hr style="margin: 2px 0 5px;"></td></tr>' +
        '<tr style="font-weight: bold;"><td style="min-width:150px;">PastVu</td><td style="min-width:150px;">Google</td></tr>' +
        '<tr><td style="vertical-align: top;">' +
        '{{~it.parr :value:index}}<a target="_blank" href="/admin/region/{{=value.cid}}">{{=value.title_local}}</a><br>{{~}}' +
        '</td><td style="vertical-align: top;">' +
        '{{~it.garr :value:index}}{{=value}}<br>{{~}}' +
        '</td></tr>' +
        '</tbody></table>'
    );

    function to6Precision(number) {
        return ~~(number * 1e+6) / 1e+6;
    }

    return Cliche.extend({
        pug: pug,
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.regions = ko.observableArray();
            this.geo = null;
            this.link = ko.observable('');

            this.mh = ko.observable('300px'); //Высота карты

            ko.applyBindings(globalVM, this.$dom[0]);
            this.show();
        },
        show: function () {
            var passedGeo = globalVM.router.params().g;
            var passedZoom;

            if (passedGeo) {
                passedGeo = passedGeo.split(',').map(function (element) {
                    return parseFloat(element);
                });
                if (Utils.geo.checkLatLng(passedGeo)) {
                    passedZoom = Number(globalVM.router.params().z);
                } else {
                    passedGeo = null;
                }
            }

            globalVM.func.showContainer(this.$container);
            this.showing = true;
            this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
            this.sizesCalc();

            this.map = new L.Map(this.$dom.find('.map')[0], {
                center: passedGeo || [55.751667, 37.617778],
                zoom: passedZoom || 7,
                minZoom: 3,
                maxZoom: 16,
                trackResize: false
            });
            this.pointLayer = L.layerGroup();

            L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 16
            }).addTo(this.map);

            this.map.whenReady(function () {
                this.map
                    .addLayer(this.pointLayer)
                    .on('zoomend', function (/*e*/) {
                        if (this.geo && this.link()) {
                            this.link('?g=' + this.geo[0] + ',' + this.geo[1] + '&z=' + this.map.getZoom());
                        }
                    }, this)
                    .on('click', function (e) {
                        var geo = [to6Precision(e.latlng.lat), to6Precision(e.latlng.lng)];
                        this.goToGeo(geo);
                    }, this);

                if (Utils.geo.checkLatLng(passedGeo)) {
                    this.goToGeo(passedGeo);
                }
            }, this);
        },
        //Пересчитывает размер карты
        sizesCalc: function () {
            var height = P.window.h() - this.$dom.find('.map').offset().top - 37 >> 0;

            this.mh(height + 'px');
            if (this.map) {
                this.map.whenReady(this.map._onResize, this.map); //Самостоятельно обновляем размеры карты
            }
        },
        hide: function () {
            this.updateRegionAbort();
            socket.off('takeRegionsByGeo');
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        inputEnter: function (data, event) {
            if (event.keyCode === 13) {
                this.inputGeo();
            }
            return true;
        },
        inputGeo: function (/*data, event*/) {
            var val = this.$dom.find('input.inputGeo').val();
            var geo = val.split(',').map(function (element) {
                return parseFloat(element);
            });

            if (Utils.geo.checkLatLng(geo)) {
                this.map.panTo(geo);
                this.goToGeo(geo);
            } else {
                noties.alert({
                    message: 'Неверный формат',
                    type: 'warning'
                });
            }
        },
        goToGeo: function (geo) {
            if (this.marker) {
                this.marker.closePopup();
                this.marker.setLatLng(geo);
            } else {
                this.markerCreate(geo);
            }
            this.updateRegion(geo);
        },
        markerCreate: function (geo) {
            this.marker = L.marker(geo,
                {
                    draggable: true,
                    title: 'Точка для проверки региона',
                    icon: L.icon({
                        iconSize: [26, 43],
                        iconAnchor: [13, 36],
                        popupAnchor: [0, -36],
                        iconUrl: '/img/map/pinEdit.png',
                        className: 'pointMarkerEdit'
                    })
                })
                .on('dragstart', function () {
                    this.updateRegionAbort();
                    this.marker.closePopup();
                    this.link('');
                }, this)
                .on('dragend', function () {
                    var latlng = this.marker.getLatLng();
                    this.updateRegion([to6Precision(latlng.lat), to6Precision(latlng.lng)]);
                }, this)
                .bindPopup(L.popup({
                    maxWidth: 500,
                    minWidth: 200,
                    closeButton: false,
                    offset: new L.Point(0, 60),
                    autoPanPadding: new L.Point(5, 5)
                }))
                .addTo(this.pointLayer);
        },
        updateRegionAbort: function () {
            if (this.ownRegionsDeffered) {
                this.ownRegionsDeffered.reject();
                this.ownRegionsDeffered = null;
            }
            if (this.googRegionsDeffered) {
                this.googRegionsDeffered.reject();
                this.googRegionsDeffered = null;
            }
            if ($requestGoogle) {
                $requestGoogle.abort();
                $requestGoogle = null;
            }
        },
        updateRegion: function (geo) {
            //Если уже ожидаются запросы - отменяем их
            this.updateRegionAbort();

            var tplObj = {
                geo: geo[0] + ' , ' + geo[1],
                parr: [],
                garr: []
            };

            //Сразу показываем маркер загрузки регионов
            this.marker.setPopupContent(popupLoadingTpl({ geo: tplObj.geo })).openPopup();
            this.link('?g=' + geo[0] + ',' + geo[1] + '&z=' + this.map.getZoom());
            this.geo = geo;

            //Так как $.when дожидается исполнения обоих событий только если они оба успешные
            //(если какой-то fail, то when выстрелит сразу и один раз),
            //то надо создать свои deffered, которые резолвить по окончанию обоих запросов (независимо от их итогового статуса),
            //а в случае повторного запроса реджектить.
            //Тогда нижележащий $.when.done выстрелит гарантированно по окончанию обоих запросов
            //и не выстрелит, если мы сами их отменим
            this.ownRegionsDeffered = new $.Deferred();
            this.googRegionsDeffered = new $.Deferred();
            this.ownRegionsDeffered.always(function () {
                this.ownRegionsDeffered = null;
            }.bind(this));
            this.googRegionsDeffered.always(function () {
                this.googRegionsDeffered = null;
            }.bind(this));
            $.when(this.ownRegionsDeffered, this.googRegionsDeffered)
                .done(function () {
                    this.marker.setPopupContent(popupTpl(tplObj)).openPopup();
                }.bind(this));

            // Запрашиваем собственные регионы
            this.getPastvuRegion(geo, function (err, data) {
                if (err) {
                    tplObj.parr.push(err.message);
                } else {
                    tplObj.parr = data.regions;
                }
                if (this.ownRegionsDeffered) {
                    this.ownRegionsDeffered.resolve();
                }
            }, this);

            //Запрашиваем регионы Google
            $requestGoogle = $.ajax(
                'http://maps.googleapis.com/maps/api/geocode/json?latlng=' + geo[0] + ',' + geo[1] + '&language=en&sensor=true',
                {
                    crossDomain: true,
                    dataType: 'json',
                    cache: false,
                    context: this
                }
            );
            $requestGoogle
                .fail(function (jqXHR, textStatus, errorThrown) {
                    console.warn(textStatus, errorThrown);
                    tplObj.garr.push(textStatus);
                })
                .done(function (result/*, textStatus, jqXHR*/) {
                    if (result && Array.isArray(result.results)) {
                        var level2 = {};
                        var level1 = {};
                        var country = {};
                        var i = result.results.length;

                        if (result.status === 'OK') {
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
                            if (country.long_name) {
                                tplObj.garr.push(country.long_name);
                            }
                            if (level1.long_name) {
                                tplObj.garr.push(level1.long_name);
                            }
                            console.log(level2);
                        } else {
                            tplObj.garr.push(result.status);
                        }

                    }
                })
                .always(function () {
                    if (this.googRegionsDeffered) {
                        this.googRegionsDeffered.resolve();
                    }
                    $requestGoogle = null;
                });
        },
        getPastvuRegion: function (geo, cb, ctx) {
            socket.run('region.giveRegionsByGeo', { geo: geo })
                .then(function (data) {
                    // Если вернулись данные для другой(прошлой) точки, то выходи
                    if (data && (!Array.isArray(data.geo) || data.geo[0] !== this.geo[0] || data.geo[1] !== this.geo[1])) {
                        return;
                    }

                    cb.call(ctx, null, data);
                }.bind(this))
                .catch(function (err) {
                    cb.call(ctx, err);
                });
        }
    });
});