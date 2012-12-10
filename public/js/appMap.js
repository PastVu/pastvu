/*global requirejs:true, require:true, define:true*/
//require(['jquery'], function(jQuery){jQuery.noConflict(true); delete window.jQuery; delete window.$;}); //Убираем jquery из глобальной области видимости

require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'underscore', 'backbone', 'knockout', 'knockout.mapping', 'moment',
    'Params', 'globalVM', 'renderer', 'RouteManager', 'text!tpl/appMap.jade', 'css!style/appMap', 'backbone.queryparams'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, moment, P, globalVM, renderer, RouteManager, index_jade) {
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
                        [
                            {module: 'm/top', container: '#top_container'},
                            {module: 'm/map/mapBig', container: '#mapBig'}
                        ],
                        {
                            parent: globalVM,
                            level: 0,
                            callback: function (top, mapBig, news) {
                            }
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