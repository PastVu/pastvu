/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['Browser'], function (Browser) {
    return {
        mup: Browser.support.touch ? 'touchend' : 'mouseup',
        mdown: Browser.support.touch ? 'touchstart' : 'mousedown',
        mmove: Browser.support.touch ? 'touchmove' : 'mousemove',
    };
});
