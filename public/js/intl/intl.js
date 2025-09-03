/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['Utils'], function () {
    'use strict';

    const intlNumFormat = new Intl.NumberFormat('en-US').format;
    const intlDateFormat = new Intl.DateTimeFormat('en-US').format;
    const intlDateFullFormat = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format;
    const intlDateFullDigitFormat = new Intl.DateTimeFormat('ru-RU', {
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
        date: function (date) {
            return intlDateFormat(date instanceof Date ? date : new Date(date));
        },
        dateFull: function (date) {
            return intlDateFullFormat(date instanceof Date ? date : new Date(date));
        },
        dateFullDigit: function (date) {
            return intlDateFullDigitFormat(date instanceof Date ? date : new Date(date));
        },
    };
});
