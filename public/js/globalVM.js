/*global requirejs:true, require:true, define:true*/
/**
 * globalVM
 */
define(['jquery', 'Utils', 'underscore', 'Params', 'i18n', 'knockout'], function ($, Utils, _, P, i18n, RouteManager, ko) {
    "use strict";
    var globalVM = {
        P: P,
        i18n: i18n,
        router: null,

        childModules: {},
        repository: {}
    };

    return globalVM;
});