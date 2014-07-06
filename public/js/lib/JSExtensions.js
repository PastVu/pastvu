if (!Function.prototype.bind) {
	Function.prototype.bind = function (oThis) {
		if (typeof this !== "function") {
			// closest thing possible to the ECMAScript 5 internal IsCallable function
			throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
		}

		var aArgs = Array.prototype.slice.call(arguments, 1),
			fToBind = this,
			fNOP = function () {
			},
			fBound = function () {
				return fToBind.apply(this instanceof fNOP
					? this
					: oThis,
					aArgs.concat(Array.prototype.slice.call(arguments)));
			};

		fNOP.prototype = this.prototype;
		fBound.prototype = new fNOP();

		return fBound;
	};
}

/*
 * classList.js: Cross-browser full element.classList implementation.
 * 2012-11-15
 *
 * By Eli Grey, http://eligrey.com
 * Public Domain.
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 */
/*! @source http://purl.eligrey.com/github/classList.js/blob/master/classList.js*/
if (typeof document !== "undefined" && !("classList" in document.documentElement)) {

	(function (view) {
		"use strict";

		if (!('HTMLElement' in view) && !('Element' in view)) return;

		var
			classListProp = "classList"
			, protoProp = "prototype"
			, elemCtrProto = (view.HTMLElement || view.Element)[protoProp]
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
					trimmedClasses = strTrim.call(elem.className)
					, classes = trimmedClasses ? trimmedClasses.split(/\s+/) : []
					, i = 0
					, len = classes.length
					;
				for (; i < len; i++) {
					this.push(classes[i]);
				}
				this._updateClassName = function () {
					elem.className = this.toString();
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
		classListProto.toggle = function (token, forse) {
			token += "";

			var
				result = this.contains(token)
				, method = result ?
					forse !== true && "remove"
					:
					forse !== false && "add"
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


/**
 * @author P.Klimashkin
 * Console Gag
 */
(function (global) {
	var noop = function () {},
		getConsoleTime = function () {
			return new Date().toLocaleTimeString();
		},
		logOriginal = global.console.log || noop;

	if (!global.console) {
		global.console = {};
	}
	["debug", "info", "warn", "error", "assert", "clear", "dir", "dirxml", "trace", "group", "groupCollapsed", "groupEnd", "time", "timeEnd", "timeStamp", "profile", "profileEnd", "count", "exception", "table"]
		.forEach(function (method, index) {
			if (!global.console[method]) {
				global.console[method] = noop;
			}
		});
	global.console.log = function () {
		var args = Array.prototype.slice.call(arguments);
		args[0] = getConsoleTime() + ' ' + args[0];
		logOriginal.apply(this, args);
	};
}(window));


/**
 * Provides requestAnimationFrame in a cross browser way.
 * @author paulirish
 * @url https://gist.github.com/1579671
 */
if (!window.requestAnimationFrame || !window.cancelAnimationFrame) {
	(function () {
		var lastTime = 0,
			vendors = ['ms', 'moz', 'webkit', 'o'],
			x,
			length,
			currTime,
			timeToCall;

		for (x = 0, length = vendors.length; x < length && !window.requestAnimationFrame; ++x) {
			window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
			window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
		}

		if (!window.requestAnimationFrame) {
			window.requestAnimationFrame = function (callback, element) {
				currTime = Date.now();
				timeToCall = Math.max(0, 16 - (currTime - lastTime));
				lastTime = currTime + timeToCall;
				return window.setTimeout(
					function () {
						callback(currTime + timeToCall);
					},
					timeToCall
				);
			};
		}

		if (!window.cancelAnimationFrame) {
			window.cancelAnimationFrame = function (id) {
				window.clearTimeout(id);
			};
		}
	}());
}