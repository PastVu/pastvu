/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

// Google layer plugin wrapper. Loads Google Maps library with API key included.
import { loadScript } from 'frontend/loadScript';
import P from 'Params';
import L from 'leaflet';
import lru from 'leaflet-plugins/lru';
import 'leaflet-plugins/Leaflet.GoogleMutant';

const keyParam = P.settings.publicApiKeys.googleMaps.length ? '&key=' + P.settings.publicApiKeys.googleMaps : '';
const url = 'https://maps.googleapis.com/maps/api/js?v=weekly&region=RU' + keyParam;

// Load Google Maps API library asynchronously.
L.GridLayer.GoogleMutant.addInitHook(function () {
    loadScript(url, { callback: true });
});

export default function (options) {
    options = options || {};
    options.lru = new lru.LRUMap(100); // Tile LRU cache.

    return new L.GridLayer.GoogleMutant(options);
};
