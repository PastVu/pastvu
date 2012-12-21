/*global requirejs:true, require:true, define:true*/
require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
    'Params', 'globalVM', 'RouteManager', 'renderer', 'text!tpl/appPhoto.jade', 'css!style/appPhoto', 'backbone.queryparams'
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
            root: '/p/',
            routes: [
                {route: ":photo", handler: "photo"},
                {route: ":photo/edit", handler: "edit"}
            ],
            handlers: {
                photo: function (photo, getParams) {
                    console.log('Photo ', photo);
                    this.params({photo: photo || ""});

                    renderer(
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/photo/photo', container: '#photo'}
                        ],
                        {
                            parent: globalVM,
                            level: 0,
                            callback: function (top, photo, news) {
                            }
                        }
                    );
                },
                edit: function (photo, getParams) {
                    console.log('Photo ', photo);
                    this.params({photo: photo || ""});

                    renderer(
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/photo/edit', container: '#photo'}
                        ],
                        {
                            parent: globalVM,
                            level: 0,
                            callback: function (top, edit, news) {
                            }
                        }
                    );
                }
            }
        };
    }

    window.appRouter = globalVM.router;
    window.glob = globalVM;
    window.ss = socket;
    console.timeStamp('=== app load (' + appHash + ') ===');
});
