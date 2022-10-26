/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Map helper.
define(['jquery', 'Utils', 'leaflet', 'Params'], function ($, Utils, L, P) {
    'use strict';

    let deltaH;
    let deltaV;

    function calcDelta() {
        deltaH = Math.floor(P.window.w() / 4);
        deltaV = Math.floor(P.window.h() / 4);
    }

    calcDelta();
    P.window.square.subscribe(calcDelta);

    L.NeoMap = L.Map.extend({
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

    });
});
