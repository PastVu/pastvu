define([
    'jquery', 'underscore', 'Browser', 'Utils', 'Params', 'knockout', 'm/_moduleCliche', 'globalVM', 'renderer',
    'leaflet', 'leaflet-extends/L.neoMap', 'Locations', '../../EventTypes',
    'text!tpl/map/navSlider.pug', 'css!style/map/navSlider',
], function ($, _, Browser, Utils, P, ko, Cliche, globalVM, renderer, L, Map, Locations, ET, pug) {
    'use strict';

    return Cliche.extend({
        pug: pug,
        options: {
            maxZoom: 18,
            canOpen: true,
        },
        create: function () {
            this.auth = globalVM.repository['m/common/auth'];
            this.map = this.options.map;
            this.dashes = ko.observableArray();

            this.canOpen = ko.observable(this.options.canOpen); //Возможно ли вообще раскрывать контрол навигации
            this.pinned = ko.observable(this.canOpen() && true); //Закреплен в открытом состоянии
            this.hover = ko.observable(false);
            this.sliding = ko.observable(false);

            this.step = ko.observable(9);
            this.minZoom = ko.observable(0);
            this.maxZoom = ko.observable(this.options.maxZoom);
            this.numZooms = ko.observable(false);
            this.sliderOnZoom = ko.observable(this.map.getZoom());
            // Высота панели зумирования зависит от шага, количества зумов и состояния панели
            this.panelH = this.co.panelH = ko.computed(function () {
                let result = 136;

                if (this.pinned() || this.hover()) {
                    result += this.numZooms() * this.step() + 3;
                }

                return result;
            }, this);

            this.zoomChangeTimeout = null;

            this.setZoomBind = this.setZoom.bind(this);
            this.SnatchBind = this.Snatch.bind(this);
            this.SnatchOffBind = this.SnatchOff.bind(this);
            this.dashOverBind = this.dashOver.bind(this);

            ko.applyBindings(globalVM, this.$dom[0]);

            this.map.whenReady(function () {
                this.show();
            }, this);
        },
        show: function () {
            this.$sliderArea = this.$dom.find('.sliderArea');
            this.$stateWrap = this.$dom.find('.stateWrap');

            if (this.canOpen()) {
                this.map.on('zoomend', function () {
                    this.sliderOnZoom(this.map.getZoom());
                }, this);

                this.$sliderArea
                    .on('mousewheel', this.onWheel.bind(this))
                    .on('DOMMouseScroll', this.onWheel.bind(this))// Для FF
                    .on('click', '.dash', this.dashClick.bind(this))
                    .on(ET.mdown, this.SnatchBind);
                this.$stateWrap
                    .mouseenter(function () {
                        this.hover(true);
                    }.bind(this))
                    .mouseleave(function () {
                        this.hover(false);
                    }.bind(this));
            }

            this.recalcZooms();
            globalVM.func.showContainer(this.$container);
            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },

        recalcZooms: function (maxZoom) {
            this.minZoom(this.map.getMinZoom());

            if (maxZoom) {
                this.maxZoom(maxZoom);
            }

            this.numZooms(this.maxZoom() - this.minZoom() + 1);
            this.dashes(_.range(this.minZoom(), this.maxZoom() + 1).reverse());
            this.sliderOnZoom(this.map.getZoom());
        },
        pan: function (dir) {
            if (Utils.isType('function', this.map[dir])) {
                this.map[dir]();
            }
        },
        toHome: function () {
            let center;
            let bbox;
            let latlng;
            let z;

            if (this.auth.loggedIn() && this.auth.iAm.regionHome) {
                if (this.auth.iAm.regionHome.center) {
                    center = this.auth.iAm.regionHome.center();

                    if (Utils.geo.check(center)) {
                        latlng = [center[1], center[0]];
                    }
                }

                if (this.auth.iAm.regionHome.bboxhome || this.auth.iAm.regionHome.bbox) {
                    bbox = this.auth.iAm.regionHome.bboxhome() || this.auth.iAm.regionHome.bbox();

                    if (Utils.geo.checkbbox(bbox)) {
                        z = this.map.getBoundsZoom([
                            [bbox[1], bbox[0]],
                            [bbox[3], bbox[2]],
                        ], false);
                    }
                }
            }

            if (!center) {
                latlng = [55.751667, 37.617778];
            }

            if (!z) {
                z = 10;
            }

            this.map.setView(new L.LatLng(latlng[0], latlng[1]), z, { animate: true });
        },
        dashClick: function ($e) {
            const zoom = Number($($e.target).attr('data-zoom'));

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
            const e = $e.originalEvent;
            const dir = Number((e.type === 'DOMMouseScroll' ? -1 * e.detail : e.wheelDelta) || 0);
            const newZoom = Math.max(this.minZoom(), Math.min(this.sliderOnZoom() + (dir ? dir > 0 ? 1 : -1 : 0), this.maxZoom()));

            if (newZoom !== this.sliderOnZoom()) {
                this.cancelZoomChangeTimeout();

                if (newZoom <= this.maxZoom()) {
                    this.sliderOnZoom(newZoom);
                }

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
        SnatchOff: function () {
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

            let newZoom = Number($($e.target).attr('data-zoom')) || 0;

            if (!isNaN(newZoom)) {
                this.cancelZoomChangeTimeout();
                this.sliderOnZoom(newZoom);
                this.zoomChangeTimeout = _.delay(this.setZoomBind, 600, newZoom);
            }

            newZoom = null;
        },

        togglePin: function () {
            this.pinned(!this.pinned());
        },
    });
});
