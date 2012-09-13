/*global requirejs:true*/
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
    'mvvm/GlobalParams', 'mvvm/User', 'mvvm/TopPanel', 'mvvm/i18n',
    'KeyHandler', 'auth',
    'bs/bootstrap-affix', 'bs/bootstrap-datepicker'
], function (domReady, $, Browser, Utils, socket, _, Backbone, ko, ko_mapping, GP, User, TopPanel, i18n, keyTarget, auth) {
    "use strict";
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
        AppRouter = Backbone.Router.extend({
            routes: {
                "": "root",
                ":user": "user",
                ":user/photo": "photo",
                "*other": "defaultRoute"
            },

            root: function (params) {
                console.log('home');
                renderer(
                    globalVM,
                    [
                        {module: 'm/top', container: '#top_container'},
                        {module: 'm/home', container: '#main_container'}
                    ],
                    0,
                    function (top, home) {
                        //window.setTimeout(function () { $(window).trigger('resize'); }, 500);
                    }
                );

                globalVM.route.base('root');
                globalVM.route.param(null);
                globalVM.routeHistory.add('', '', (params && params.leaf) || '');
            },

            video: function (id, params) {
                console.log('video');

                globalVM.routeHistory.add('video', id, (params && params.leaf) || '');
                globalVM.route.base('video');
                globalVM.route.param(id);

                renderer(
                    globalVM,
                    [
                        {module: 'm/top', container: '#top_container'},
                        {module: 'm/video', container: '#main_container'}
                    ],
                    0,
                    function (top, video) {
                        //window.setTimeout(function () { $(window).trigger('resize'); }, 500);
                    }
                );
            },

            defaultRoute: function (other, params) {
                console.log("Invalid. You attempted to reach:" + other);
                document.location.href = other;
            }
        }),
        appRouter = new AppRouter(),
        login,
        reg,
        recall,
        profileView,
        profileVM;

    Backbone.history.start({pushState: true, root: '/u/', silent: false});

    $.when(loadParams())
        .pipe(auth.LoadMe)
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
        new TopPanel('top');

        profileView = document.getElementById('mainrow');

        socket.on('initMessage', function (json) {
            var init_message = json.init_message;
        });

        socket.on('takeUser', function (user) {
            profileVM = User.VM(user, profileVM);

            profileVM.edit = ko.observable(false);

            profileVM.originUser = user;

            profileVM.canBeEdit = ko.computed(function () {
                return auth.iAm.login() === this.login() || auth.iAm.role_level() >= 50;
            }, profileVM);

            profileVM.edit_mode = ko.computed(function () {
                return this.canBeEdit() && this.edit();
            }, profileVM);
            profileVM.edit_mode.subscribe(function (val) {
                if (val) {
                    document.body.classList.add('edit_mode');

                } else {
                    document.body.classList.remove('edit_mode');
                }
            });

            profileVM.can_pm = ko.computed(function () {
                return auth.iAm.login() !== this.login();
            }, profileVM);

            profileVM.saveUser = function () {
                var targetUser = ko_mapping.toJS(profileVM),
                    key;

                console.dir(targetUser);
                for (key in targetUser) {
                    if (targetUser.hasOwnProperty(key) && key !== 'login') {
                        if (profileVM.originUser[key] && targetUser[key] === profileVM.originUser[key]) {
                            delete targetUser[key];
                        } else if (!profileVM.originUser[key] && targetUser[key] === User.def[key]) {
                            delete targetUser[key];
                        }
                    }
                }
                if (Utils.getObjectPropertyLength(targetUser) > 1) {
                    socket.emit('saveUser', targetUser);
                }
                profileVM.edit(false);
            };

            ko.applyBindings(profileVM, profileView);

            window.setTimeout(function () {
                $('#birthPick')
                    .datepicker()
                    .on('changeDate', function (ev) {
                        profileVM.birthdate($('#inBirthdate').val());
                        console.log(ev);
                    });
            }, 1000);

            profileView.classList.add('show');

        });
        socket.emit('giveUser', {login: location.href.substring(location.href.indexOf('/u/') + 3)});


        $('#brief').affix({
            offset: {
                top: 80,
                //bottom: 270
            }
        });
    }

    window.appRouter = appRouter;
    console.timeStamp('=== app load (' + appHash + ') ===');
});
