/*
 * Google layer plugin wrapper. Loads Google Maps library with API key included.
 */
define(['Params', 'leaflet', 'leaflet-plugins/lru', 'leaflet-plugins/Leaflet.GoogleMutant'], function (P, L) {
    const keyParam = P.settings.publicApiKeys.googleMaps.length ? '&key=' + P.settings.publicApiKeys.googleMaps : '';
    const url = 'https://maps.googleapis.com/maps/api/js?v=weekly&region=RU' + keyParam;

    // Load Google Maps API library asynchronously.
    require(['async!' + url]);

    return function (type, options) {
        options = options || {};
        options.type = type;

        return new L.GridLayer.GoogleMutant(options);
    };
});
