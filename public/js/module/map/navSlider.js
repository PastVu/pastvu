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
            this.open = ko.observable(false);

            this.DOMh = 12;
            this.offset = 0;
            this.usefulH = 171;
            this.step = ko.observable(0);
            this.sliderOnZoom = ko.observable(this.map.getZoom());

            this.setZoomDebounce = _.debounce(function (newZoom) {
                this.map.setZoom(newZoom);
            }.bind(this), 750, false);

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
                this.$sliderArea.on('click', '.dash', this.dashClick.bind(this));
                this.recalcZooms();
            }.bind(this));
            this.showing = true;
        },
        hide: function () {
            this.$container.css('display', '');
            this.showing = false;
        },


        recalcZooms: function () {
            var z;
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
                this.setZoomDebounce(zoom);
            }
        },
        changeZoom: function (diff) {
            this.map.zoomBy(diff);
        },
        onWheel: function (vm, e) {
            var dir, newZoom;
            dir = e.type === 'DOMMouseScroll' ? -1 * e.detail : e.wheelDelta;
            dir = dir > 0 ? 'up' : 'down';

            newZoom = Math.max(0, Math.min(this.sliderOnZoom + (dir === 'up' ? 1 : -1), 18));
            if (newZoom === this.sliderOnZoom) {
                return false;
            }

            this.setZoomDebounce(newZoom);
            //this.pos();
            return false;
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

     NavigationSlider.prototype.dashOver = function (obj) {
     window.clearTimeout(this.zoomChangeTimeout);
     var newZoom = Number(obj.target.id.substr(1));
     this.sliderOnZoom = newZoom;
     this.zoomChangeTimeout = window.setTimeout(function () {
     this.map.setZoom(newZoom);
     }.bind(this), 750);
     this.pos();
     };
     NavigationSlider.prototype.Snatch = function (e) {
     var z;
     for (z = 0; z < this.numZooms; z++) {
     Utils.Event.add(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
     */
    /*if(Browser.support.touch){
     Utils.Event.add(this.DomDashsArray[z], 'touchmove', function(){alert(9)}, false);
     }*/
    /*
     }
     Utils.Event.add(document.body, ET.mup, this.SnatchOffBind, false);
     Utils.Event.add(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
     this.DOMPanel.classList.add('sliding');

     */
    /*if(Browser.support.touch){
     Utils.Event.add(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
     Utils.Event.add(document.body, 'touchend', this.SnatchOffBind, false);
     }*/
    /*
     if (e.stopPropagation) {
     e.stopPropagation();
     }
     if (e.preventDefault) {
     e.preventDefault();
     }
     return false;
     };
     NavigationSlider.prototype.SnatchOff = function (evt) {
     var z;

     this.DOMPanel.classList.remove('sliding');
     Utils.Event.remove(document.body, ET.mup, this.SnatchOffBind, false);
     Utils.Event.remove(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
     for (z = 0; z < this.numZooms; z++) {
     Utils.Event.remove(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
     }
     */
    /*if(Browser.support.touch){
     Utils.Event.remove(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
     Utils.Event.remove(document.body, 'touchend', this.SnatchOffBind, false);
     }*/
    /*
     };
     NavigationSlider.prototype.SnatchOffByWindowOut = function (evt) {
     var pos = Utils.mousePageXY(evt);

     if (pos.x <= 0 || pos.x >= Utils.getClientWidth() ||
     pos.y <= 0 || pos.y >= Utils.getClientHeight()) {
     this.SnatchOff(evt);
     }
     pos = null;
     };
     //    NavigationSlider.prototype.OnWheel = function (e) {
     //        var dir, newZoom;
     //        dir = e.type === 'DOMMouseScroll' ? -1 * e.detail : e.wheelDelta;
     //        dir = dir > 0 ? 'up' : 'down';
     //
     //        newZoom = Math.max(0, Math.min(this.sliderOnZoom + (dir === 'up' ? 1 : -1), 18));
     //        if (newZoom === this.sliderOnZoom) {
     //            return false;
     //        }
     //
     //        window.clearTimeout(this.zoomChangeTimeout);
     //        this.sliderOnZoom = newZoom;
     //        this.zoomChangeTimeout = window.setTimeout(function () {
     //            this.map.setZoom(newZoom);
     //        }.bind(this), 750);
     //        this.pos();
     //        return false;
     //    };
     NavigationSlider.prototype.togglePin = function () {
     document.querySelector('#nav_panel').classList.toggle('pin');
     };

     return NavigationSlider;*/
});