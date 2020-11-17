/*global define:true*/
/**
 * globalVM
 */
define(['jquery', 'Browser', 'Utils', 'underscore', 'Params', 'intl', 'i18n', 'knockout', 'lib/PubSub', 'moment'], function ($, Browser, Utils, _, P, intl, i18n, ko, ps, moment) {
    'use strict';

    window.G = {
        imgLoadOk: function (target) {
            target.parentNode.classList.add('showPrv');
        },
        imgLoadFail: function (target) {
            const classList = target.parentNode.classList;

            classList.add('fail'); //Множестенная установка пока не работает в ie<=11
            classList.add('showPrv');
        },
    };

    window.moment = moment;

    // Отключает скроллинг body путем задания overflow:hidden и правого marging равного ширине скроллинга
    function bodyScrollOff($body) {
        let bodyWidth;

        if (!$body) {
            $body = $(document.body);
        }

        if (!$body.hasClass('modal')) {
            bodyWidth = $body.innerWidth();

            $(document.documentElement).addClass('modal');
            $body
                .addClass('modal')
                .add('#topContainer')
                .css({ marginRight: $body.innerWidth() - bodyWidth + 'px' });
        }

        return $body;
    }

    function bodyScrollOn($body) {
        if (!$body) {
            $body = $(document.body);
        }

        if ($body.hasClass('modal') && $('.neoModalCurtain').length <= 1) {
            $(document.documentElement).removeClass('modal');
            $body
                .removeClass('modal')
                .add('#topContainer')
                .css({ marginRight: '0px' });
        }

        return $body;
    }

    return {
        P: P,
        pb: ps,
        intl: intl,
        i18n: i18n,
        router: null,

        childModules: {},
        repository: {},

        ranks: {
            mec: { src: '/img/rank/bronse.jpg', title: 'Меценат' },
            mec_silv: { src: '/img/rank/silver.jpg', title: 'Серебряный меценат' },
            mec_gold: { src: '/img/rank/gold.jpg', title: 'Золотой меценат' },
            adviser: { src: '/img/rank/adviser.jpg', title: 'Советник' },
        },

        func: {
            showContainer: function ($container, cb, ctx) {
                const container = $container[0];
                const isModal = container.classList.contains('neoModalContainer');
                const noDisplay = container.classList.contains('mNoDisplay');
                const hidden = container.classList.contains('mHidden');
                const fade = container.classList.contains('mFadeIn');

                if (isModal) {
                    // Отключаем скроллинг body, если это модальное окно
                    bodyScrollOff();
                }

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
                        container.classList.add('mShow');

                        if (Utils.isType('function', cb)) {
                            cb.call(ctx || window);
                        }
                    }
                } else if (Utils.isType('function', cb)) {
                    cb.call(ctx || window);
                }
            },
            hideContainer: function ($container, cb, ctx) {
                const container = $container[0];
                const isModal = container.classList.contains('neoModalContainer');
                const noDisplay = container.classList.contains('mNoDisplay');
                const hidden = container.classList.contains('mHidden');

                if (noDisplay || hidden) {
                    container.classList.remove('mShow');
                }

                if (isModal) {
                    // Включаем скроллинг body, если это было модальное окно
                    bodyScrollOn();
                }

                if (Utils.isType('function', cb)) {
                    cb.call(ctx || window);
                }
            },
            bodyScrollOff: bodyScrollOff,
            bodyScrollOn: bodyScrollOn,
        },
    };
});
