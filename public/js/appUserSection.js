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
    paths: {
        'tpl': '/tpl',
        'style': '/style',

        'm': 'module',

        'jquery': 'lib/jquery/jquery-1.8.1.min',
        'bs': 'lib/bootstrap',
        'socket.io': 'lib/socket.io',

        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'css': 'lib/require/plugins/css',
        'css.api': 'lib/require/plugins/css.api',
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
        'knockout.postbox': 'lib/knockout/knockout-postbox.min'
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации

require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'underscore', 'backbone', 'knockout', 'knockout.mapping',
    'globalParams', 'globalVM', 'RouteManager', 'text!tpl/u.jade'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, GP, globalVM, RouteManager, index_jade) {
    "use strict";
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000';

    $('body').append(index_jade);
    ko.applyBindings(globalVM);

    globalVM.router = new RouteManager({globalVM: globalVM});
    Backbone.history.start({pushState: true, root: '/u/', silent: false});

    $.when(loadParams())
        //.pipe(auth.LoadMe)
        .then(app);

    function loadParams() {
        var dfd = $.Deferred();
        socket.on('takeGlobeParams', function (json) {
            ko_mapping.fromJS(json, GP);
            dfd.resolve();
        });
        socket.emit('giveGlobeParams');
        return dfd.promise();
    }

    function app() {
        document.body.classList.remove('crystal');
    }

    window.appRouter = globalVM.router;
    console.timeStamp('=== app load (' + appHash + ') ===');
});
