/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const i18next = require('i18next');
const { parse: parseCookie } = require('cookie');
const Negotiator = require('negotiator');
const config = require('../config');
const translationsEn = require('../public/js/lang/i18n.en.json');
const translationsRu = require('../public/js/lang/i18n.ru.json');
const mailEn = require('../views/mail/i18n.en.json');
const mailRu = require('../views/mail/i18n.ru.json');
const statusEn = require('../views/status/i18n.en.json');
const statusRu = require('../views/status/i18n.ru.json');

const DEFAULT_LANG = 'en';
const SUPPORTED = config.locales || ['ru', 'en'];
const FALLBACK = config.lang || DEFAULT_LANG;
let inited = false;

function init() {
    if (inited) {
        return;
    }

    inited = true;

    // Keys are English source strings (e.g. 'Login' → 'Вход'). Plurals are a
    // narrow exception — symbolic IDs (e.g. 'comments_new') get CLDR suffix
    // lookup (_one/_few/_many/_other) per language, with forms defined in the
    // i18n.ru.json / i18n.en.json files.
    //
    // Server-only namespaces (mail, status) hold strings that are never
    // rendered in the browser. Call sites in views/mail/, views/status/, and
    // controllers/subscr.js pass { ns: 'mail' } or { ns: 'status' }; everything
    // else uses the default 'translation' namespace. fallbackNS lets a mail or
    // status call site reach a shared key (e.g. 'Login') without per-key
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
        // Keys are English source strings; turn off separators so dots/colons
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

// Extract the raw past_lang cookie value (un-normalized, possibly undefined)
// from an Express request or a Socket.IO handshake. Accepts either a parsed
// cookie object on .cookie (set by app/request.js) or a raw .headers.cookie
// string.
function readCookieLang(reqOrHandshake) {
    if (reqOrHandshake && reqOrHandshake.cookie) {
        return reqOrHandshake.cookie.past_lang;
    }

    const cookieHeader = reqOrHandshake && reqOrHandshake.headers && reqOrHandshake.headers.cookie || '';

    return parseCookie(cookieHeader).past_lang;
}

// Pick the best supported locale advertised by a request's Accept-Language
// header. Returns a supported code, or undefined when the header is absent or
// names only unsupported languages (so the caller can fall through). The
// header is filtered against SUPPORTED, so the result is always supported.
// Underscores are normalized to hyphens so locale tags injected by the
// Facebook / social override in _session.js (e.g. 'ru_RU') are matched too.
function langFromAcceptHeader(reqOrHandshake) {
    const header = reqOrHandshake && reqOrHandshake.headers && reqOrHandshake.headers['accept-language'];

    if (!header) {
        return undefined;
    }

    const negotiator = new Negotiator({ headers: { 'accept-language': header.replace(/_/g, '-') } });

    return negotiator.languages(SUPPORTED)[0];
}

/**
 * The single source of truth for choosing a request's language.
 *
 * Priority: the user's saved preference (settings.lang) wins, then the
 * request's past_lang cookie, then the browser's Accept-Language header,
 * then the configured site default. Each candidate must name a supported
 * locale or it is skipped, so a stale user setting falls through to the
 * cookie, an unknown cookie to Accept-Language, and an unsupported browser
 * to the default.
 *
 * Pass the user document only when it should count (e.g. a registered
 * usObj.user); pass null/undefined to decide from the request alone.
 * `reqOrHandshake` is an Express req or a Socket.IO handshake.
 */
function pickLang(user, reqOrHandshake) {
    const candidates = [
        user && user.settings && user.settings.lang,
        readCookieLang(reqOrHandshake),
        langFromAcceptHeader(reqOrHandshake),
    ];

    for (const candidate of candidates) {
        if (SUPPORTED.includes(candidate)) {
            return candidate;
        }
    }

    return FALLBACK;
}

/**
 * Resolve the language for a Socket.IO / Express handshake from the request
 * alone (no user document): past_lang cookie, then Accept-Language, then the
 * configured site default.
 */
function langFromHandshake(handshake) {
    return pickLang(null, handshake);
}

/**
 * Resolve the language for an Express request from the request alone (no user
 * document). Accepts either a parsed cookie object on req.cookie (set by
 * app/request.js) or raw req.headers.cookie.
 */
function langFromRequest(req) {
    return pickLang(null, req);
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

/**
 * Express middleware that exposes the request's language and i18n helpers as
 * template locals. Templates and `res.render()` callers can then read `lang`,
 * `t`, and `ogLocale` without each handler threading them through explicitly.
 * Callers that need a different language (e.g. accept-language for a browser
 * detected as obsolete before the cookie is trusted) can still override by
 * passing the keys in the `res.render(view, options)` options object.
 */
function i18nLocals(req, res, next) {
    const lang = langFromRequest(req);

    res.locals.lang = lang;
    res.locals.t = getT(lang);
    res.locals.ogLocale = ogLocale(lang);
    next();
}

module.exports = {
    getT, t, userLang, langFromHandshake, langFromRequest, pickLang, init,
    OG_LOCALES, ogLocale, pickRegionTitle, i18nLocals,
};
