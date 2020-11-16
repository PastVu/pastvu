/*
 * Google layer plugin wrapper. Loads Google Maps library with API key included.
 */
define(['Params', 'leaflet', 'leaflet-plugins/Google'], function (P, L) {
    const keyParam = P.settings.publicApiKeys.googleMaps.length ? '&key=' + P.settings.publicApiKeys.googleMaps : '';
    const url = (location.protocol || 'http:') + '//maps.googleapis.com/maps/api/js?v=weekly&region=RU' + keyParam;

    // Load Google Maps API library asynchronously.
    require(['async!' + url]);

    return L.Google;
});
