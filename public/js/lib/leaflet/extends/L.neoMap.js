/*global define*/
define(['jquery', 'Utils', 'leaflet', 'Params'], function ($, Utils, L, P) {
    'use strict';

    var deltaH, deltaV;

    function calcDelta() {
        deltaH = Math.floor(P.window.w() / 4);
        deltaV = Math.floor(P.window.h() / 4);
    }

    calcDelta();
	P.window.square.subscribe(calcDelta);

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
        }

    });
});