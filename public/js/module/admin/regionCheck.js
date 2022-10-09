/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Module for checking region by geo coordianates.
define([
    'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
    'noties', 'leaflet', 'lib/doT',
    'text!tpl/admin/regionCheck.pug', 'css!style/admin/regionCheck', 'css!style/leaflet/leaflet',
], function (_, $, Utils, socket, P, ko, koMapping, Cliche, globalVM, noties, L, doT, pug) {
    'use strict';

    let requestNominatim;
    const popupLoadingTpl = doT.template(
        '<table style="text-align: center" border="0" cellspacing="5" cellpadding="0"><tbody>' +
        '<tr><td style="width: 200px;">{{=it.geo}}<hr style="margin: 2px 0 5px;"></td></tr>' +
        '<tr><td><img src="/img/misc/load.gif" style="width: 67px; height: 10px"/></td></tr>' +
        '</tbody></table>'
    );
    const popupTpl = doT.template(
        '{{##def.nurl:' +
        '<a target="_blank" href="https://nominatim.openstreetmap.org/ui/details.html' +
        '?osmtype={{=value.osm_type}}&osmid={{=value.osm_id}}">{{=value.title}}</a>#}}' +
        '{{##def.purl:' +
        '<a target="_blank" href="/admin/region/{{=value.cid}}">{{=value.title}}</a>#}}' +
        '<table style="text-align: center;" border="0" cellspacing="5" cellpadding="0"><tbody>' +
        '<tr><td colspan="2">{{=it.geo}}<hr style="margin: 2px 0 5px;"></td></tr>' +
        '<tr style="font-weight: bold;"><td style="min-width:150px;">PastVu</td><td style="min-width:150px;">Nominatim</td></tr>' +
        '<tr><td style="vertical-align: top;">' +
        '{{~it.parr :value:index}}{{? !value.err}}{{#def.purl}}{{?? true}}{{=value.err}}{{?}}<br>{{~}}' +
        '</td><td style="vertical-align: top;">' +
        '{{~it.narr :value:index}}{{? value.osm_id}}{{#def.nurl}}{{?? true }}{{=value.title || value.err}}{{?}}<br>{{~}}' +
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
            let passedGeo = globalVM.router.params().g;
            let passedZoom;

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
                trackResize: false,
            });
            this.pointLayer = L.layerGroup();

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 16,
                attribution: 'Data &copy; OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
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
                        const geo = [to6Precision(e.latlng.lat), to6Precision(e.latlng.lng)];

                        this.goToGeo(geo);
                    }, this);

                if (Utils.geo.checkLatLng(passedGeo)) {
                    this.goToGeo(passedGeo);
                }
            }, this);
        },
        //Пересчитывает размер карты
        sizesCalc: function () {
            const height = P.window.h() - this.$dom.find('.map').offset().top - 37 >> 0;

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
            const val = this.$dom.find('input.inputGeo').val();
            const geo = val.split(',').map(function (element) {
                return parseFloat(element);
            });

            if (Utils.geo.checkLatLng(geo)) {
                this.map.panTo(geo);
                this.goToGeo(geo);
            } else {
                noties.alert({
                    message: 'Неверный формат',
                    type: 'warning',
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
                        className: 'pointMarkerEdit',
                    }),
                })
                .on('dragstart', function () {
                    this.updateRegionAbort();
                    this.marker.closePopup();
                    this.link('');
                }, this)
                .on('dragend', function () {
                    const latlng = this.marker.getLatLng();

                    this.updateRegion([to6Precision(latlng.lat), to6Precision(latlng.lng)]);
                }, this)
                .bindPopup(L.popup({
                    maxWidth: 500,
                    minWidth: 200,
                    closeButton: false,
                    offset: new L.Point(0, 60),
                    autoPanPadding: new L.Point(5, 5),
                }))
                .addTo(this.pointLayer);
        },
        updateRegionAbort: function () {
            if (this.ownRegionsDeffered) {
                this.ownRegionsDeffered.reject();
            }

            if (this.nominatimRegionsDeffered) {
                this.nominatimRegionsDeffered.reject();
            }

            if (requestNominatim) {
                requestNominatim.abort();
            }
        },
        updateRegion: function (geo) {
            //Если уже ожидаются запросы - отменяем их
            this.updateRegionAbort();

            const tplObj = {
                geo: geo[0] + ' , ' + geo[1],
                parr: [],
                narr: [],
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
            this.nominatimRegionsDeffered = new $.Deferred();
            this.ownRegionsDeffered.always(function () {
                this.ownRegionsDeffered = null;
            }.bind(this));
            this.nominatimRegionsDeffered.always(function () {
                this.nominatimRegionsDeffered = null;
            }.bind(this));
            $.when(this.ownRegionsDeffered, this.nominatimRegionsDeffered)
                .done(function () {
                    this.marker.setPopupContent(popupTpl(tplObj)).openPopup();
                }.bind(this));

            // Запрашиваем собственные регионы
            this.getPastvuRegion(geo, function (err, data) {
                if (err) {
                    tplObj.parr.push({ 'err': err.message });
                } else {
                    data.regions.forEach(function (region) {
                        // Set title propertly to current language title.
                        region.title = region.hasOwnProperty('title_' + P.settings.lang) ? region['title_' + P.settings.lang] : region.title_local;
                    });
                    tplObj.parr = data.regions;
                }

                if (this.ownRegionsDeffered) {
                    this.ownRegionsDeffered.resolve();
                }
            }, this);

            //Query Nominatim (https://nominatim.org/release-docs/develop/api/Reverse/).
            requestNominatim = $.ajax(
                'https://nominatim.openstreetmap.org/reverse?format=geocodejson&lat=' + geo[0] + '&lon=' + geo[1] +
                '&accept-language=' + P.settings.lang,
                {
                    crossDomain: true,

                    dataType: 'json',
                    cache: false,
                    context: this,
                }
            );
            requestNominatim
                .fail(function (jqXHR, textStatus, errorThrown) {
                    if (textStatus === 'abort') {
                        // We must have clicked before previous request
                        // finished.
                        return;
                    }

                    if (jqXHR.responseJSON && jqXHR.responseJSON.hasOwnProperty('error')) {
                        tplObj.narr.push({ 'err': jqXHR.responseJSON.error.message });
                        console.warn('Error: ' + jqXHR.responseText);
                    } else {
                        tplObj.narr.push({ 'err': textStatus });
                        console.warn(textStatus, errorThrown);
                    }
                })
                .done(function (result/*, textStatus, jqXHR*/) {
                    if (result.hasOwnProperty('error')) {
                        // Error property in 200 responce object, e.g. when clicking at ocean.
                        tplObj.narr.push({ 'err': result.error });
                    }

                    if (result.hasOwnProperty('features') && result.features.length !== 0) {
                        const geocoding = result.features[0].properties.geocoding;

                        // Add country.
                        tplObj.narr.push({ 'title': geocoding.country });

                        // Add all adminstrative boundaries.
                        const numRecs = Object.keys(geocoding.admin).length;
                        let count = 0;

                        for (const reg in geocoding.admin) {  //eslint-disable-line guard-for-in
                            count++;

                            const value = { 'title': geocoding.admin[reg] };

                            // For last item in the list add osm_id, so URL
                            // for place details is displayed.
                            if (numRecs === count) {
                                value.osm_id = geocoding.osm_id;
                                // osmtype param in details URL should be first capital letter of type.
                                value.osm_type = geocoding.osm_type.charAt(0).toUpperCase();
                            }

                            tplObj.narr.push(value);
                        }
                    }
                })
                .always(function () {
                    if (this.nominatimRegionsDeffered) {
                        this.nominatimRegionsDeffered.resolve();
                    }

                    requestNominatim = null;
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
        },
    });
});
