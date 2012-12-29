/*global requirejs:true, require:true, define:true*/
/**
 * globalVM
 */
define(['jquery', 'Utils', 'underscore', 'Params', 'i18n', 'knockout', 'lib/PubSub'], function ($, Utils, _, P, i18n, ko, ps) {
    "use strict";
    var globalVM = {
        P: P,
        pb: ps,
        i18n: i18n,
        router: null,

        childModules: {},
        repository: {}
    };

    return globalVM;
});