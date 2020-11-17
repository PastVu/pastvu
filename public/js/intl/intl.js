/*global define:true*/
/**
 * Internationalisation functions
 */
define(['Utils'], function () {
    'use strict';

    const intlNumFormat = new Intl.NumberFormat('ru-RU').format;
    const intlDateFormat = new Intl.DateTimeFormat('ru-RU').format;
    const intlDateFullFormat = new Intl.DateTimeFormat('ru-RU', {
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
