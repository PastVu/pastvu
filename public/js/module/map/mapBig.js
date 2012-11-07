/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
    'underscore', 'Browser', 'Utils', 'socket', 'globalParams', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer',
    'm/User', 'm/Users',
    'leaflet', 'lib/leaflet/extends/L.neoMap', 'nav_slider', 'Locations',
    'text!tpl/map/mapBig.jade', 'css!style/map/mapBig'
], function (_, Browser, Utils, socket, GP, ko, ko_mapping, Cliche, globalVM, renderer, User, users, L, Map, NavigationSlider, Locations, jade) {
    'use strict';
    var $window = $(window);

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.auth = globalVM.repository['m/auth'];

            this.mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng);
            this.map = new L.neoMap('map', {center: this.mapDefCenter, zoom: Locations.current.z, minZoom: 0, maxZoom: 18, zoomAnimation: true});

            var map = this.map,
                layers = this.map.layers,
                systems = document.createDocumentFragment(),
                sysElem,
                typeElem,
                sysNum = 0,
                lay,
                type;

            for (lay in layers) {
                if (layers.hasOwnProperty(lay)) {

                    sysElem = $('<div/>', {id: lay}).append($('<span/>', {'class': 'head', 'html': layers[lay].desc}));

                    for (type in layers[lay].types) {
                        if (layers[lay].types.hasOwnProperty(type)) {

                            typeElem = $('<div/>', {html: layers[lay].types[type].desc, 'maptp': type}).appendTo(sysElem);
                            Utils.Event.add(typeElem[0], 'click', function (event, s, t) {
                                map.selectLayer(s, t);
                            }.neoBind(typeElem[0], [lay, type]));
                            layers[lay].types[type].dom = typeElem[0];

                        }
                    }
                    systems.appendChild(sysElem[0]);
                    sysNum++;
                }
            }

            this.$dom.find('#layers_panel #systems')[0].appendChild(systems);
            this.$dom.find('#layers_panel #systems')[0].classList.add('s' + sysNum);

            this.navSlider = new NavigationSlider(this.$dom.find('#nav_slider_area')[0], this.map);

            Locations.subscribe(function (val) {
                this.mapDefCenter = new L.LatLng(val.lat, val.lng);
                this.setMapDefCenter(true);
            }.bind(this));

            if (!!window.localStorage && !!window.localStorage['arguments.SelectLayer']) {
                this.map.selectLayer.apply(this.map, window.localStorage['arguments.SelectLayer'].split(','));
            } else {
                this.map.selectLayer('osm', 'mapnik');
            }

        },
        show: function () {
            this.$container.fadeIn();
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },
        setMapDefCenter: function (forceMoveEvent) {
            this.map.setView(mapDefCenter, Locations.current.z, false);
        }
    });
});