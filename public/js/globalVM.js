/*global requirejs:true, require:true, define:true*/
/**
 * GlobalParams
 */
define(['jquery', 'Utils', 'underscore', 'globalParams', 'i18n', 'knockout'], function ($, Utils, _, GP, i18n, RouteManager, ko) {
    "use strict";
    var globalVM = {
        GlobalParams: GP,
        i18n: i18n,
        router: null,

        childModules: {},
        repository: {}
    };

    return globalVM;
});