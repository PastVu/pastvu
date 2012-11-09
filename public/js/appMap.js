/*global requirejs:true, require:true, define:true*/
requirejs.config({
    baseUrl: '/js',
    waitSeconds: 15,
    deps: ['lib/JSExtensions'],
    // Shim позволит нам настроить зависимоти для скриптов, которые не содержат define, чтобы объявить себя модулем
    shim: {
        /*'underscore': {
         exports: '_'
         },*/
        'backbone': {
            deps: [
                'underscore',
                'jquery'
            ],
            exports: 'Backbone'
        },
        'backbone.queryparams': {
            deps: [
                'backbone'
            ]//,
            //exports: ' Backbone.Router.arrayValueSplit'
        }
    },
    map: {
        '*': {
            'css': 'lib/require/plugins/require-css/css'
        }
    },
    paths: {
        'tpl': '/tpl',
        'style': '/style',

        'm': 'module',

        'jquery': 'lib/jquery/jquery-1.8.2.min',
        'bs': 'lib/bootstrap',
        'socket.io': 'lib/socket.io',
        'moment': 'lib/moment',

        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'async': 'lib/require/plugins/async',
        'goog': 'lib/require/plugins/goog',
        'Utils': 'lib/Utils',
        'Browser': 'lib/Browser',

        'lodash': 'lib/lodash',
        'underscore': 'lib/lodash',
        //'underscore': 'lib/underscore-min',
        'backbone': 'lib/backbone/backbone-min',
        'backbone.queryparams': 'lib/backbone/queryparams',

        'knockout': 'lib/knockout/knockout-2.1.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping-latest',
        'knockout.postbox': 'lib/knockout/knockout-postbox.min',

        'leaflet': 'lib/leaflet/leaflet'
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
    'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
    'globalParams', 'globalVM', 'renderer', 'RouteManager', 'text!tpl/appMap.jade', 'css!style/appMap', 'backbone.queryparams'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, GP, globalVM, renderer, RouteManager, index_jade) {
    "use strict";
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
        routeDFD = $.Deferred();

    $('body').append(index_jade);
    ko.applyBindings(globalVM);

    globalVM.router = new RouteManager(routerDeclare(), routeDFD);

    $.when(loadParams(), routeDFD.promise())
        .then(app);

    function loadParams() {
        var dfd = $.Deferred();
        socket.once('takeGlobeParams', function (data) {
            ko_mapping.fromJS(data, GP);
            dfd.resolve();
        });
        socket.emit('giveGlobeParams');
        return dfd.promise();
    }

    function app() {
        var loadTime = Utils.getCookie('oldmos.load.' + appHash);
        if (loadTime) {
            loadTime = new Date(loadTime);
        } else {
            loadTime = new Date();
            Utils.setCookie('oldmos.load.' + appHash, loadTime.toUTCString());
        }

        if (!$.urlParam('stopOnLoad')) {
            window.setTimeout(function () {
                document.getElementById('main_loader').classList.remove('show');
                Backbone.history.start({pushState: true, root: routerDeclare().root || '/', silent: false});
            }, Math.max(100, 2500 - (new Date() - loadTime)));
        }
    }

    function routerDeclare() {
        return {
            root: '/',
            routes: [
                {route: "", handler: "index"}
            ],
            handlers: {
                index: function (user, params) {
                    console.log('Index');
                    this.params({user: user || ""});

                    renderer(
                        globalVM,
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/map/mapBig', container: '#mapBig'}
                        ],
                        0,
                        function (top, home) {
                        }
                    );
                }
            }
        };
    }

    window.appRouter = globalVM.router;
    window.glob = globalVM;
    console.timeStamp('=== app load (' + appHash + ') ===');
});