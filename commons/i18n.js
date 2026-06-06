/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const i18next = require('i18next');
const { parse: parseCookie } = require('cookie');
const config = require('../config');
const Utils = require('./Utils');
const translationsEn = require('../public/js/lang/i18n.en.json');
const translationsRu = require('../public/js/lang/i18n.ru.json');

const DEFAULT_LANG = 'ru';
const SUPPORTED = config.locales || ['ru', 'en'];
const FALLBACK = config.lang || DEFAULT_LANG;
let inited = false;

function init() {
    if (inited) {
        return;
    }

    inited = true;

    const resources = {
        ru: { translation: translationsRu },
        en: { translation: translationsEn },
    };

    i18next.init({
        lng: FALLBACK,
        fallbackLng: DEFAULT_LANG,
        supportedLngs: SUPPORTED,
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
 * Returns a translation function bound to the given language. Falls back to
 * config.lang (and then to 'ru') when lang is not in config.locales.
 */
function getT(lang) {
    init();

    const supported = resolveLang(lang);
    let fixed = fixedTByLang.get(supported);

    if (!fixed) {
        fixed = i18next.getFixedT(supported);
        fixedTByLang.set(supported, fixed);
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

// Plural forms used in notification mail. Each entry is a 3-tuple matching
// Utils.format.wordEndOfNum's title order (one, few, many). English collapses
// few/many into a single "other" form, but we keep three entries for shape
// parity with the Russian helper, which selects the same index for both.
const COMMENT_FORMS = {
    ru: {
        new: ['новый комментарий', 'новых комментария', 'новых комментариев'],
        unread: ['непрочитанный', 'непрочитанных', 'непрочитанных'],
    },
    en: {
        new: ['new comment', 'new comments', 'new comments'],
        unread: ['unread', 'unread', 'unread'],
    },
};

/**
 * Format a count + plural noun ("5 new comments" / "5 новых комментариев")
 * for the comment-notification mail. kind is 'new' or 'unread'.
 */
function commentCount(lang, count, kind) {
    const resolved = resolveLang(lang);
    const forms = COMMENT_FORMS[resolved][kind];
    // Russian: route through the shared declension helper. English: simple
    // singular/plural. Both forms arrays carry the same 3-tuple shape so
    // wordEndOfNum-style indexing also works for ru without a second copy.
    const form = resolved === 'en' ? forms[count === 1 ? 0 : 1] : Utils.format.wordEndOfNum(count, forms);

    return count + ' ' + form;
}

module.exports = { getT, t, userLang, langFromHandshake, langFromRequest, commentCount, init };
