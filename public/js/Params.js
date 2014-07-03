/*global define:true*/
/**
 * Params
 */
define(['jquery', 'underscore', 'knockout', 'knockout.mapping'], function ($, _, ko, ko_mapping) {
	'use strict';
	var head = document.head,
		$window = $(window),

		Params = {
			window: {
				w: $window.width(),
				h: $window.height(),
				square: null
			},
			settings: {
				client: {},
				server: {},
				appName: (head.dataset && head.dataset.appname) || head.getAttribute('data-appname') || 'Main',

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
			},
			times: {
				msDay: 864e5,
				msWeek: 6048e5,

				midnight: null, //Миллисекунды полуночи текущего дня
				midnightWeekAgo: null //Миллисекунды полуночи семи дней назад
			},
			//Обновляем настройки и в случае наличия поддоменов формируем их массив
			updateSettings: function (settings, plain) {
				var subdomains;
				if (plain) {
					_.merge(Params.settings, settings);
					subdomains = settings.server.subdomains || [];
				} else {
					ko_mapping.fromJS({settings: settings}, Params, {copy: ['updateParams', 'times', 'preaddrs', 'preaddr']});
					subdomains = Params.settings.server.subdomains() || [];
				}
				if (subdomains && subdomains.length) {
					subdomains(_.shuffle(subdomains));
					Params.preaddrs = subdomains.map(function (sub) {
						return (location.protocol || 'http:') + '//' + sub + '.' + location.host;
					});
					Params.preaddr = Params.preaddrs[0];
				} else {
					Params.preaddrs = [];
					Params.preaddr = '';
				}
			}
		};

	Params.window.square = Params.window.w * Params.window.h;
	Params.updateSettings(init.settings, true);
	Params = ko_mapping.fromJS(Params, {copy: ['updateParams', 'times', 'preaddrs', 'preaddr']});

	//Считаем переменные времен
	(function timesRecalc() {
		var dateMidnight = new Date();

		Params.times.midnight = dateMidnight.setHours(0, 0, 0, 0);
		Params.times.midnightWeekAgo = Params.times.midnight - Params.times.msWeek;

		setTimeout(timesRecalc, Params.times.midnight + Params.times.msDay - Date.now() + 1); //Планируем пересчет на первую миллисекунду следующего дня
	}());

	$window.on('resize', _.debounce(function () {
		var w = $window.width(),
			h = $window.height();
		Params.window.w(w);
		Params.window.h(h);
		Params.window.square(w * h);
	}, 50));

	return Params;
});