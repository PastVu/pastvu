/*global define*/
define(['jquery', 'Utils', 'leaflet', 'globalParams'], function ($, Utils, L, GP) {
    var layers = {};
    if (GP.USE_OSM_API()) {
        layers.osm = {
            desc: 'OSM',
            types: {
                osmosnimki: {
                    desc: 'Osmosnimki',
                    obj: new L.TileLayer('http://{s}.tile.osmosnimki.ru/kosmo/{z}/{x}/{y}.png', {updateWhenIdle: false})
                },
                mapnik: {
                    desc: 'Mapnik',
                    obj: new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {updateWhenIdle: false})
                },
                mapquest: {
                    desc: 'Mapquest',
                    obj: new L.TileLayer('http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {updateWhenIdle: false})
                }
            }
        };
    }
    if (GP.USE_YANDEX_API()) {
        layers.yandex = {
            desc: 'Яндекс',
            deps: 'lib/leaflet/extends/L.Yandex',
            types: {
                scheme: {
                    desc: 'Схема',
                    params: 'map'
                },
                sat: {
                    desc: 'Спутник',
                    params: 'satellite'
                },
                hyb: {
                    desc: 'Гибрид',
                    params: 'hybrid'
                },
                pub: {
                    desc: 'Народная',
                    params: 'publicMap'
                },
                pubhyb: {
                    desc: 'Народный гибрид',
                    params: 'publicMapHybrid'
                }
            }
        };
    }
    if (GP.USE_GOOGLE_API()) {
        layers.google = {
            desc: 'Google',
            deps: 'lib/leaflet/extends/L.Google',
            types: {
                scheme: {
                    desc: 'Схема',
                    params: 'ROADMAP'
                },
                sat: {
                    desc: 'Спутник',
                    params: 'SATELLITE'
                },
                hyb: {
                    desc: 'Гибрид',
                    params: 'HYBRID'
                },
                land: {
                    desc: 'Ландшафт',
                    params: 'TERRAIN'
                }
            }
        };
    }

    var deltaH, deltaV;

    function calcDelta() {
        deltaH = Math.floor(Utils.getClientWidth() / 4);
        deltaV = Math.floor(Utils.getClientHeight() / 4);
    }

    calcDelta();
    Utils.Event.add(window, 'resize', calcDelta);

    L.neoMap = L.Map.extend({
        zoomBy: function (diff) {
            this.setZoom(this.getZoom() + diff);
        },
        up: function () {
            this.panBy(new L.Point(0, -1 * deltaV));
        },
        down: function () {
            this.panBy(new L.Point(0, deltaV));
        },
        left: function () {
            this.panBy(new L.Point(-1 * deltaH, 0));
        },
        right: function () {
            this.panBy(new L.Point(deltaH, 0));
        },

        layers: layers,
        layer_active: {sys: null, type: null},
        selectLayer: function (sys_id, type_id) {
            if (!this.layers.hasOwnProperty(sys_id) || !this.layers[sys_id].types.hasOwnProperty(type_id)) return;

            var sys = this.layers[sys_id],
                type = sys.types[type_id];

            if (this.layer_active.sys && this.layer_active.type) {
                this.layer_active.type.dom.parentNode.firstChild.classList.remove('selected');
                this.layer_active.type.dom.classList.remove('selected');
                this.removeLayer(this.layer_active.type.obj);
            }

            type.dom.parentNode.firstChild.classList.add('selected');
            type.dom.classList.add('selected');
            document.querySelector('#current').innerHTML = sys.desc + ': ' + type.desc;

            if (!!window.localStorage) {
                window.localStorage['arguments.SelectLayer'] = Array.prototype.slice.call(arguments).join(',');
            }
            this.layer_active.sys = sys;
            this.layer_active.type = type;

            if (sys.deps && !type.obj) {
                require([sys.deps], function (Construct) {
                    type.obj = new Construct(type.params);
                    this.addLayer(type.obj);
                }.bind(this));
            } else {
                this.addLayer(type.obj);
            }
        }

    });
});