/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const i18next = require('i18next');
const config = require('../config');
const translations = require('../public/js/i18n-translations.json');

const DEFAULT_LANG = 'ru';
let inited = false;

function init() {
    if (inited) {
        return;
    }

    inited = true;

    const resources = {};

    (config.locales || ['ru', 'en']).forEach(lng => {
        resources[lng] = { translation: lng === 'en' ? translations : {} };
    });

    i18next.init({
        lng: config.lang || DEFAULT_LANG,
        fallbackLng: DEFAULT_LANG,
        supportedLngs: config.locales || ['ru', 'en'],
        // Keys are Russian source strings; turn off separators so dots/colons
        // in a key are not interpreted as namespace/key paths.
        keySeparator: false,
        nsSeparator: false,
        // Pug escapes #{} interpolations; double-escaping would mangle HTML in
        // values like '...<br>...'. Server-side, the caller is responsible for
        // marking trusted output (use !{} for HTML, #{} for text).
        interpolation: { escapeValue: false },
        resources,
    });
}

/**
 * Returns a translation function bound to the given language. Falls back to
 * config.lang (and then to 'ru') when lang is not in config.locales.
 */
function getT(lang) {
    init();

    const supported = (config.locales || []).includes(lang) ? lang : config.lang || DEFAULT_LANG;

    return i18next.getFixedT(supported);
}

/**
 * Translate a single key for the given language.
 */
function t(lang, key, vars) {
    return getT(lang)(key, vars);
}

module.exports = { getT, t, init };
