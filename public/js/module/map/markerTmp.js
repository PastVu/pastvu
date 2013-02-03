/*global requirejs:true, require:true, define:true*/
/**
 * Модель карты
 */
define([
    'underscore', 'Browser', 'Utils', 'socket', 'Params', 'knockout', 'knockout.mapping', 'globalVM', 'leaflet'
], function (_, Browser, Utils, socket, P, ko, ko_mapping, globalVM, L) {
    'use strict';

    L.NeoMarker = L.Class.extend({
        isNeoMarker: true,
        obj: null,
        point: null,
        map: null,
        pane: null,
        dom: null,
        over: null,
        pos: null,
        hintContent: '',

        // Stamp начала события touch
        hintStart: 0,

        opts: {
            id: '',
            type: 'photo',
            count: 0,
            title: '',
            img: null,
            zIndexOffset: 0
        },

        initialize: function (latlng, opts) {
            $.extend(this, this.opts, opts);

            this.point = latlng;
            this.pane = map._panes.markerPane;

            switch (this.type) {

            case 'cam':

                var cam = this.obj, type = '';
                if (t0 && cam.mask[1][0] == 1) {
                    type = t0;
                }
                else if (t1 && cam.mask[1][1] == 1) {
                    type = t1;
                }
                else if (t2 && cam.mask[1][2] == 1) {
                    type = t2;
                }
                else if (t3 && cam.mask[1][3] == 1) {
                    type = t3;
                }
                else if (t4 && cam.mask[1][4] == 1) {
                    type = t4;
                }
                else if (t5 && cam.mask[1][5] == 1) {
                    type = t5;
                }
                if (type) type = '<div class="type" style="color:' + cam.color + ';">' + type + '</div>';
                this.hintContent = type + cam.name;
                break;


            case 'car':

                var car = this.car;
                this.hintContent = car.name + ', ' + car.speed + ' км/ч';
                break;
            }
        },

        createDom: function () {

            this.dom = $('<div/>', {'class': "neomarker " + this.type})
                .append($('<div/>', {'class': "back"}))
                .append($('<div/>', {'class': "content", 'style': this.img ? 'background-image:url(' + this.img + ')' : '', 'html': this.type == 'group' ? this.count : ''}))
                .append(this.over = $('<div/>', {'class': "over"}))[0];

            switch (this.type) {

            case 'cam':
                this.dom.classList.add('leaflet-zoom-animated');
                break;

            case 'group':
                this.dom.classList.add("c" + (this.count + '').length);
                break;

            case 'car':
                this.dom.style.display = (Cars.visibleZooms.indexOf(marker_mgr.CurrZoom) >= 0) ? 'block' : 'none';
                break;

            case 'camSVG':
                var shape = document.createElementNS(svgNS, "circle");
                shape.setAttributeNS(null, "cx", 25);
                shape.setAttributeNS(null, "cy", 25);
                shape.setAttributeNS(null, "r", 20);
                shape.setAttributeNS(null, "fill", "green");
                this.dom.appendChild(shape);
                break;
            }

            this.over = this.over[0];
            if (Browser.name == 'MSIE' && Browser.versionN < 10) {
                this.over.classList.add('oie');  //Хак для плавного mouseover в IE
            }

            return this.dom;
        },
        remove: function () {
            if (this.type == 'cluster') this.removeListPanel();
            if (this.obj && this.obj.marker) delete this.obj['marker'];
            this.pane.removeChild(this.dom);
            this.dom = null;
        },
        repos: function () {
            this.pos = map.latLngToLayerPoint(this.point);

            L.DomUtil.setPosition(this.dom, this.pos, false);

            this.setZ();
        },
        setZ: function (offset) {
            if (this.type == 'car') {
                this.dom.style.zIndex = offset || 0;
            } else {
                this.dom.style.zIndex = this.pos.y + (offset || 0);
            }
        },

        updatePoint: function (point) {
            this.point = point;
            this.repos();
        },

        TouchStart: function (evt) {
            this.hintStart = Date.now();
            this.MarkerOver(evt, 38);
            /*
             var pos_marker = map.layerPointToContainerPoint(this.pos);

             this.setZ(10000);
             if (this.type=='cam' || this.type=='car'){
             object_hint.style.top = Math.max(pos_marker.y - 32, 1) + "px";
             object_hint.style.left = Math.max(pos_marker.x + 38, 1) + "px";

             object_hint.querySelector('#hint_text').innerHTML = this.hintContent;
             object_hint.classList.add(this.type);
             }*/
        },

        TouchEnd: function (evt) {
            this.MarkerOut(evt);
            if (Date.now() - this.hintStart > 700) return false;
            /**
             * If we touched it less than 0.7s - it means we clicked.
             * Otherwise - we just looked a hint.
             */
        },

        MarkerClick: function (evt) {
            if (this.type == 'cam') mediaContainerManager.open(this.id);

            else if (this.type == 'group') {
                var pos = mousePageXY(evt), nextZoom = map.getZoom() + 1;
                map.setView(zoomApproachToPoint(new L.Point(pos.x, pos.y), nextZoom), nextZoom);

            } else if (this.type == 'cluster') {
                if (!this.CamList) {
                    this.ListPanel = $('<div />', {'class': "cluster_list", 'data-bind': "template: {name:'CamListTemplate', afterRender: AfterTemplateRender}"})[0];
                    document.querySelector('#main').insertBefore(this.ListPanel, document.getElementById('cam_layer'));
                    this.hideListPanelBind = this.hideListPanel.bind(this);

                    this.CamList = new CamListVM(null, 250);
                    this.CamList.containerH.subscribe(function (camListH) {
                        this.ListPanel.style.height = camListH + 2 + 'px';
                    }.bind(this));
                    ko.applyBindings(this.CamList, this.ListPanel);
                }
                var pos_marker = map.layerPointToContainerPoint(this.pos);
                this.ListPanel.style.top = Math.max(pos_marker.y - 32, 1) + "px";
                this.ListPanel.style.left = Math.max(pos_marker.x + 18, 1) + "px";

                this.ListPanel.classList.add('show');
                this.CamList.updateCamsByCamsHash(this.obj.cams);

                Utils.Event.add(document, ET.mdown, this.hideListPanelBind, false);
            }
        },
        hideListPanel: function () {
            if (this.CamList) {
                this.CamList.cams([]);
                Utils.Event.remove(document, ET.mdown, this.hideListPanelBind, false);
                this.ListPanel.classList.remove('show');
            }
        },
        removeListPanel: function () {
            if (this.CamList) {
                this.hideListPanel();
                ko.cleanNode(this.ListPanel);
                this.ListPanel.parentNode.removeChild(this.ListPanel);
                this.ListPanel = this.CamList = this.hideListPanelBind = null;
            }
        },
        MarkerOver: function (evt, x, y) {
            var pos_marker = map.layerPointToContainerPoint(this.pos);

            this.setZ(10000);

            if (this.type == 'cam' || this.type == 'car') {
                object_hint.style.left = Math.max(pos_marker.x + (x || 18), 1) + "px";
                object_hint.style.top = Math.max(pos_marker.y + (y || -32), 1) + "px";

                object_hint.querySelector('#hint_text').innerHTML = this.hintContent;
                object_hint.classList.add(this.type);
            }
        },
        MarkerOut: function (evt) {
            if (this.type == 'cam' || this.type == 'car') {
                if (object_hint.classList.contains(this.type)) {
                    object_hint.classList.remove(this.type);
                }

                object_hint.style.left = "auto";
                object_hint.style.top = "auto";
            }

            this.setZ();
        }
    });
});