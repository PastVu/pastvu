/*global requirejs:true, require:true, define:true*/
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
        routeDFD = $.Deferred(),
        auth;

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
        auth = globalVM.repository['m/auth'];
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

                photoUpload: function (params) {
                    console.log('User Photo Upload');
                    this.params({user: auth.iAm.login() || ""});

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
                            {module: 'm/user/photo', container: '#user_content', options: {canAdd: true}}
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
