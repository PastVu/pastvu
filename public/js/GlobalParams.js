/*global requirejs:true, require:true, define:true*/
/**
 * GlobalParams
 */
define(['jquery', 'underscore', 'knockout', 'knockout.mapping', 'socket', 'Utils'], function ($, _, ko, ko_mapping, socket, Utils) {
    var $window = $(window),
        GlobalParams = ko_mapping.fromJS({
            Width: Utils.getClientWidth(),
            Height: Utils.getClientHeight(),

            USE_OSM_API: true,
            USE_GOOGLE_API: true,
            USE_YANDEX_API: true,
            appVersion: 0,
            appHash: 0,
            verBuild: 0,

            locDef: {lat: 40, lng: -17, z: 3},
            locDefRange: ['gpsip', '_def_'],
            locDefRangeUser: ['last', 'home', 'gpsip', '_def_'],

            REGISTRATION_ALLOWED: false,
            LoggedIn: false
        });

    $window.on('resize', _.debounce(function () {
        GlobalParams.Width($window.width());
        GlobalParams.Height($window.height());
    }, 50, false));

    return GlobalParams;
});