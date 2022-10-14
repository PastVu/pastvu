if (!String.prototype.includes) {
    String.prototype.includes = function () {
        'use strict';

        return String.prototype.indexOf.apply(this, arguments) !== -1;
    };
}

if (!Array.prototype.includes) {
    Array.prototype.includes = function (searchElement/* , fromIndex*/) {
        'use strict';

        const O = Object(this);
        const len = parseInt(O.length) || 0;

        if (len === 0) {
            return false;
        }

        const n = parseInt(arguments[1]) || 0;
        let k;

        if (n >= 0) {
            k = n;
        } else {
            k = len + n;

            if (k < 0) {
                k = 0;
            }
        }

        let currentElement;

        while (k < len) {
            currentElement = O[k];

            if (searchElement === currentElement ||
                searchElement !== searchElement && currentElement !== currentElement) {
                return true;
            }

            k++;
        }

        return false;
    };
}

/**
 * @author P.Klimashkin
 * Console Gag
 */
(function (global) {
    const noop = function () {
    }/*,
        getConsoleTime = function () {
            return new Date().toLocaleTimeString();
        },
        logOriginal = global.console.log || noop*/;

    if (!global.console) {
        global.console = {};
    }

    ['debug', 'info', 'warn', 'error', 'assert', 'clear', 'dir', 'dirxml', 'trace', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeStamp', 'profile', 'profileEnd', 'count', 'exception', 'table']
        .forEach(function (method) {
            if (!global.console[method]) {
                global.console[method] = noop;
            }
        });

    /*global.console.log = function () {
        var args = Array.prototype.slice.call(arguments);
        args[0] = getConsoleTime() + ' ' + args[0];
        logOriginal.apply(this, args);
    };*/
}(window));
