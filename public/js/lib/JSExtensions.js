/*
 * classList.js: Cross-browser full element.classList implementation.
 * 2014-01-31
 *
 * By Eli Grey, http://eligrey.com
 * Public Domain.
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 */

/*global self, document, DOMException */

/*! @source http://purl.eligrey.com/github/classList.js/blob/master/classList.js*/

if ("document" in self && !("classList" in document.createElement("_"))) {
	(function (view) {
		"use strict";

		if (!('Element' in view)) return;

		var
			classListProp = "classList"
			, protoProp = "prototype"
			, elemCtrProto = view.Element[protoProp]
			, objCtr = Object
			, strTrim = String[protoProp].trim || function () {
				return this.replace(/^\s+|\s+$/g, "");
			}
			, arrIndexOf = Array[protoProp].indexOf || function (item) {
				var
					i = 0
					, len = this.length
					;
				for (; i < len; i++) {
					if (i in this && this[i] === item) {
						return i;
					}
				}
				return -1;
			}
		// Vendors: please allow content code to instantiate DOMExceptions
			, DOMEx = function (type, message) {
				this.name = type;
				this.code = DOMException[type];
				this.message = message;
			}
			, checkTokenAndGetIndex = function (classList, token) {
				if (token === "") {
					throw new DOMEx(
						"SYNTAX_ERR"
						, "An invalid or illegal string was specified"
					);
				}
				if (/\s/.test(token)) {
					throw new DOMEx(
						"INVALID_CHARACTER_ERR"
						, "String contains an invalid character"
					);
				}
				return arrIndexOf.call(classList, token);
			}
			, ClassList = function (elem) {
				var
					trimmedClasses = strTrim.call(elem.getAttribute("class") || "")
					, classes = trimmedClasses ? trimmedClasses.split(/\s+/) : []
					, i = 0
					, len = classes.length
					;
				for (; i < len; i++) {
					this.push(classes[i]);
				}
				this._updateClassName = function () {
					elem.setAttribute("class", this.toString());
				};
			}
			, classListProto = ClassList[protoProp] = []
			, classListGetter = function () {
				return new ClassList(this);
			}
			;
// Most DOMException implementations don't allow calling DOMException's toString()
// on non-DOMExceptions. Error's toString() is sufficient here.
		DOMEx[protoProp] = Error[protoProp];
		classListProto.item = function (i) {
			return this[i] || null;
		};
		classListProto.contains = function (token) {
			token += "";
			return checkTokenAndGetIndex(this, token) !== -1;
		};
		classListProto.add = function () {
			var
				tokens = arguments
				, i = 0
				, l = tokens.length
				, token
				, updated = false
				;
			do {
				token = tokens[i] + "";
				if (checkTokenAndGetIndex(this, token) === -1) {
					this.push(token);
					updated = true;
				}
			}
			while (++i < l);

			if (updated) {
				this._updateClassName();
			}
		};
		classListProto.remove = function () {
			var
				tokens = arguments
				, i = 0
				, l = tokens.length
				, token
				, updated = false
				;
			do {
				token = tokens[i] + "";
				var index = checkTokenAndGetIndex(this, token);
				if (index !== -1) {
					this.splice(index, 1);
					updated = true;
				}
			}
			while (++i < l);

			if (updated) {
				this._updateClassName();
			}
		};
		classListProto.toggle = function (token, force) {
			token += "";

			var
				result = this.contains(token)
				, method = result ?
					force !== true && "remove"
					:
					force !== false && "add"
				;

			if (method) {
				this[method](token);
			}

			return !result;
		};
		classListProto.toString = function () {
			return this.join(" ");
		};

		if (objCtr.defineProperty) {
			var classListPropDesc = {
				get: classListGetter, enumerable: true, configurable: true
			};
			try {
				objCtr.defineProperty(elemCtrProto, classListProp, classListPropDesc);
			} catch (ex) { // IE 8 doesn't support enumerable:true
				if (ex.number === -0x7FF5EC54) {
					classListPropDesc.enumerable = false;
					objCtr.defineProperty(elemCtrProto, classListProp, classListPropDesc);
				}
			}
		} else if (objCtr[protoProp].__defineGetter__) {
			elemCtrProto.__defineGetter__(classListProp, classListGetter);
		}

	}(self));
}

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
            if (k < 0) {k = 0;}
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
 * @author P.Klimashkin
 * Console Gag
 */
(function (global) {
    var noop = function () {
        }/*,
        getConsoleTime = function () {
            return new Date().toLocaleTimeString();
        },
        logOriginal = global.console.log || noop*/;

    if (!global.console) {
        global.console = {};
    }
    ["debug", "info", "warn", "error", "assert", "clear", "dir", "dirxml", "trace", "group", "groupCollapsed", "groupEnd", "time", "timeEnd", "timeStamp", "profile", "profileEnd", "count", "exception", "table"]
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


/**
 * Provides requestAnimationFrame in a cross browser way.
 * @author paulirish
 * @url https://gist.github.com/1579671
 */
if (!window.requestAnimationFrame || !window.cancelAnimationFrame) {
	(function (global) {
		var lastTime = 0,
			vendors = ['ms', 'moz', 'webkit', 'o'],
			x,
			length,
			currTime,
			timeToCall;

		for (x = 0, length = vendors.length; x < length && !global.requestAnimationFrame; ++x) {
			global.requestAnimationFrame = global[vendors[x] + 'RequestAnimationFrame'];
			global.cancelAnimationFrame = global[vendors[x] + 'CancelAnimationFrame'] || global[vendors[x] + 'CancelRequestAnimationFrame'];
		}

		if (!global.requestAnimationFrame) {
			global.requestAnimationFrame = function (callback, element) {
				currTime = Date.now();
				timeToCall = Math.max(0, 16 - (currTime - lastTime));
				lastTime = currTime + timeToCall;
				return global.setTimeout(
					function () {
						callback(currTime + timeToCall);
					},
					timeToCall
				);
			};
		}

		if (!global.cancelAnimationFrame) {
			global.cancelAnimationFrame = function (id) {
				global.clearTimeout(id);
			};
		}
	}(window));
}