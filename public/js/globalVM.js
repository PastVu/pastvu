/*global requirejs:true, require:true, define:true*/
/**
 * globalVM
 */
define(['jquery', 'Utils', 'underscore', 'Params', 'i18n', 'knockout', 'lib/PubSub'], function ($, Utils, _, P, i18n, ko, ps) {
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

				if (hidden) {
					$container.css({visibility: 'visible'});
				}
				if (noDisplay) {
					if (fade) {
						$container.fadeIn(400, function () {
							if (Utils.isType('function', cb)) {
								cb.call(ctx || window);
							}
						});
					} else {
						$container.show();
					}
				}

				if (!fade && Utils.isType('function', cb)) {
					cb.call(ctx || window);
				}
			},
			hideContainer: function ($container, cb, ctx) {
				var container = $container[0],
					noDisplay = container.classList.contains('mNoDisplay'),
					hidden = container.classList.contains('mHidden'),
					fade = container.classList.contains('mFadeOut');

				if (hidden) {
					$container.css({visibility: 'hidden'});
				}
				if (noDisplay) {
					if (fade) {
						$container.fadeOut(400, function () {
							if (Utils.isType('function', cb)) {
								cb.call(ctx || window);
							}
						});
					} else {
						$container.hide();
					}
				}

				if (!fade && Utils.isType('function', cb)) {
					cb.call(ctx || window);
				}
			}
		}
	};

	return globalVM;
});