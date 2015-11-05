/**
 * Менеджер путей
 */
define(['jquery', 'underscore', 'Utils', 'knockout', 'globalVM', 'renderer'], function ($, _, Utils, ko, globalVM, renderer) {
    "use strict";

    var global = window;
    var hasHistoryApi = !!(global.history && global.history.pushState);
    var router = {
        init: function (options) {
            if (router.inited) {
                console.warn('Double router init');
                return false;
            }
            if (!options) {
                options = {};
            }

            router.routeChanged = ko.observable(location.href);
            router.params = ko.observable({});
            router.blockHrefs = false;

            if (options && options.globalModules) {
                //Регистрируем глобальные модули
                renderer(
                    options.globalModules.modules,
                    options.globalModules.options
                );
            }

            //Вставляем обработчики модулей обернутые в враппер
            if (options && options.handlers) {
                _.forEach(options.handlers, function (item, key) {
                    router.addHandler(key, item);
                });
            }

            //Регистрируем переданные модули
            if (options && options.routes) {
                options.routes.forEach(function (item) {
                    router.addRoute(item.route, item.handler);
                });
            }

            if (hasHistoryApi) {
                $(document).on('click', 'a', { prefix: '', body: 'route' }, router.ahrefHandler);
                $(global).on('popstate', router.triggerUrl); //Only triggered by doing a browser action such as a clicking on the back button (or calling history.back())
            }
            router.inited = true;
            return router;
        },
        start: function () {
            router.triggerUrl();
        },

        routes: [],
        handlers: {},
        addRoute: function (route, handler, ctx) {
            router.routes.push({ route: route, handler: handler, ctx: ctx });
        },
        addHandler: function (name, func) {
            router.handlers[name] = _.wrap(func, router.handlerWrapper);
        },
        handlerWrapper: function (handler) {
            handler.apply(null, Array.prototype.slice.call(arguments, 1));
        },

        navigate: function (url, options) {
            if (hasHistoryApi) {
                if (!options) {
                    options = {};
                }
                global.history[options.replace ? 'replaceState' : 'pushState']({}, null, url);
                if (options.trigger !== false) {
                    if (!router.triggerUrl()) {
                        global.location.reload(); //Если triggerUrl не нашел обработчиков, просто рефрешим с новым url
                    }

                    // Flag that we navigated at least once by inner links after initial start
                    router.navigated = true;
                }
            } else {
                global.location = url;
            }
        },

        back: function () {
            if (hasHistoryApi) {
                global.history.back();
            }
        },

        triggerUrl: function () {
            var qparams = Utils.getURLParameters(location.href);
            var pathname = location.pathname;
            var matchedArgs;
            var handler;
            var triggered = false;

            router.routes.forEach(function (item) {
                if (item.route.test(pathname)) {
                    handler = router.handlers[item.handler];
                    if (_.isFunction(handler)) {
                        matchedArgs = _.chain(pathname.match(item.route)).toArray().rest().value();
                        matchedArgs.push(qparams);
                        handler.apply(item.ctx, matchedArgs);
                        triggered = true;
                    }
                }
            });
            router.routeChanged(location.href);
            return triggered;
        },
        checkUrl: function (pathname) {
            if (!pathname) {
                return false;
            }
            return _.some(router.routes, function (item) {
                return item.route.test(pathname) && _.isFunction(router.handlers[item.handler]);
            });
        },

        // Глобальный обработчик клика по ссылке
        ahrefHandler: function (evt) {
            if (!hasHistoryApi) {
                return;
            }

            var target = this.getAttribute('target');
            var href = this.getAttribute('href');
            var hrefCurrent = location.href;
            var replaceState;
            var paramsVals;
            var paramsCurrentVals;
            var paramsStringNew;

            if (!href || href.length === 0 || router.blockHrefs) {
                evt.preventDefault();
            } else if (target !== '_blank' && !evt.ctrlKey && !evt.shiftKey && !evt.altKey && !evt.metaKey) {
                // target === '_blank' --> Open a link in a new tab in foreground.
                // Ctrl/Cmd + Shift + Click --> Open a link in a new tab in foreground.
                // Ctrl/Cmd + Click --> Open a link in a new tab in backgroud.
                // Shift + Click --> Open a link in a new window.
                // Alt + Click --> Save the target on disk (open the Save As dialog).

                // Если на элементе стоит аттрибут data-replace="true", то вызываем replaceState вместо pushState
                replaceState = (this.dataset && this.dataset.replace || this.getAttribute('data-replace')) === 'true';

                if (href.indexOf('?') === 0 && href.indexOf('=') > 0) {
                    // Если весь href состоит только из параметров '?x=1&y=1'

                    paramsVals = Utils.getURLParameters(href);
                    paramsCurrentVals = Utils.getURLParameters(hrefCurrent);
                    delete paramsCurrentVals.hl; // Удаляем во время перехода hl текущей страницы

                    paramsStringNew = _.reduce(paramsVals, function (result, item, key) {
                        return result + (paramsCurrentVals[key] ? Utils.urlReplaceParameterValue(result, key, item) : key + '=' + item + '&');
                    }, _.size(paramsCurrentVals) ? hrefCurrent.substr(hrefCurrent.indexOf('?')) + '&' : '?');

                    evt.preventDefault(); // Должен быть внутри этих if, т.к. если они не подходят должен продолжиться стандартный переход по ссылке
                    router.navigate(location.pathname + paramsStringNew.substring(0, paramsStringNew.length - 1), { replace: replaceState });
                } else if (router.checkUrl(Utils.parseUrl(href, this).pathname)) {
                    // Если у нас есть обработчик на данный url, навигируемся
                    evt.preventDefault();
                    router.navigate(href, { replace: replaceState });
                }
            }
        },
        // Блокирует переход по ссылкам
        ahrefBlock: function (flag) {
            router.blockHrefs = _.isBoolean(flag) ? flag : !router.blockHrefs;
        }
    };

    return router;
});