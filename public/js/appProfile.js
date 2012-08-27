/*global requirejs:true*/
requirejs.config({
    baseUrl: '/js',
    waitSeconds: 15,
    deps: ['lib/JSExtensions'],

    paths: {
        'tpl': '../tpl',
        'style': '../style',

        'jquery': 'lib/jquery/jquery-1.8.0.min',
        'socket.io': 'lib/socket.io',

        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'css': 'lib/require/plugins/css',
        'css.api': 'lib/require/plugins/css.api',
        'async': 'lib/require/plugins/async',
        'goog': 'lib/require/plugins/goog',
        'Utils': 'lib/Utils',
        'Browser': 'lib/Browser',

        'knockout': 'lib/knockout/knockout-2.1.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping-latest',

        'jquery.datepick': 'lib/jquery/plugins/datepick/jquery.datepick',
        'jquery.datepick.lang': 'lib/jquery/plugins/datepick/jquery.datepick.lang'
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации

require([
    'domReady!',
    'jquery',
    'Browser', 'Utils',
    'socket',
    'EventTypes',
    'knockout', 'knockout.mapping',
    'mvvm/GlobalParams', 'mvvm/User', 'mvvm/TopPanel', 'mvvm/i18n',
    'KeyHandler', 'auth',
    'jquery.datepick', 'jquery.datepick.lang'
], function (domReady, $, Browser, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, keyTarget, auth) {
    console.timeStamp('Require app Ready');
    var login, reg, recall,
        profileView, profileVM;

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
        new TopPanel('top_panel_fringe');

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
                    window.setTimeout(function () {
                        $('#in_birthdate').datepick($.extend({format: 'yyyy-mm-dd'}, $.datepick.regional['ru']));
                    }, 1000);

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

            profileView.classList.add('show');

        });
        socket.emit('giveUser', {login: location.href.substring(location.href.indexOf('/u/') + 3)});

    }

});
