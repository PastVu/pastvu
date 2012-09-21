/*global requirejs:true*/
requirejs.config({
    baseUrl: '/js',
    waitSeconds: 15,
    deps: ['lib/JSExtensions'],
    // Shim позволит нам настроить зависимоти для скриптов, которые не содержат define, чтобы объявить себя модулем
    shim: {
        /*'geoplugin': {
         exports: 'geoplugin_status'
         }*/
    },
    paths: {
        'tpl': '../tpl',
        'style': '../style',

        'jquery': 'lib/jquery/jquery-1.8.1.min',
        'bs': 'lib/bootstrap',
        'socket.io': 'lib/socket.io',

        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'css': 'lib/require/plugins/css',
        'css.api': 'lib/require/plugins/css.api',
        'css.pluginBuilder': 'lib/require/plugins/css.pluginBuilder',
        'async': 'lib/require/plugins/async',
        'goog': 'lib/require/plugins/goog',
        'Utils': 'lib/Utils',
        'Browser': 'lib/Browser',

        'knockout': 'lib/knockout/knockout-2.1.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
        'leaflet': 'lib/leaflet/leaflet_0.4.4'
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации
//require(['jquery'], function(jQuery){jQuery.noConflict(true); delete window.jQuery; delete window.$;}); //Убираем jquery из глобальной области видимости

require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'EventTypes',
    'knockout', 'knockout.mapping',
    'm/GlobalParams', 'm/User', 'm/TopPanel', 'm/i18n',
    'leaflet', 'lib/leaflet/extends/L.neoMap', 'nav_slider',
    'Locations', 'KeyHandler', 'auth',
    'css!style/map_main', 'css!style/jquery.toast'
], function (domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, L, Map, NavigationSlider, Locations, keyTarget, auth) {
    console.timeStamp('Require app Ready');

    var map, layers = {},
        mapDefCenter = new L.LatLng(Locations.current.lat, Locations.current.lng),
        poly_mgr,
        navSlider;

    $.when(loadParams())
        .pipe(auth.LoadMe)
        .then(app);

    function loadParams() {
        var dfd = $.Deferred();
        socket.on('takeGlobeParams', function (json) {
            ko_mapping.fromJS(json, GlobalParams);
            dfd.resolve();
        });
        socket.emit('giveGlobeParams');
        return dfd.promise();
    }

    function app() {

        createMap();
        navSlider = new NavigationSlider(document.querySelector('#nav_panel #nav_slider_area'), map);

        new TopPanel('top');

        var loadTime = Utils.getCookie('oldmos.load.' + GlobalParams.appHash());
        if (loadTime) {
            loadTime = new Date(loadTime);
        } else {
            loadTime = new Date();
            Utils.setCookie('oldmos.load.' + GlobalParams.appHash(), loadTime.toUTCString());
        }

        if (!$.urlParam('stopOnLoad')) window.setTimeout(function () {
            document.getElementById('main_loader').classList.remove('visi');
            document.querySelector('#main').style.opacity = '1';
        }, Math.max(100, 2500 - (new Date() - loadTime)));

        //if(init_message) $().toastmessage('showSuccessToast', init_message);
    }

    function createMap() {
        map = new L.neoMap('map', {center: mapDefCenter, zoom: Locations.current.z, minZoom: 0, maxZoom: 18, zoomAnimation: true});

        layers = map.layers;
        var systems = document.createDocumentFragment(), sysElem, typeElem, sysNum = 0;

        for (var lay in layers) {
            if (!layers.hasOwnProperty(lay)) continue;

            sysElem = $('<div/>', {id: lay})
                .append($('<span/>', {'class': 'head', 'html': layers[lay].desc}));

            for (var type in layers[lay].types) {
                if (!layers[lay].types.hasOwnProperty(type)) continue;

                typeElem = $('<div/>', {html: layers[lay].types[type].desc, 'maptp': type}).appendTo(sysElem);
                Utils.Event.add(typeElem[0], 'click', function (event, s, t) {
                    map.selectLayer(s, t);
                }.neoBind(typeElem[0], [lay, type]));
                layers[lay].types[type].dom = typeElem[0];
            }
            systems.appendChild(sysElem[0]);
            sysNum++;
        }

        document.querySelector('#layers_panel #systems').appendChild(systems);
        document.querySelector('#layers_panel #systems').classList.add('s' + sysNum);

        Locations.subscribe(function (val) {
            mapDefCenter = new L.LatLng(val.lat, val.lng);
            setMapDefCenter(true);
        });

        if (!!window.localStorage && !!window.localStorage['arguments.SelectLayer']) {
            map.selectLayer.apply(map, window.localStorage['arguments.SelectLayer'].split(','))
        } else {
            map.selectLayer('osm', 'mapnik');
        }
    }


    function setMapDefCenter(forceMoveEvent) {
        map.setView(mapDefCenter, Locations.current.z, false);
    }

});
