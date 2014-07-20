/**
 * Менеджер путей
 */
define(['jquery', 'underscore', 'Utils', 'backbone', 'knockout', 'globalVM', 'renderer'], function ($, _, Utils, Backbone, ko, globalVM, renderer) {
	"use strict";

	var global = window,
		hasHistoryApi = !!(global.history && global.history.pushState),
		router = {
			init: function (options) {
				if (router.inited) {
					console.warn('Double router init');
					return false;
				}
				if (!options) {
					options = {};
				}

				router.routeChanged = ko.observable();
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
					$(document).on('click', 'a', {prefix: '', body: 'route'}, router.ahrefHandler);
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
				router.routes.push({route: route, handler: handler, ctx: ctx});
			},
			addHandler: function (name, func) {
				router.handlers[name] = _.wrap(func, router.handlerWrapper);
			},
			handlerWrapper: function (handler) {
				handler.apply(null, Array.prototype.slice.call(arguments, 1));
				router.routeChanged(location.pathname);
			},

			navigate: function (url, options) {
				if (hasHistoryApi) {
					if (!options) {
						options = {};
					}
					global.history[options.replace ? 'replaceState' : 'pushState']({}, null, url);
					if (options.trigger !== false) {
						router.triggerUrl();
					}
				} else {
					global.location = url;
				}
			},

			triggerUrl: function () {
				var qparams = Utils.getURLParameters(location.href),
					pathname = location.pathname,
					matchedArgs,
					handler;

				router.routes.forEach(function (item) {
					if (item.route.test(pathname)) {
						handler = router.handlers[item.handler];
						if (handler) {
							matchedArgs = _.chain(pathname.match(item.route)).toArray().rest().value();
							matchedArgs.push(qparams);
							handler.apply(item.ctx, matchedArgs);
						}
					}
				});
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
				var target = this.getAttribute('target'),
					href = this.getAttribute('href'),
					hrefCurrent = location.href,
					paramsVals,
					paramsValsCurrent,
					paramsStringNew;

				if (!href || href.length === 0 || router.blockHrefs) {
					evt.preventDefault();
				} else if (target !== '_blank' && !evt.ctrlKey && !evt.shiftKey && !evt.altKey) {
					//target === '_blank' --> Open a link in a new tab in foreground.
					//Ctrl + Shift + Click --> Open a link in a new tab in foreground.
					//Ctrl + Click --> Open a link in a new tab in backgroud.
					//Shift + Click --> Open a link in a new window.
					//Alt + Click --> Save the target on disk (open the Save As dialog).

					if (href.indexOf('?') === 0 && href.indexOf('=') > 0) {
						//Если весь href состоит только из параметров '?x=1&y=1'

						paramsVals = Utils.getURLParameters(href);
						paramsValsCurrent = Utils.getURLParameters(hrefCurrent);
						delete paramsValsCurrent.hl; //Удаляем во время перехода hl текущей страницы

						if (_.size(paramsValsCurrent)) {
							paramsStringNew = hrefCurrent.substr(hrefCurrent.indexOf('?')) + '&';
							_(paramsVals).forEach(function (item, key) {
								if (paramsValsCurrent[key]) {
									paramsStringNew = Utils.urlReplaceParameterValue(paramsStringNew, key, item);
								}
							});
						} else {
							paramsStringNew = '?';
						}

						_(paramsVals).forEach(function (item, key) {
							if (!paramsValsCurrent[key]) {
								paramsStringNew += key + '=' + item + '&';
							}
						});

						evt.preventDefault(); //Должен быть внутри этих if, т.к. если они не подходят должен продолжиться стандартный переход по ссылке
						router.navigate(location.pathname + paramsStringNew.substring(0, paramsStringNew.length - 1));
					} else if (router.checkUrl(Utils.parseUrl(href, this).pathname)) {
						//Если у нас есть обработчик на данный url, навигируемся
						evt.preventDefault();
						router.navigate(href);
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