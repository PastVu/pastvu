/*global define:true*/
/**
 * Internationalisation functions
 */
define(['Utils'], function () {
    'use strict';

    var intlNumFormat = new Intl.NumberFormat('ru-RU').format;

    return {
        num: function (number) {
            return typeof number === 'number' ? intlNumFormat(number) : number;
        },
    };
});