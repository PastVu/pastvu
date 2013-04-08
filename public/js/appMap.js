/*global requirejs:true, require:true, define:true*/
//require(['jquery'], function(jQuery){jQuery.noConflict(true); delete window.jQuery; delete window.$;}); //Убираем jquery из глобальной области видимости

require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'underscore', 'backbone', 'knockout', 'knockout.mapping',
    'Params', 'globalVM', 'renderer', 'RouteManager', 'text!tpl/appMap.jade', 'css!style/appMap', 'backbone.queryparams', 'bs/bootstrap-transition', 'knockout.extends', 'noty', 'noty.layouts/center', 'noty.themes/oldmos'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, P, globalVM, renderer, RouteManager, index_jade) {
    "use strict";
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
        routeDFD = $.Deferred();

    $('body').append(index_jade);

    //Обновлем размеры контейнера карты
    globalVM.mapH = ko.computed({
        read: function () {
            return P.window.h() - 33 - 50;
        },
        owner: this
    });

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
        var loadTime;

        if (window.wasLoading) {
            loadTime = Number(new Date(Utils.cookie.get('oldmos.load.' + appHash)));
            if (isNaN(loadTime)) {
                loadTime = 100;
            } else {
                loadTime = Math.max(100, 2600 - (Date.now() - loadTime));
            }
            console.log(loadTime);
            if (!$.urlParam('stopOnLoad')) {
                window.setTimeout(startApp, loadTime);
            }
        } else {
            Utils.cookie.set('oldmos.load.' + appHash, (new Date()).toUTCString());
            startApp();
        }

        function startApp() {
            if (window.wasLoading) {
                $('#main_loader').remove();
                delete window.wasLoading;
            }

            Backbone.history.start({pushState: true, root: routerDeclare().root || '/', silent: false});
        }
    }

    function routerDeclare() {
        return {
            root: '/',
            routes: [
                {route: "", handler: "index"}
            ],
            handlers: {
                index: function (user, getParams) {
                    console.log('Index');
                    this.params({_handler: 'index'});

                    renderer(
                        [
                            {module: 'm/top', container: '#topContainer'},
                            {module: 'm/map/map', container: '#mapContainer'},
	                        {module: 'm/main/commentsRibbon', container: '#commentsRibbon', options: {}}
                        ],
                        {
                            parent: globalVM,
                            level: 0,
                            callback: function (top, map, comments) {
                            }
                        }
                    );
                }
            }
        };
    }

    //window.appRouter = globalVM.router;
    //window.glob = globalVM;
    console.timeStamp('=== app load (' + appHash + ') ===');
});