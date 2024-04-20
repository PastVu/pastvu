/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Google layer plugin wrapper. Loads Google Maps library with API key included.
define(['Params', 'leaflet', 'leaflet-plugins/lru', 'leaflet-plugins/Leaflet.GoogleMutant'], function (P, L, lru) {
    const keyParam = P.settings.publicApiKeys.googleMaps.length ? '&key=' + P.settings.publicApiKeys.googleMaps : '';
    const url = 'https://maps.googleapis.com/maps/api/js?v=weekly&region=RU' + keyParam;

    // Load Google Maps API library asynchronously.
    L.GridLayer.GoogleMutant.addInitHook(function () {
        require(['async!' + url]);
    });

    return function (options) {
        options = options || {};
        options.lru = new lru.LRUMap(100); // Tile LRU cache.

        return new L.GridLayer.GoogleMutant(options);
    };
});
