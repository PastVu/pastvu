/*global define:true*/
/**
 * Params
 */
define(['jquery', 'underscore', 'knockout', 'knockout.mapping'], function ($, _, ko, ko_mapping) {
	'use strict';
	var head = document.head || document.getElementsByTagName('head')[0],
		appHash = (head.dataset && head.dataset.apphash) || head.getAttribute('data-apphash') || '000',
		appName = (head.dataset && head.dataset.appname) || head.getAttribute('data-appname') || 'Main',
		$window = $(window),

		Params = ko_mapping.fromJS(
			{
				window: {
					w: $window.width(),
					h: $window.height(),
					square: $window.width() * $window.height()
				},
				settings: {
					client: {},
					server: {},

					appVersion: '0',
					appHash: appHash,
					appName: appName,

					USE_OSM_API: true,
					USE_GOOGLE_API: true,
					USE_YANDEX_API: true,

					FIRST_CLIENT_WORK_ZOOM: 17,
					CLUSTERING_ON_CLIENT: true,
					CLUSTERING_ON_CLIENT_PIX_DELTA: {17: 25, 18: 20, 19: 15, 20: 5, 'default': 15},


					locDef: {lat: 40, lng: -17, z: 3},
					locDefRange: ['gpsip', '_def_'],
					locDefRangeUser: ['last', 'home', 'gpsip', '_def_'],

					REGISTRATION_ALLOWED: false
				},
				photoDirsArr: ['w', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'aero'],
				photoDirsTxt: {
					n: 'Север',
					ne: 'Северо-Восток',
					e: 'Восток',
					se: 'Юго-Восток',
					s: 'Юг',
					sw: 'Юго-Запад',
					w: 'Запад',
					nw: 'Северо-Запад',
					aero: 'Аэро/Спутник'
				}
			}
		);

	$window.on('resize', _.debounce(function () {
		Params.window.w($window.width());
		Params.window.h($window.height());
		Params.window.square(Params.window.w() * Params.window.h());
	}, 50));

	return Params;
});