document.head || (document.head = document.getElementsByTagName('head')[0]);

if (!Function.prototype.neoBind) {
	/**@author P.Klimashkin
	 * @param {!Object} scope Context, that becomes 'this' in function.
	 * @param {!Array=} bindArgs Array of parameters.
	 * @param {!boolean=} bindArgsFirst Insert bind_arguments first.
	 * @param {!boolean=} pushCallee Add callee (wrapped function) as last parameter.
	 * @return {!Function} Closured function.*/
	Function.prototype.neoBind = function(scope, bindArgs, bindArgsFirst, pushCallee) {
		/**@type {!Function}*/
		var fn = this;
		return function() {
			/**@type {!Array}*/
			var args = bindArgs ?
				(bindArgsFirst ? bindArgs.concat(Array.prototype.slice.call(arguments)) : Array.prototype.slice.call(arguments).concat(bindArgs)) :
				Array.prototype.slice.call(arguments);
			if (pushCallee!==false) args.push(arguments.callee);
			var res;
			try {
				res = fn.apply(scope, args);
			} catch (e) {
				var s = '';
				try {
					s = fn.toString();
				} catch (e1) {
				}
				if (s) e.message += ' Failed bound function: ' + s;
				throw e;
			}
			return res;
		};
	};
}

if (!Function.prototype.bind) {
  Function.prototype.bind = function (oThis) {
    if (typeof this !== "function") {
      // closest thing possible to the ECMAScript 5 internal IsCallable function
      throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
    }

    var aArgs = Array.prototype.slice.call(arguments, 1), 
        fToBind = this, 
        fNOP = function () {},
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

if (!Array.isArray) {
  Array.isArray = function (vArg) {
    return vArg.constructor === Array;
  };
}

if (!Array.prototype.filter){
	Array.prototype.filter = function(fun /*, thisp */){
		"use strict";

		if (this == null)
		  throw new TypeError();

		var t = Object(this);
		var len = t.length >>> 0;
		if (typeof fun != "function")
		  throw new TypeError();

		var res = [];
		var thisp = arguments[1];
		for (var i = 0; i < len; i++)
		{
		  if (i in t)
		  {
			var val = t[i]; // in case fun mutates this
			if (fun.call(thisp, val, i, t))
			  res.push(val);
		  }
		}

		return res;
	};
}

// Production steps of ECMA-262, Edition 5, 15.4.4.18
if ( !Array.prototype.forEach ) {
	Array.prototype.forEach = function( callbackfn, thisArg ) {
		var T,
		  O = Object(this),
		  len = O.length >>> 0,
		  k = 0;
		
		// If no callback function or if callback is not a callable function
		if ( !callbackfn || !callbackfn.call ) {
		  throw new TypeError();
		}
	  
		// If the optional thisArg context param was provided,
		// Set as this context 
		if ( thisArg ) {
		  T = thisArg;
		}

		while( k < len ) {
		
		  // Store property key string object reference
		  var Pk = String( k ),
			// Determine if property key is present in this object context
			kPresent = O.hasOwnProperty( Pk ),
			kValue;

		  if ( kPresent ) {
			// Dereference and store the value of this Property key
			kValue = O[ Pk ];

			// Invoke the callback function with call, passing arguments:
			// context, property value, property key, thisArg object context
			callbackfn.call( T, kValue, k, O );
		  }

		  k++;
		}
	};
}

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (searchElement /*, fromIndex */ ) {
        "use strict";
        if (this == null) {
            throw new TypeError();
        }
        var t = Object(this);
        var len = t.length >>> 0;
        if (len === 0) {
            return -1;
        }
        var n = 0;
        if (arguments.length > 0) {
            n = Number(arguments[1]);
            if (n != n) { // shortcut for verifying if it's NaN
                n = 0;
            } else if (n != 0 && n != Infinity && n != -Infinity) {
                n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }
        }
        if (n >= len) {
            return -1;
        }
        var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
        for (; k < len; k++) {
            if (k in t && t[k] === searchElement) {
                return k;
            }
        }
        return -1;
    }
}

// Production steps of ECMA-262, Edition 5, 15.4.4.19
// Reference: http://es5.github.com/#x15.4.4.19
if (!Array.prototype.map) {
	Array.prototype.map = function(callback, thisArg) {

		var T, A, k;

		if (this == null) {
		  throw new TypeError(" this is null or not defined");
		}

		// 1. Let O be the result of calling ToObject passing the |this| value as the argument.
		var O = Object(this);

		// 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".
		// 3. Let len be ToUint32(lenValue).
		var len = O.length >>> 0;

		// 4. If IsCallable(callback) is false, throw a TypeError exception.
		// See: http://es5.github.com/#x9.11
		if ({}.toString.call(callback) != "[object Function]") {
		  throw new TypeError(callback + " is not a function");
		}

		// 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
		if (thisArg) {
		  T = thisArg;
		}

		// 6. Let A be a new array created as if by the expression new Array(len) where Array is
		// the standard built-in constructor with that name and len is the value of len.
		A = new Array(len);

		// 7. Let k be 0
		k = 0;

		// 8. Repeat, while k < len
		while(k < len) {

		  var kValue, mappedValue;

		  // a. Let Pk be ToString(k).
		  //   This is implicit for LHS operands of the in operator
		  // b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.
		  //   This step can be combined with c
		  // c. If kPresent is true, then
		  if (k in O) {

			// i. Let kValue be the result of calling the Get internal method of O with argument Pk.
			kValue = O[ k ];

			// ii. Let mappedValue be the result of calling the Call internal method of callback
			// with T as the this value and argument list containing kValue, k, and O.
			mappedValue = callback.call(T, kValue, k, O);

			// iii. Call the DefineOwnProperty internal method of A with arguments
			// Pk, Property Descriptor {Value: mappedValue, Writable: true, Enumerable: true, Configurable: true},
			// and false.

			// In browsers that support Object.defineProperty, use the following:
			// Object.defineProperty(A, Pk, { value: mappedValue, writable: true, enumerable: true, configurable: true });

			// For best browser support, use the following:
			A[ k ] = mappedValue;
		  }
		  // d. Increase k by 1.
		  k++;
		}

		// 9. return A
		return A;
	};      
}

if ( !Array.prototype.reduce ) {
	Array.prototype.reduce = function reduce(accumulator){
		var i, l = this.length, curr;
		
		if(typeof accumulator !== "function") // ES5 : "If IsCallable(callbackfn) is false, throw a TypeError exception."
		  throw new TypeError("First argument is not callable");

		if((l == 0 || l === null) && (arguments.length <= 1))// == on purpose to test 0 and false.
		  throw new TypeError("Array length is 0 and no second argument");
		
		if(arguments.length <= 1){
		  curr = this[0]; // Increase i to start searching the secondly defined element in the array
		  i = 1; // start accumulating at the second element
		}
		else{
		  curr = arguments[1];
		}
		
		for(i = i || 0 ; i < l ; ++i){
		  if(i in this)
			curr = accumulator.call(undefined, curr, this[i], i, this);
		}
		
		return curr;
	};
}

/**
 * classList.js: Cross-browser full element.classList implementation.
 * 2011-06-15
 * global self, document, DOMException
 * By Eli Grey, http://eligrey.com
 * Public Domain.
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 * @source http://purl.eligrey.com/github/classList.js/blob/master/classList.js
 */
if (typeof document !== "undefined" && !("classList" in document.createElement("a"))) {

	(function (view) {

	"use strict";

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
	classListProto.add = function (token) {
		token += "";
		if (checkTokenAndGetIndex(this, token) === -1) {
			this.push(token);
			this._updateClassName();
		}
	};
	classListProto.remove = function (token) {
		token += "";
		var index = checkTokenAndGetIndex(this, token);
		if (index !== -1) {
			this.splice(index, 1);
			this._updateClassName();
		}
	};
	classListProto.toggle = function (token) {
		token += "";
		if (checkTokenAndGetIndex(this, token) === -1) {
			this.add(token);
		} else {
			this.remove(token);
		}
	};
	classListProto.toString = function () {
		return this.join(" ");
	};

	if (objCtr.defineProperty) {
		var classListPropDesc = {
			  get: classListGetter
			, enumerable: true
			, configurable: true
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
!function () {
	function func(){};
	if (!window.console) window.console = {};
	["log","debug","info","warn","error","assert","clear","dir","dirxml","trace","group","groupCollapsed","groupEnd","time","timeEnd","timeStamp","profile","profileEnd","count","exception","table"]
	.forEach(function (method, index) {
		if (!window.console[method]) window.console[method] = func;
	});
}();