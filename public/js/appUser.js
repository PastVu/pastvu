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

        'jquery.ui.widget': 'lib/jquery/ui/jquery.ui.widget',
        'jquery.fileupload': 'lib/jquery/plugins/fileupload',
        'load-image': 'lib/jquery/plugins/fileupload/load-image',
        'tmpl': 'lib/jquery/plugins/fileupload/tmpl',
        'canvas-to-blob': 'lib/jquery/plugins/fileupload/canvas-to-blob'
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации

require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
    'globalParams', 'globalVM', 'RouteManager', 'text!tpl/appUser.jade', 'css!style/user/appUser', 'backbone.queryparams'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, GP, globalVM, RouteManager, index_jade) {
    "use strict";
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
        routeDFD = $.Deferred();

    $('body').append(index_jade);
    ko.applyBindings(globalVM);

    globalVM.router = new RouteManager({globalVM: globalVM}, routeDFD);

    $.when(loadParams(), routeDFD.promise())
        //.pipe(historyStart)
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

    function historyStart() {
        Backbone.history.start({pushState: true, root: '/u/', silent: false});
    }

    function app() {
        Backbone.history.start({pushState: true, root: '/u/', silent: false});

    }

    window.appRouter = globalVM.router;
    window.glob = globalVM;
    console.timeStamp('=== app load (' + appHash + ') ===');
});
