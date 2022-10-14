/**
 * Event Types
 */
define(['Browser'], function (Browser) {
    return {
        mup: Browser.support.touch ? 'touchend' : 'mouseup',
        mdown: Browser.support.touch ? 'touchstart' : 'mousedown',
        mmove: Browser.support.touch ? 'touchmove' : 'mousemove',
    };
});
