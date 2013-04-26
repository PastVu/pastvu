/*global define:true*/
/**
 * globalVM
 */
define(['jquery', 'Browser', 'Utils', 'underscore', 'Params', 'i18n', 'knockout', 'lib/PubSub'], function ($, Browser, Utils, _, P, i18n, ko, ps) {
	"use strict";

	var globalVM = {
		P: P,
		pb: ps,
		i18n: i18n,
		router: null,

		childModules: {},
		repository: {},

		func: {
			showContainer: function ($container, cb, ctx) {
				var container = $container[0],
					noDisplay = container.classList.contains('mNoDisplay'),
					hidden = container.classList.contains('mHidden'),
					fade = container.classList.contains('mFadeIn');

				if (noDisplay || hidden) {
					if (fade && Browser.support.cssAnimation) {
						// Меняем по таймауту, чтобы класс успел удалится с этого контейнера, если для него меняется модуль
						window.setTimeout(function () {
							container.classList.add('mShow');
							if (Utils.isType('function', cb)) {
								window.setTimeout(cb.bind(ctx || window), 310);
							}
						}, 50);
					} else {
						container.classList.add ('mShow');
						if (Utils.isType('function', cb)) {
							cb.call(ctx || window);
						}
					}
				} else if (Utils.isType('function', cb)) {
					cb.call(ctx || window);
				}
			},
			hideContainer: function ($container, cb, ctx) {
				var container = $container[0],
					noDisplay = container.classList.contains('mNoDisplay'),
					hidden = container.classList.contains('mHidden');

				if (noDisplay || hidden) {
					container.classList.remove('mShow');
				}
				if (Utils.isType('function', cb)) {
					cb.call(ctx || window);
				}
			}
		}
	};

	return globalVM;
});