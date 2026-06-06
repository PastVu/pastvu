/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const i18next = require('i18next');
const { parse: parseCookie } = require('cookie');
const config = require('../config');
const translations = require('../public/js/lang/i18n.en.json');

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

    const supported = (config.locales || []).includes(lang) ? lang : config.lang || DEFAULT_LANG;
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
 * Falls back to config.lang when the user has no explicit preference.
 */
function userLang(user) {
    if (user && user.settings && user.settings.lang) {
        return user.settings.lang;
    }

    return config.lang || DEFAULT_LANG;
}

// Normalize an arbitrary lang candidate (cookie value, user setting, etc.)
// to one of the supported locales, falling back to config.lang/DEFAULT_LANG.
function resolveLang(candidate) {
    return (config.locales || []).includes(candidate) ? candidate : config.lang || DEFAULT_LANG;
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

// Plural forms used in notification mail. Indexed by Russian declension
// categories: [one, few, many]. English collapses few/many into a single
// "other" form, but we keep three entries for shape parity.
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

// Russian plural index: 0 = one, 1 = few, 2 = many.
function ruPluralIndex(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod100 >= 11 && mod100 <= 14) {
        return 2;
    }

    if (mod10 === 1) {
        return 0;
    }

    if (mod10 >= 2 && mod10 <= 4) {
        return 1;
    }

    return 2;
}

/**
 * Format a count + plural noun ("5 new comments" / "5 новых комментариев")
 * for the comment-notification mail. kind is 'new' or 'unread'.
 */
function commentCount(lang, count, kind) {
    const forms = (COMMENT_FORMS[lang] || COMMENT_FORMS.ru)[kind];
    const idx = lang === 'ru' ? ruPluralIndex(count) : count === 1 ? 0 : 1;

    return count + ' ' + forms[idx];
}

module.exports = { getT, t, userLang, langFromHandshake, langFromRequest, commentCount, init };
