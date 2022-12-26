/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/* global ymaps */

/*
 * Yandex layer plugin wrapper. Loads Yandex maps library with API key included.
 * Requires L.Yandex ^3.3.2 (https://github.com/shramov/leaflet-plugins/).
 * The loading approach used here was inspired by Yandex.addon.LoadApi.
 */
define(['Params', 'leaflet', 'jquery', 'leaflet-plugins/Yandex'], function (P, L, $) {
    const keyParam = P.settings.publicApiKeys.yandexMaps.length ? '&apikey=' + P.settings.publicApiKeys.yandexMaps : '';
    const url = (location.protocol || 'http:') + '//api-maps.yandex.ru/2.1/?mode=release&lang=ru_RU' + keyParam;

    L.Yandex.include({
        _initLoader: function () {
            if (this._loader) {
                // Already loaded, must be yandex layer switching occured.
                return;
            }

            const deferred = new $.Deferred();

            require([url], function () {
                deferred.resolve();
            });
            L.Yandex.prototype._loader = { loading: deferred };
        },
        // Override parent't _initApi to defer map loading till ymaps is available.
        _initApi: function (afterload) {
            const loader = this._loader;

            if (typeof ymaps !== 'undefined') {
                // Library is loaded. Handle map loading to L.Yandex.
                return ymaps.ready(this._initMapObject, this);
            }

            if (afterload || !loader) {
                // Unlikely case when deferred object resolved, but ymaps is
                // not available.
                throw new Error('Yandex API is not available.');
            }

            const loading = loader.loading;

            // Call self with afterload param when promise is resolved.
            loading.then(this._initApi.bind(this, 'afterload'));
        },
    });
    L.Yandex.addInitHook(L.Yandex.prototype._initLoader);

    return function (options) {
        // Disable point information pop-ups and "open in Yandex map" link.
        options = options || {};
        $.extend(options, {
            mapOptions: {
                yandexMapDisablePoiInteractivity: true,
                suppressMapOpenBlock: true,
            },
        });

        return new L.Yandex(options);
    };
});
