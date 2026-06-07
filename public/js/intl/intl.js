/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/*global init:true*/
define([], function () {
    'use strict';

    // window.init.settings.lang reflects the resolved locale picked by the
    // server; same source public/js/i18n.js reads from. Formatters built once
    // and cached so the hot path is a single .format(value) call.
    const lang = typeof init !== 'undefined' && init.settings && init.settings.lang || 'ru';
    const intlNumFormat = new Intl.NumberFormat(lang).format;
    const intlDateFullFormat = new Intl.DateTimeFormat(lang, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format;
    const intlDateFullDigitFormat = new Intl.DateTimeFormat(lang, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format;

    return {
        num: function (number) {
            return typeof number === 'number' ? intlNumFormat(number) : number;
        },
        dateFull: function (date) {
            return intlDateFullFormat(date instanceof Date ? date : new Date(date));
        },
        dateFullDigit: function (date) {
            return intlDateFullDigitFormat(date instanceof Date ? date : new Date(date));
        },
    };
});
