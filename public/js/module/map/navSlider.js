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
            this.pinned = ko.observable(false);
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
            //this.SnatchOffByWindowOutBind = this.SnatchOffByWindowOut.bind(this);
            this.dashOverBind = this.dashOver.bind(this);

            ko.applyBindings(globalVM, this.$dom[0]);

            this.map.on('zoomend', function () {
                this.sliderOnZoom(this.map.getZoom());
            }, this);

            this.map.whenReady(function () {
            }, this);

            this.show();
        },
        show: function () {
            this.$container.fadeIn(400, function () {
                this.$sliderArea = this.$dom.find('.sliderArea');
                this.$sliderArea
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
        dashClick: function (e) {
            var zoom = Number($(e.target).attr('data-zoom'));
            if (zoom && !isNaN(zoom)) {
                window.clearTimeout(this.zoomChangeTimeout);
                this.setZoom(zoom);
            }
        },
        setZoom: function (newZoom) {
            this.map.setZoom(newZoom);
        },
        changeZoom: function (diff) {
            this.map.zoomBy(diff);
        },
        onWheel: function (vm, e) {
            var dir, newZoom;
            dir = e.type === 'DOMMouseScroll' ? -1 * e.detail : e.wheelDelta;
            dir = dir > 0 ? 'up' : 'down';

            newZoom = Math.max(0, Math.min(this.sliderOnZoom() + (dir === 'up' ? 1 : -1), 18));
            if (newZoom && !isNaN(newZoom) && newZoom !== this.sliderOnZoom()) {
                window.clearTimeout(this.zoomChangeTimeout);
                this.sliderOnZoom(newZoom);
                this.zoomChangeTimeout = _.delay(this.setZoomBind, 750, newZoom);
            }

            return false;
        },
        Snatch: function ($e) {
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
        },
        /*SnatchOffByWindowOut: function (evt) {
         var pos = Utils.mousePageXY(evt);

         if (pos.x <= 0 || pos.x >= Utils.getClientWidth() ||
         pos.y <= 0 || pos.y >= Utils.getClientHeight()) {
         this.SnatchOff(evt);
         }
         pos = null;
         }*/
        dashOver: function ($e) {
            var newZoom = Number($($e.target).attr('data-zoom'));
            if (newZoom && !isNaN(newZoom)) {
                window.clearTimeout(this.zoomChangeTimeout);
                this.sliderOnZoom(newZoom);
                this.zoomChangeTimeout = _.delay(this.setZoomBind, 750, newZoom);
            }
        },

        togglePin: function () {
            this.pinned(!this.pinned());
        }
    });

    /*function NavigationSlider(slider, map) {
     this.map = map;
     this.DOMPanel = slider;
     this.DOMSlider = $('<div/>', {'id': 'navSlider', 'class': 'fringe2'})[0];
     this.DOMPanel.appendChild(this.DOMSlider);

     Utils.Event.add(this.DOMPanel, 'mousewheel', this.OnWheel.neoBind(this), false);
     Utils.Event.add(this.DOMPanel, 'DOMMouseScroll', this.OnWheel.neoBind(this), false);

     this.DomDashsArray = [];

     this.DOMh = 12;
     this.offset = 0;
     this.usefulH = 171;
     this.sliderOnZoom = 0;

     this.SnatchBind = this.Snatch.neoBind(this);
     this.SnatchOffBind = this.SnatchOff.neoBind(this);
     this.SnatchOffByWindowOutBind = this.SnatchOffByWindowOut.neoBind(this);
     this.dashOverBind = this.dashOver.neoBind(this);

     this.zoomChangeTimeout = null;

     Utils.Event.add(this.DOMPanel, ET.mdown, this.SnatchBind, false);

     Utils.Event.add(document.querySelector('#nav_pin.fringe2.butt'), 'click', this.togglePin.bind(this), false);
     //if(Browser.support.touch) Utils.Event.add(this.DOMPanel, 'touchstart', this.SnatchBind, false);

     }

     return NavigationSlider;*/
});