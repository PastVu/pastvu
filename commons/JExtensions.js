if (!String.prototype.includes) {
    String.prototype.includes = function () {
        'use strict';
        return String.prototype.indexOf.apply(this, arguments) !== -1;
    };
}

if (!Array.prototype.includes) {
    Array.prototype.includes = function (searchElement/* , fromIndex*/) {
        'use strict';
        var O = Object(this);
        var len = parseInt(O.length) || 0;
        if (len === 0) {
            return false;
        }
        var n = parseInt(arguments[1]) || 0;
        var k;
        if (n >= 0) {
            k = n;
        } else {
            k = len + n;
            if (k < 0) {
                k = 0;
            }
        }
        var currentElement;
        while (k < len) {
            currentElement = O[k];
            if (searchElement === currentElement ||
                (searchElement !== searchElement && currentElement !== currentElement)) {
                return true;
            }
            k++;
        }
        return false;
    };
}

/**
 * Extend
 *
 Object.defineProperty(Object.prototype, "extend", {
    enumerable: false,
    value: function (from) {
        'use strict';
        var props = Object.getOwnPropertyNames(from),
            dest = this;
        props.forEach(function (name) {
            Object.defineProperty(dest, name, Object.getOwnPropertyDescriptor(from, name));
        });
        return this;
    }
 });
 */