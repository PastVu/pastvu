/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

require([
    'domReady!', 'jquery', 'Browser', 'Utils', 'socket!', 'underscore', 'knockout', 'moment',
    'globalVM', 'Params', 'renderer', 'router', 'model/Photo', 'model/User', 'noties', 'analytics',
    'text!tpl/appMain.pug', 'css!style/appMain', 'momentlang/ru', 'bs/transition', 'bs/popover',
    'knockout.extends', 'noty', 'noty.layouts', 'noty.themes/pastvu', 'jquery-plugins/scrollto',
], function (domReady, $, Browser, Utils, socket, _, ko, moment, globalVM, P, renderer, router, Photo, User, noties, analytics, html) {
    'use strict';

    Utils.title.setPostfix('Фотографии прошлого');

    const routerDeferred = $.Deferred();
    const routerAnatomy = {
        globalModules: {
            modules: [
                { module: 'm/common/auth', container: '#auth', global: true },
                { module: 'm/common/top', container: '#topContainer', global: true },
                { module: 'm/common/foot', container: '#footContainer', global: true },
            ],
            options: {
                parent: globalVM,
                level: 0,
                callback: function (auth, top) {
                    top.show();
                    routerDeferred.resolve();
                },
            },
        },
        routes: [
            { route: /^\/?$/, handler: 'index' },
            { route: /^\/p\/([0-9]{1,7})\/?$/, handler: 'photo' },
            { route: /^\/ps(?:\/(\w{1,5}))?\/?$/, handler: 'photos' },
            { route: /^\/u(?:\/([.\w-]+)(?:\/(\w+)(?:\/(\w+))?)?)?\/?$/, handler: 'userPage' },
            { route: /^\/news(?:\/([0-9]{1,5}))?\/?$/, handler: 'news' },
            { route: /^\/photoUpload\/?$/, handler: 'photoUpload' },
            { route: /^\/(about)\/?$/, handler: 'about' },
            { route: /^\/confirm\/(\w+)\/?$/, handler: 'confirm' },
        ],
        handlers: {
            index: function (qparams) {
                router.params(_.assign({ _handler: 'index' }, qparams));

                renderer(
                    [
                        { module: 'm/main/mainPage', container: '#bodyContainer' },
                    ]
                );
            },
            photo: function (cid, qparams) {
                cid = Number(cid);

                if (!cid) {
                    return globalVM.router.navigate('/ps');
                }

                router.params(_.assign({ cid: cid, _handler: 'photo' }, qparams));
                renderer(
                    [
                        { module: 'm/photo/photo', container: '#bodyContainer' },
                    ]
                );
            },
            photos: function (page, qparams) {
                router.params(_.assign({ page: page, _handler: 'gallery' }, qparams));

                if (page !== 'feed' && page !== 'coin') {
                    // Suppress numbered pagination in analytics.
                    gtag('set', 'page_path', '/ps');
                }

                renderer(
                    [
                        { module: 'm/photo/gallery', container: '#bodyContainer', options: { } },
                    ]
                );
            },
            userPage: function (login, section, page, qparams) {
                const auth = globalVM.repository['m/common/auth'];

                if (!login && !auth.loggedIn()) {
                    return globalVM.router.navigate('/');
                }

                if (!section) {
                    section = 'profile';
                    // Override page_path to reflect /profile for the default user page location in analytics.
                    gtag('set', 'page_path', `/u/${login}/profile`);
                }

                router.params(_.assign({
                    user: login,
                    section: section,
                    page: page,
                    _handler: 'profile',
                }, qparams));

                renderer(
                    [
                        { module: 'm/user/userPage', container: '#bodyContainer' },
                    ]
                );
            },
            photoUpload: function () {
                router.params({ section: 'photo', photoUpload: true, _handler: 'profile' });

                renderer(
                    [
                        { module: 'm/user/userPage', container: '#bodyContainer' },
                    ]
                );
            },
            about: function (section) {
                const params = router.params();
                const footParams = {};

                footParams[section] = true;

                if (_.isEmpty(params)) {
                    routerAnatomy.handlers.index(footParams);
                } else {
                    router.params(_.assign(_.clone(params), footParams));
                }
            },
            news: function (cid, qparams) {
                cid = Number(cid);

                const mName = cid ? 'm/diff/news' : 'm/diff/newsList';

                router.params(_.assign({ cid: cid, _handler: 'news' }, qparams));
                renderer(
                    [
                        { module: mName, container: '#bodyContainer' },
                    ]
                );
            },
            confirm: function (key, qparams) {
                const auth = globalVM.repository['m/common/auth'];

                router.params(_.assign({ key: key, _handler: 'confirm' }, qparams));

                socket.run('auth.checkConfirm', { key: key })
                    .then(function (data) {
                        renderer([{ module: 'm/main/mainPage', container: '#bodyContainer' }]);

                        gtag('event', 'page_view', {
                            page_title: 'Confirm',
                            page_path: '/confirm',
                        });

                        if (data.type === 'noty') {
                            noties.alert({
                                message: data.message,
                                type: 'success',
                                countdown: 8,
                                ok: true,
                                okText: 'Ok',
                                okClass: 'btn-success',
                                onOk: function () {
                                    globalVM.router.navigate('/');
                                },
                            });
                        } else if (data.type === 'authPassChange' && data.login) {
                            auth.showPassChangeRecall(data, key, function (/*result*/) {
                                globalVM.router.navigate('/');
                            });
                        }
                    })
                    .catch(function (error) {
                        console.error('checkConfirmResult', error);
                        globalVM.router.navigate('/');
                    });
            },
        },
    };

    moment.locale('ru');

    $('body').append(html);
    ko.applyBindings(globalVM);

    // Initialise Google Analytics.
    analytics.install();

    globalVM.router = router.init(routerAnatomy);
    $.when(routerDeferred.promise()).then(function () {
        router.start();

        // App info in console.
        const string = `PastVu App v${P.settings.version()} loaded. Bug reports and contribs are welcome at https://github.com/PastVu/pastvu`;

        console.log('%c ✪ %c' + string, 'color: #E07C79; font-size: 1.5em;', 'color: #3585F7; font-family: monospace;');
    });
    // window.appRouter = globalVM.router;
    // window.glob = globalVM;
});
