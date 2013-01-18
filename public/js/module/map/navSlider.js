/*global requirejs:true, require:true, define:true*/
define([
    'jquery', 'underscore', 'Browser', 'Utils', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'renderer',
    'leaflet', 'lib/leaflet/extends/L.neoMap', 'Locations', '../../EventTypes',
    'text!tpl/map/navSlider.jade', 'css!style/map/navSlider'
], function ($, _, Browser, Utils, P, ko, Cliche, globalVM, renderer, L, Map, Locations, ET, jade) {
    'use strict';

    return Cliche.extend({
        jade: jade,
        create: function () {
            this.map = this.options.map;
            this.dashes = ko.observableArray();

            this.canOpen = ko.observable(true); //Возможно ли вообще раскрывать контрол навигации
            this.pinned = ko.observable(this.canOpen() && false); //Закреплен в открытом состоянии
            this.sliding = ko.observable(false);

            this.DOMh = 12;
            this.offset = 0;
            this.usefulH = 171;
            this.step = ko.observable(0);
            this.sliderOnZoom = ko.observable(this.map.getZoom());

            this.zoomChangeTimeout = null;

            this.setZoomBind = this.setZoom.bind(this);
            this.SnatchBind = this.Snatch.bind(this);
            this.SnatchOffBind = this.SnatchOff.bind(this);
            this.dashOverBind = this.dashOver.bind(this);

            ko.applyBindings(globalVM, this.$dom[0]);

            this.map.on('zoomend', function () {
                this.sliderOnZoom(this.map.getZoom());
            }, this);

            this.map.whenReady(function () {
                this.show();
            }, this);

        },
        show: function () {
            this.$container.fadeIn(400, function () {
                this.$sliderArea = this.$dom.find('.sliderArea');
                this.$sliderArea
                    .on('mousewheel', this.onWheel.bind(this))
                    .on('DOMMouseScroll', this.onWheel.bind(this)) // Для FF
                    .on('click', '.dash', this.dashClick.bind(this))
                    .on(ET.mdown, this.SnatchBind);

                this.recalcZooms();
            }.bind(this));
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },

        recalcZooms: function () {
            this.numZooms = this.map.getMaxZoom() - this.map.getMinZoom() + 1;
            this.dashes(_.range(0, this.numZooms).reverse());
            this.step(this.usefulH / this.numZooms);
            this.sliderOnZoom(this.map.getZoom());
        },
        pan: function (dir) {
            if (Utils.isType('function', this.map[dir])) {
                this.map[dir]();
            }
        },
        toHome: function () {
            var home = Locations.types.home || Locations.types.gpsip || Locations.types._def_;
            this.map.setView(new L.LatLng(home.lat, home.lng), Locations.current.z, false);
        },
        dashClick: function ($e) {
            var zoom = Number($($e.target).attr('data-zoom'));
            if (!isNaN(zoom)) {
                this.cancelZoomChangeTimeout();
                this.setZoom(zoom);
            }
        },
        setZoom: function (newZoom) {
            this.map.setZoom(newZoom);
        },
        changeZoom: function (diff) {
            this.map.zoomBy(diff);
        },
        cancelZoomChangeTimeout: function () {
            window.clearTimeout(this.zoomChangeTimeout);
            this.zoomChangeTimeout = null;
        },
        onWheel: function ($e) {
            var e = $e.originalEvent,
                dir = Number((e.type === 'DOMMouseScroll' ? -1 * e.detail : e.wheelDelta) || 0),
                newZoom = Math.max(0, Math.min(this.sliderOnZoom() + (dir ? (dir > 0 ? 1 : -1) : 0), this.map.getMaxZoom()));

            if (newZoom !== this.sliderOnZoom()) {
                this.cancelZoomChangeTimeout();
                this.sliderOnZoom(newZoom);
                this.zoomChangeTimeout = _.delay(this.setZoomBind, 600, newZoom);
            }

            return false;
        },
        Snatch: function ($e) {
            this.sliding(true);
            this.$sliderArea
                .on('mouseenter', '.dash', this.dashOverBind);
            $(document)
                .on(ET.mup, this.SnatchOffBind)
                .on('mouseleave', this.SnatchOffBind);

            $e.stopPropagation();
            $e.preventDefault();
            return false;
        },
        SnatchOff: function ($e) {
            this.sliding(false);
            this.$sliderArea
                .off('mouseenter', '.dash', this.dashOverBind);
            $(document)
                .off(ET.mup, this.SnatchOffBind)
                .off('mouseleave', this.SnatchOffBind);

            //Если слайдер действительно двигался и всё еще ожидается смена зума, отменяем ожидание и меняем зум немедленно
            if (this.reallySliding && this.zoomChangeTimeout) {
                this.cancelZoomChangeTimeout();
                this.setZoom(this.sliderOnZoom());
            }
            this.reallySliding = null;
        },
        dashOver: function ($e) {
            this.reallySliding = true; // Флаг, что слайдер действительно подвинулся во время зажатия
            var newZoom = Number($($e.target).attr('data-zoom')) || 0;
            if (!isNaN(newZoom)) {
                this.cancelZoomChangeTimeout();
                this.sliderOnZoom(newZoom);
                this.zoomChangeTimeout = _.delay(this.setZoomBind, 600, newZoom);
            }
            newZoom = null;
        },

        togglePin: function () {
            this.pinned(!this.pinned());
        }
    });
});