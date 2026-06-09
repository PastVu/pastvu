/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/*global init:true*/
define([], function () {
    'use strict';

    // window.init.settings.lang reflects the resolved locale picked by the
    // server; same source public/js/i18n.js reads from. Formatter built once
    // and cached so the hot path is a single .format(n) call.
    const lang = typeof init !== 'undefined' && init.settings && init.settings.lang || 'en';
    const intlNumFormat = new Intl.NumberFormat(lang).format;

    return {
        num: function (number) {
            return typeof number === 'number' ? intlNumFormat(number) : number;
        },
    };
});
