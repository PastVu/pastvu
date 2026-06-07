/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const i18next = require('i18next');
const { parse: parseCookie } = require('cookie');
const config = require('../config');
const translationsEn = require('../public/js/lang/i18n.en.json');
const translationsRu = require('../public/js/lang/i18n.ru.json');
const mailEn = require('../views/mail/i18n.en.json');
const mailRu = require('../views/mail/i18n.ru.json');
const statusEn = require('../views/status/i18n.en.json');
const statusRu = require('../views/status/i18n.ru.json');

const DEFAULT_LANG = 'ru';
const SUPPORTED = config.locales || ['ru', 'en'];
const FALLBACK = config.lang || DEFAULT_LANG;
let inited = false;

function init() {
    if (inited) {
        return;
    }

    inited = true;

    // Most keys are Russian source strings (e.g. 'Вход' → 'Login'). Plurals
    // are a narrow exception — symbolic IDs (e.g. 'comments_new') get CLDR
    // suffix lookup (_one/_few/_many/_other) per language, with forms defined
    // in the i18n.ru.json / i18n.en.json files.
    //
    // Server-only namespaces (mail, status) hold strings that are never
    // rendered in the browser. Call sites in views/mail/, views/status/, and
    // controllers/subscr.js pass { ns: 'mail' } or { ns: 'status' }; everything
    // else uses the default 'translation' namespace. fallbackNS lets a mail or
    // status call site reach a shared key (e.g. 'Вход') without per-key
    // partitioning.
    const resources = {
        ru: { translation: translationsRu, mail: mailRu, status: statusRu },
        en: { translation: translationsEn, mail: mailEn, status: statusEn },
    };

    i18next.init({
        lng: FALLBACK,
        fallbackLng: DEFAULT_LANG,
        supportedLngs: SUPPORTED,
        ns: ['translation', 'mail', 'status'],
        defaultNS: 'translation',
        fallbackNS: 'translation',
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

// Normalize an arbitrary lang candidate (cookie value, user setting, etc.)
// to one of the supported locales, falling back to config.lang/DEFAULT_LANG.
function resolveLang(candidate) {
    return SUPPORTED.includes(candidate) ? candidate : FALLBACK;
}

// Cache of fixed t-functions per language. getFixedT allocates a closure on
// every call, and getT() runs once per request (per webapi error, per page
// render); caching keeps the hot path allocation-free.
const fixedTByLang = new Map();

/**
 * Returns a translation function bound to the given language. Unsupported
 * languages are handled by i18next's own fallbackLng — we don't normalize
 * here. Callers that need a normalized lang for cookies or settings should
 * use userLang/langFromHandshake/langFromRequest, which already normalize.
 */
function getT(lang) {
    init();

    let fixed = fixedTByLang.get(lang);

    if (!fixed) {
        fixed = i18next.getFixedT(lang);
        fixedTByLang.set(lang, fixed);
    }

    return fixed;
}

/**
 * Translate a single key for the given language.
 */
function t(lang, key, vars) {
    return getT(lang)(key, vars);
}

/**
 * Pick the most appropriate language for a given user document.
 * Falls back to config.lang when the user has no explicit preference,
 * and normalizes against config.locales so stale values can't leak through.
 */
function userLang(user) {
    return resolveLang(user && user.settings && user.settings.lang);
}

/**
 * Read the user's preferred language from a Socket.IO / Express handshake's
 * past_lang cookie. Falls back to config.lang when the cookie is missing or
 * names an unsupported locale.
 */
function langFromHandshake(handshake) {
    const cookieHeader = handshake && handshake.headers && handshake.headers.cookie || '';

    return resolveLang(parseCookie(cookieHeader).past_lang);
}

/**
 * Resolve the language for an Express request. Accepts either a parsed cookie
 * object on req.cookie (set by app/request.js) or raw req.headers.cookie.
 */
function langFromRequest(req) {
    if (req && req.cookie) {
        return resolveLang(req.cookie.past_lang);
    }

    const cookieHeader = req && req.headers && req.headers.cookie || '';

    return resolveLang(parseCookie(cookieHeader).past_lang);
}

// Map our short language codes to the full OpenGraph locale tags used in
// meta(property="og:locale") so social previews render in the matching
// language.
const OG_LOCALES = { ru: 'ru_RU', en: 'en_US' };

/**
 * Return the OpenGraph locale tag for the given short language code.
 * Falls back to the configured site default (FALLBACK) so a stale cookie
 * value can't force a mismatch between rendered text and og:locale.
 */
function ogLocale(lang) {
    return OG_LOCALES[lang] || OG_LOCALES[FALLBACK];
}

/**
 * Pick a region's display title for the given language. The shared server
 * shape is { title_en, title_local }; English falls back to title_local when
 * a region has no English title yet.
 */
function pickRegionTitle(region, lang) {
    return lang === 'en' ? region.title_en || region.title_local : region.title_local;
}

module.exports = {
    getT, t, userLang, langFromHandshake, langFromRequest, init,
    OG_LOCALES, ogLocale, pickRegionTitle,
};
