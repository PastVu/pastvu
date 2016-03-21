/**
 * Params
 */
define(['jquery', 'underscore', 'socket!', 'Utils', 'knockout', 'knockout.mapping'], function ($, _, socket, Utils, ko, ko_mapping) {
    'use strict';
    var head = document.head,
        $window = $(window),

        Params = {
            window: {
                w: $window.width(),
                h: $window.height(),
                head: 35, // Top bar height
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
                CLUSTERING_ON_CLIENT_PIX_DELTA: { 17: 25, 18: 20, 19: 15, 20: 5, 'default': 15 },

                locDef: { lat: 40, lng: -17, z: 3 },
                locDefRange: ['gpsip', '_def_'],
                locDefRangeUser: ['last', 'home', 'gpsip', '_def_'],

                REGISTRATION_ALLOWED: false
            }
        };

    Params.window.square = Params.window.w * Params.window.h;
    updateSettings(init.settings, true);
    Params = ko_mapping.fromJS(Params, { copy: ['preaddrs', 'preaddr', 'window.head', 'settings.lang'] });

    // Пересчитываем размеры при ресайзе окна
    $window.on('resize', _.debounce(function () {
        var w = $window.width();
        var h = $window.height();
        Params.window.w(w);
        Params.window.h(h);
        Params.window.square(w * h);
    }, 50));

    // Обновляем настройки и в случае наличия поддоменов формируем их массив
    function updateSettings(settings, plain) {
        var subdomains;

        if (plain) {
            _.merge(Params.settings, settings);
            subdomains = settings.server.subdomains || [];
        } else {
            ko_mapping.fromJS({ settings: settings }, Params, { copy: ['preaddrs', 'preaddr', 'window.head'] });
            subdomains = Params.settings.server.subdomains() || [];
        }
        if (subdomains && subdomains.length) {
            subdomains(_.shuffle(subdomains));
            Params.preaddrs = subdomains.map(function (sub) {
                return '//' + sub + '.' + location.host;
            });
            Params.preaddr = Params.preaddrs[0];
        } else {
            Params.preaddrs = [];
            Params.preaddr = '';
        }
    }

    // Подписываемся на получение новых первоначальных данных (пользователь, куки, настройки)
    socket.on('takeInitData', function (data) {
        updateSettings(data.p); // Обновляем настройки
    });

    return Params;
});