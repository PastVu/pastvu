/*global define:true*/
/**
 * Internationalisation functions
 */
define(['Utils'], function () {
    'use strict';

    var intlNumFormat = new Intl.NumberFormat('en-US').format;
    var intlDateFormat = new Intl.DateTimeFormat('en-US').format;
    var intlDateFullFormat = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format;
    var intlDateFullDigitFormat = new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
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