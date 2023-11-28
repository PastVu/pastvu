/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Browser Detect
 *
 * @author Klimashkin P.
 * returns object containing {name: string, version:string, versionN: number,
 *     engine: string, e_version: string, e_versionN: number,
 *     platform: string, support: Object.<string, boolean>}
 */
define([], function () {
    'use strict';

    const uA = navigator.userAgent.toUpperCase();
    let res;
    const b = {
        name: 'unknown',
        version: 'unknown',
        versionN: 0,
        engine: 'unknown',
        e_version: 'unknown',
        e_versionN: 0,
        platform: 'unknown',

        /**
         * Индикаторы поддержки технологий
         *
         * @type {object.<string, boolean>}
         */
        support: {
            video: !!document.createElement('video').canPlayType,
            h264_apple_video: /** @returns {boolean|string} */ (function () {
                const vid = document.createElement('video');

                return !!vid && !!vid.canPlayType && vid.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
            }()),
            filereader: !!(window.File && window.FileReader && window.FileList && window.Blob),
            canvas: /** @returns {boolean} */ (function () {
                let canvas_compatible = false;

                try {
                    canvas_compatible = !!document.createElement('canvas').getContext('2d');
                } catch (e) {
                }

                return canvas_compatible;
            }()),
            geolocation: (function () {
                return !!navigator.geolocation;
            }()),
            touch: (function () {
                if ('ontouchstart' in window || window.DocumentTouch && document instanceof window.DocumentTouch) {
                    //Indicates if the browser supports the W3C Touch Events API
                    return true;
                }

                try {
                    document.createEvent('TouchEvent');

                    return true;
                } catch (e) {
                    return false;
                }
            }()),
            cssAnimation: true,
            chromeframe: false,
        },
    };

    function getSubstrUntilSpace(string, start) {
        let result = ''; let
            i;

        for (i = start; i < string.length; i++) {
            if (string.substr(i, 1) === ' ' || string.substr(i, 1) === ';') {
                break;
            }

            result += string.substr(i, 1);
        }

        return result;
    }

    if (uA.indexOf('OPERA') >= 0) {
        b.name = 'OPERA';
        b.engine = 'PRESTO';
        b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('VERSION/') + 8);

        res = uA.match(/VERSION\/([\d\.]+)/i) || uA.match(/OPERA.([\d\.]+)/i); // eslint-disable-line no-useless-escape
        b.versionN = parseFloat(res[1]);

        res = uA.match(/PRESTO\/([\d\.]+)/i); // eslint-disable-line no-useless-escape

        if (res) {
            b.e_version = res[1];
        }
    } else if (uA.indexOf('WEBKIT') >= 0) {
        b.engine = 'WEBKIT';

        res = uA.match(/WEBKIT\/([\d\.]+)/i); // eslint-disable-line no-useless-escape

        if (res) {
            b.e_version = res[1];
        }

        if (uA.indexOf('CHROME') >= 0) {
            b.name = 'CHROME';
            b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('CHROME/') + 7);
        } else if (uA.indexOf('SAFARI') >= 0) {
            b.name = 'SAFARI';
            b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('VERSION/') + 8);
        }
    } else if (uA.indexOf('FIREFOX') >= 0) {
        b.name = 'FIREFOX';
        b.engine = 'GECKO';
        b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('FIREFOX/') + 8); //uA.match(/FIREFOX\/([\d\.]+)/i)[1]

        res = uA.match(/RV:([\d\.]+)/i); // eslint-disable-line no-useless-escape

        if (res) {
            b.e_version = res[1];
        }
    } else if (uA.indexOf('MSIE') >= 0) {
        b.name = 'MSIE';
        b.engine = 'TRIDENT';
        b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('MSIE ') + 5);
        b.e_version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('TRIDENT/') + 8);
        b.support.chromeframe = uA.indexOf('CHROMEFRAME') > -1;

        if (b.version < 10) {
            b.support.cssAnimation = false;
        }
    }

    b.platform = navigator.platform.toUpperCase();
    b.versionN = parseFloat(b.version);
    b.e_versionN = parseFloat(b.e_version);

    return b;
});
