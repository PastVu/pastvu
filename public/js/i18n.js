/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/*global init:true*/
define(['i18next', 'text!./lang/i18n.en.json'], function (i18next, translationsText) {
    'use strict';

    const translations = JSON.parse(translationsText);
    // Read the locale directly from window.init (set inline in the HTML
    // template), not from Params, because Params depends on `socket!` and
    // i18n is loaded from socket.js itself — going through Params would
    // create a circular dependency.
    const lang = typeof init !== 'undefined' && init.settings && init.settings.lang || 'ru';

    i18next.init({
        lng: lang,
        fallbackLng: 'ru',
        // Keys are Russian source strings; turn off separators so dots/colons in a key
        // are not interpreted as namespace/key paths.
        keySeparator: false,
        nsSeparator: false,
        // Knockout escapes text bindings — don't double-escape.
        interpolation: { escapeValue: false },
        resources: {
            ru: { translation: {} },
            en: { translation: translations },
        },
    });

    return i18next.t.bind(i18next);
});
