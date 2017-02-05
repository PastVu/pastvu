/*global define:true*/
/**
 * Internationalisation functions
 */
define(['Utils'], function () {
    'use strict';

    var intlNumFormat = new Intl.NumberFormat('en-EN').format;

    return {
        num: function (number) {
            return typeof number === 'number' ? intlNumFormat(number) : number;
        },
    };
});