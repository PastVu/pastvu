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
        'knockout.mapping': 'lib/knockout/knockout.mapping',
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
    'Params', 'globalVM', 'RouteManager', 'renderer', 'text!tpl/appUser.jade', 'css!style/appUser', 'backbone.queryparams'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, P, globalVM, RouteManager, renderer, index_jade) {
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
            ko_mapping.fromJS({settings: data}, P);
            dfd.resolve();
        });
        socket.emit('giveGlobeParams');
        return dfd.promise();
    }

    function app() {
        Backbone.history.start({pushState: true, root: routerDeclare().root || '/', silent: false});
    }

    function routerDeclare() {
        return {
            root: '/u/',
            routes: [
                {route: "", handler: "profile"},
                {route: ":user", handler: "profile"},
                {route: ":user/settings", handler: "settings"},
                {route: "photoUpload", handler: "photoUpload"},
                {route: ":user/photo", handler: "photo"}
            ],
            handlers: {
                profile: function (user, params) {
                    console.log('User Profile');
                    this.params({user: user || ""});

                    renderer(
                        globalVM,
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/user/brief', container: '#user_brief'},
                            {module: 'm/user/menu', container: '#user_menu'},
                            {module: 'm/user/profile', container: '#user_content'}
                        ],
                        0,
                        function (top, home) {
                        }
                    );
                },
                settings: function (user, params) {
                    console.log('User Settings');
                    this.params({user: user || ""});

                    renderer(
                        globalVM,
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/user/brief', container: '#user_brief'},
                            {module: 'm/user/menu', container: '#user_menu'},
                            {module: 'm/user/settings', container: '#user_content'}
                        ],
                        0,
                        function (top, home) {
                        }
                    );
                },

                photoUpload: function (user, params) {
                    console.log('User Photo Upload');
                    this.params({user: user || ""});

                    renderer(
                        globalVM,
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/user/brief', container: '#user_brief'},
                            {module: 'm/user/menu', container: '#user_menu'},
                            {module: 'm/user/photoUpload', container: '#user_content'}
                        ],
                        0,
                        function (top, home) {
                        }
                    );
                },

                photo: function (user, params) {
                    console.log('User Photo');
                    this.params({user: user || ""});

                    renderer(
                        globalVM,
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/user/brief', container: '#user_brief'},
                            {module: 'm/user/menu', container: '#user_menu'},
                            {module: 'm/user/photo', container: '#user_content'}
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
