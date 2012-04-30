document.head || (document.head = document.getElementsByTagName('head')[0]);
function func(){};
if (!window.console) window.console = {};
$.each(
["log","debug","info","warn","error","assert","clear","dir","dirxml","trace","group","groupCollapsed","groupEnd","time","timeEnd","profile","profileEnd","count","exception","table"],
function (index, method) {
	if (!window.console[method]) window.console[method] = func;
});

/**
 * Browser Detect
 * @author Klimashkin P.
 * @return {{name: string, version:string, versionN: number,
 *           engine: string, e_version: string, e_versionN: number,
 * 			 platform: string, support: Object.<string, boolean>}}
 */
var Browser = function (){
	var b = {
		name : 'unknown',
		version : 'unknown',
		versionN : 0,
		engine : 'unknown',
		e_version : 'unknown',
		e_versionN : 0,
		platform : 'unknown',
		/**
		 * Индикаторы поддержки технологий
		 * @type Object.<string, boolean>
		 */
		support : {
			flash: FlashDetect && FlashDetect.installed, /*!!navigator.mimeTypes["application/x-shockwave-flash"],*/
			video: !!document.createElement('video').canPlayType,
			h264_apple_video : /** @return {boolean|string} */ function () {
				var vid = document.createElement('video');
				return !!vid && !!vid.canPlayType && vid.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
			}(),
			canvas: /** @return {boolean} */ function(){
				var canvas_compatible = false;
				try{
					canvas_compatible = !!(document.createElement('canvas').getContext('2d'));
				} catch(e) {}
				return canvas_compatible
			}(),
			touch: function(){
				  try {
					document.createEvent("TouchEvent");  
					return true;  
				  } catch (e) {  
					return false;  
				  }
			}(),
			chromeframe: false
		}
	};
	var uA = navigator.userAgent.toUpperCase(), res;
	
	function getSubstrUntilSpace(string,start){
		var result='';
		for(var i=start;i<string.length;i++){
			if(string.substr(i,1)==' ' || string.substr(i,1)==';') break;
			result+=string.substr(i,1);
		}
		return result;
	}
	if(uA.indexOf('OPERA')>=0){
		b.name = 'OPERA';
		b.engine = 'PRESTO';
		b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('VERSION/')+8);

		if (res = uA.match(/VERSION\/([\d\.]+)/i)) {
			b.versionN = parseFloat(res[1], 0);
		} else if (res = uA.match(/OPERA.([\d\.]+)/i)) {
			b.versionN = parseFloat(res[1], 0);
		}

		if (res = uA.match(/PRESTO\/([\d\.]+)/i)) {
			b.e_version = res[1];
			b.e_versionN = parseFloat(res[1], 0);
		}

	}else if(uA.indexOf('WEBKIT')>=0){
		b.engine = 'WEBKIT';
		if (res = uA.match(/WEBKIT\/([\d\.]+)/i)) {
			b.e_version = res[1];
		}
		if(uA.indexOf('CHROME')>=0){
			b.name='CHROME';
			b.version=getSubstrUntilSpace(navigator.userAgent, uA.indexOf('CHROME/')+7);
		}else if(uA.indexOf('SAFARI')>=0){
			b.name='SAFARI';
			b.version=getSubstrUntilSpace(navigator.userAgent, uA.indexOf('VERSION/')+8);
		}
	}else if(uA.indexOf('FIREFOX')>=0){
		b.name = 'FIREFOX';
		b.engine = 'GECKO';
		b.version = getSubstrUntilSpace(navigator.userAgent, uA.indexOf('FIREFOX/')+8); //uA.match(/FIREFOX\/([\d\.]+)/i)[1]
		
		if (res = uA.match(/RV:([\d\.]+)/i)) {
			b.e_version = res[1];
		}
	}else if(uA.indexOf('MSIE')>=0){
		b.name='MSIE';
		b.engine = 'TRIDENT';
		b.version=getSubstrUntilSpace(navigator.userAgent, uA.indexOf('MSIE ')+5);
		b.e_version=getSubstrUntilSpace(navigator.userAgent, uA.indexOf('TRIDENT/')+8);
		b.support.chromeframe = uA.indexOf('CHROMEFRAME') > -1 ? true : false;
	}
	
	b.platform = navigator.platform.toUpperCase();
	b.versionN = parseFloat(b.version, 0);
	b.e_versionN = parseFloat(b.e_version, 0);
	return b;
}();

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

/**
 * jQuery Image Preload Plugin
 * v1.3
 * https://github.com/farinspace/jquery.imgpreload
 */
if("undefined"!=typeof jQuery){(function(a){a.imgpreload=function(b,c){c=a.extend({},a.fn.imgpreload.defaults,c instanceof Function?{all:c}:c);if("string"==typeof b){b=new Array(b)}var d=new Array;a.each(b,function(e,f){var g=new Image;var h=f;var i=g;if("string"!=typeof f){h=a(f).attr("src");i=f}a(g).bind("load error",function(e){d.push(i);a.data(i,"loaded","error"==e.type?false:true);if(c.each instanceof Function){c.each.call(i)}if(d.length>=b.length&&c.all instanceof Function){c.all.call(d)}});g.src=h})};a.fn.imgpreload=function(b){a.imgpreload(this,b);return this};a.fn.imgpreload.defaults={each:null,all:null}})(jQuery)}

jQuery.extend({
	cachedScript: function(url, options) {
		// allow user to set any option except for dataType, cache, and url
		options = jQuery.extend(options || {}, {
			dataType: "script",
			crossDomain: true, //Hack to display scripts in firebug panel
			cache: false,
			url: url
		});
		// Use $.ajax() since it is more flexible than $.getScript
		// Return the jqXHR object so we can chain callbacks
		return jQuery.ajax(options);
	},
	getScript: function(url, callback) {
		var head = document.getElementsByTagName("head")[0],
			script = document.createElement("script");
		script.src = url;
		script.type = 'text/javascript';

		// Handle Script loading
		{
			var done = false;

			// Attach handlers for all browsers
			script.onload = script.onreadystatechange = function(){
				if ( !done && (!this.readyState ||
				this.readyState == "loaded" || this.readyState == "complete") ) {
					done = true;
					if (callback) callback();

					// Handle memory leak in IE
					script.onload = script.onreadystatechange = null;
				}
			};
		}

		head.appendChild(script);

		// We handle everything using the script element injection
		return undefined;
	},
	
	getStyle: function(path, callbackSuccess, callbackFail, scope) {
		var head = document.getElementsByTagName('head')[0], // reference to document.head for appending/ removing link nodes
		   link = document.createElement('link');           // create the link node
		link.setAttribute('href', path);
		link.setAttribute('rel', 'stylesheet');
		link.setAttribute('type', 'text/css');

		var sheet, cssRules;
		//get the correct properties to check for depending on the browser
		if ( 'sheet' in link ) {
			sheet = 'sheet'; cssRules = 'cssRules';
		} else {
			sheet = 'styleSheet'; cssRules = 'rules';
		}

	   var interval_id = setInterval(function() {	// start checking whether the style sheet has successfully loaded
		  try {
			 if ( link[sheet] && link[sheet][cssRules].length ) { // SUCCESS! our style sheet has loaded
				clearInterval( interval_id );                     // clear the counters
				clearTimeout( timeout_id );
				callbackSuccess.call(scope || window);	// fire the success callback
			 }
		  } catch( e ) {console.error('Ошибка применения стилей (getStyle) '+e); if(callbackFail) callbackFail.call(scope || window);} finally {}
	   }, 100);
	   
	   var timeout_id = setTimeout(function() {	// start counting down till fail
		  clearInterval( interval_id );	// clear the counters
		  clearTimeout( timeout_id );
		  head.removeChild( link );	// since the style sheet didn't load, remove the link node from the DOM
		  console.error('Превышен интервал загрузки стилей (getStyle)');
		  if(callbackFail) callbackFail.call(scope || window); // fire the fail callback
	   }, 15000);

	   head.appendChild(link);  // insert the link node into the DOM and start loading the style sheet

	   return link; // return the link node;

	},
	
	urlParam: function(name){
		var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
		return (results && results[1] ? decodeURIComponent(results[1]): 0);
	}
});

/**
 * Serialize Form to JSON
 */
jQuery.fn.serializeObject = function()
{
   var o = {};
   var a = this.serializeArray();
   $.each(a, function() {
       if (o[this.name]) {
           if (!o[this.name].push) {
               o[this.name] = [o[this.name]];
           }
           o[this.name].push(this.value || '');
       } else {
           o[this.name] = this.value || '';
       }
   });
   return o;
};

var Utils = {
	/**
	 * Проверяет на соответствие объекта типу (вместо typeof)
	 * @param {string} type Имя типа.
	 * @param {Object} obj Проверяемый объект.
	 * @return {boolean}
	 */
	isObjectType: function(type, obj) {
		if (obj !== undefined && obj !== null && Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase()) return true;
		return false;
	},
	
	isObjectEmpty: function(obj) {
		return this.getObjectPropertyLength(obj) === 0;
	},
	
	getObjectPropertyLength: function(obj){
		var result = 0;
		if (Object.getOwnPropertyNames){ //ECMAScript 5
			 result = Object.getOwnPropertyNames(obj).length;
		} else { //ECMAScript 3
			for(var prop in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, prop)) {
					 result++;
				}
			}
		}
		return result;
	},
	
	getObjectOneOwnProperty: function(obj){
		if (Utils.getObjectPropertyLength(obj) > 0) {
			if (Object.getOwnPropertyNames){ //ECMAScript 5
				 return Object.getOwnPropertyNames(obj)[0];
			} else { //ECMAScript 3
				for(var prop in obj) {
					if (Object.prototype.hasOwnProperty.call(obj, prop)) {
						 return prop;
					}
				}
			}
		}
	},
	
	cloneObject: function cloneObject(o) {
		if(!o || 'object' !== typeof o)  {
			return o;
		}
		var c = 'function' === typeof o.pop ? [] : {};
		var p, v;
		for(p in o) {
			if(!p || !o.hasOwnProperty(p)) continue;
			
			v = o[p];
			if(v && 'object' === typeof v) {
				c[p] = cloneObject(v);
			}else {
				c[p] = v;
			}
		}
		return c;
	},
	
	printObject: function(o) {
		var out = '';
		for (var p in o) {
		out += p + ': ' + o[p] + '\n';
		}
		return(out);
	},
	
    getClientWidth: function() {
	    if(window.opera) {
            return innerWidth;
        } else {
            return document.compatMode=='CSS1Compat' &&
                !window.opera ? document.documentElement.clientWidth :
                document.body.clientWidth;
        }
    },

    getClientHeight : function () {
	    if(window.opera) {
            return innerHeight;
        } else {
            return document.compatMode=='CSS1Compat' &&
                !window.opera ?
                document.documentElement.clientHeight :
                document.body.clientHeight;
        }
    },

    getBodyScrollTop: function() {
	    return self.pageYOffset ||
            (document.documentElement && document.documentElement.scrollTop) ||
            (document.body && document.body.scrollTop);
    },

    getBodyScrollLeft: function() {
	    return self.pageXOffset ||
            (document.documentElement && document.documentElement.scrollLeft) ||
            (document.body && document.body.scrollLeft);
    },

    getDocumentHeight: function() {
        var scrollHeight = document.body.scrollHeight;
        var offsetHeight = document.body.offsetHeight;
	    return (scrollHeight > offsetHeight) ? scrollHeight : offsetHeight;
    },

    getDocumentWidth: function() {
        var scrollWidth = document.body.scrollWidth;
        var offsetWidth = document.body.offsetWidth;
        
	    return (scrollWidth > offsetWidth) ? scrollWidth : offsetWidth;
    },

	getElementComputedStyle : function (elem, prop){
	  if (typeof elem!="object") elem = document.getElementById(elem);
	  // external stylesheet for Mozilla, Opera 7+ and Safari 1.3+
	  if (document.defaultView && document.defaultView.getComputedStyle){
		if (prop.match(/[A-Z]/)) prop = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
		return document.defaultView.getComputedStyle(elem, "").getPropertyValue(prop);
	  }	  
	  // external stylesheet for Explorer and Opera 9
	  if (elem.currentStyle){
		var i;
		while ((i=prop.indexOf("-"))!=-1) prop = prop.substr(0, i) + prop.substr(i+1,1).toUpperCase() + prop.substr(i+2);
		return elem.currentStyle[prop];
	  }
	  return "";
	},
	
   /**
     * @param {!HTMLElement} elem HTML Element.
     * @return {{top: number, left: number}} Element's position related to the
     * window.
     */
    getOffset : function (elem) {
        if (elem.getBoundingClientRect) {
            return getOffsetRect(elem);
        }else {
            return getOffsetSum(elem);
        }
    },
	
	getDistance: function(x1, x2, y1, y2){
		return Math.sqrt( Math.pow(x1-x2,2) + Math.pow(y1-y2,2) );
	},
	
	/**
	 * Converts an RGB color value to HSL. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
	 * Assumes HTMLcolor and
	 * returns h, s, and l in the set [0, 1].
	 */
	rgb2hsl: function (HTMLcolor){
		r = parseInt(HTMLcolor.substring(0,2),16) / 255;
		g = parseInt(HTMLcolor.substring(2,4),16) / 255;
		b = parseInt(HTMLcolor.substring(4,6),16) / 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var h, s, l = (max + min) / 2;
		if (max == min) {
			h = s = 0;
		} else {
			var d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r: h = (g - b) / d + (g < b ? 6 : 0); break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h /= 6;
		}
		return {h:h, s:s, l:l};
	},
	
	/**
	 * Converts an HSL color value to RGB. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
	 * Assumes h, s, and l are contained in the set [0, 1] and
	 * returns r, g, and b in the set [0, 255].
	 */
	hslToRgb: function (h, s, l){
		var r, g, b;

		if(s == 0){
			r = g = b = l; // achromatic
		}else{
			function hue2rgb(p, q, t){
				if(t < 0) t += 1;
				if(t > 1) t -= 1;
				if(t < 1/6) return p + (q - p) * 6 * t;
				if(t < 1/2) return q;
				if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
				return p;
			}

			var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			var p = 2 * l - q;
			r = hue2rgb(p, q, h + 1/3);
			g = hue2rgb(p, q, h);
			b = hue2rgb(p, q, h - 1/3);
		}

		return {r:r*255, g:g*255, b:b*255};
	},
	
	/**
	 * Converts an RGB color value to HSV. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
	 * Assumes HTMLcolor and
	 * returns h, s, and v in the set [0, 1].
	 */
	rgbToHsv: function (HTMLcolor){
		r = parseInt(HTMLcolor.substring(0,2),16) / 255;
		g = parseInt(HTMLcolor.substring(2,4),16) / 255;
		b = parseInt(HTMLcolor.substring(4,6),16) / 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b);
		var h, s, v = max;

		var d = max - min;
		s = max == 0 ? 0 : d / max;

		if(max == min){
			h = 0; // achromatic
		}else{
			switch(max){
				case r: h = (g - b) / d + (g < b ? 6 : 0); break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h /= 6;
		}

		return [h, s, v];
	},

	/**
	 * Converts an HSV color value to RGB. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
	 * Assumes h, s, and v are contained in the set [0, 1] and
	 * returns r, g, and b in the set [0, 255].
	 */
	hsvToRgb: function (h, s, v){
		var r, g, b;

		var i = Math.floor(h * 6);
		var f = h * 6 - i;
		var p = v * (1 - s);
		var q = v * (1 - f * s);
		var t = v * (1 - (1 - f) * s);

		switch(i % 6){
			case 0: r = v, g = t, b = p; break;
			case 1: r = q, g = v, b = p; break;
			case 2: r = p, g = v, b = t; break;
			case 3: r = p, g = q, b = v; break;
			case 4: r = t, g = p, b = v; break;
			case 5: r = v, g = p, b = q; break;
		}

		return [r * 255, g * 255, b * 255];
	},
	
	Event: function(){

		var guid = 0;
		function returnFalse(){
			this.returnValue = false
		}
		function cancelBubble(){
			this.cancelBubble = true
		}
		function stopAllAftermath(){
			if(this.stopImmediatePropagation) this.stopImmediatePropagation();
			else if(this.stopPropagation) this.stopPropagation();
			if(this.preventDefault) this.preventDefault();
		}
		
		function fixEvent(event) {
			event = event || window.event;
			
			if (event.isFixed) {
				return event;
			}
			event.isFixed = true ;
			
			event.preventDefault = event.preventDefault || returnFalse;
			event.stopPropagation = event.stopPropagation || cancelBubble;
			event.stopAllAftermath = stopAllAftermath;
			
			if (!event.target) {
				event.target = event.srcElement;
			}
			
			if (!event.relatedTarget && event.fromElement) {
				event.relatedTarget = event.fromElement == event.target ?
					event.toElement : event.fromElement;
			}
			
			if (!event.which && event.button) {
				event.which = (event.button & 1 ?
							   1 : (event.button & 2 ?
									3 : ( event.button & 4 ?
										  2 : 0 )));
			}
			return event;
		}
		
		/* Вызывается в контексте элемента всегда this = element */
		function commonHandle(event){
			event = fixEvent(event);
			
			var handlers = this.events[event.type];

			for (var g in handlers) {
				var handler = handlers[g];

				var ret = handler.call(this, event);
				if ( ret === false ) event.stopAllAftermath();
			}
		}
		
		return {
			add: function(elem, type, handler){
				if (elem.setInterval && (elem != window && !elem.frameElement)) {
					elem = window;
				}
				
				if (!handler.guid) {
					handler.guid = ++guid;
				}
				
				if (!elem.events) {
					elem.events = {};
					elem.handle = function(event) {
						if (typeof event !== "undefined") {
							return commonHandle.call(elem, event);
						}
					}
				}
				
				if (!elem.events[type]) {
					elem.events[type] = {};
					
					if (elem.addEventListener) {
						elem.addEventListener(type, elem.handle, false);
					} else if (elem.attachEvent) {
						elem.attachEvent("on" + type, elem.handle);
					}
				}
				
				elem.events[type][handler.guid] = handler;
				
				return elem;
			},
			
			getEventArray: function(elem){
				var res = new Array(),
					elemEvents = elem.events;
				for(var type in elemEvents) {
					if (!elemEvents.hasOwnProperty(type)) continue;
					for(var handle in elemEvents[type]) {
						res.push({type:type, handler:elemEvents[type][handle]});
					}
				}
				elemEvents = type = handle = null;
				return res;
			},
			
			remove: function(elem, type, handler) {
				var handlers = elem.events && elem.events[type];
				
				if (!handlers) return elem;
				
				delete handlers[handler.guid];
				
				for(var any in handlers) {
					if (handlers.hasOwnProperty(any)) return elem;
				}
				if (elem.removeEventListener) {
					elem.removeEventListener(type, elem.handle, false);
				} else if (elem.detachEvent) {
					elem.detachEvent("on" + type, elem.handle);
				}
				
				delete elem.events[type];
				
				for (var any in elem.events) {
					if (elem.events.hasOwnProperty(any)) return elem;
				}
				try {
					delete elem.handle;
					delete elem.events;
				} catch(e) { // IE
					elem.removeAttribute("handle");
					elem.removeAttribute("events");
				}
				return elem;
			},
			
			removeAll: function(elem){
				var events = this.getEventArray(elem),
					numberOfRemoved = events.length;
				for(var e = 0; e<events.length; e++){
					this.remove(elem, events[e].type, events[e].handler);
				}
				events = null;
				return numberOfRemoved;
			}
		}
	}(),
	
    /**
     * Creates Style element in head.
     * @param {!string=} src location.
     */
	addStyle : function(src, doneCallback) {
		var dfd = $.Deferred();
		dfd.done(function(){
			console.log("Source '%s' loaded success", src);
			if (doneCallback) doneCallback();
		});	
		$.getStyle(src, dfd.resolve);
		return dfd.promise();
	},
    /**
     * Creates Script element in head.
     * @param {!string=} src location.
     */
	addScript: function(src, doneCallback) {
		var dfd = $.Deferred();
	 
		dfd.done(function(script, textStatus){
		  console.log("Source '%s' loaded %s", src, textStatus);
		  if (doneCallback) doneCallback();
		});		
	
		$.cachedScript(src).done(dfd.resolve);
		return dfd.promise();
	},
	
    /**
     * Creates DOM Element.
     */
    debug: function(msg){
        if (console && console.log) {
            console.log(msg);
        }
    }
};



/**
 * @param {!HTMLElement} elem HTML Element.
 * @return {{top: number, left: number}} Element's position related to the
 * window using the offsets sum (obsolete way).
 */
function getOffsetSum(elem) {
	var top = 0, left = 0;
	while (elem) {
		top = top + parseInt(elem.offsetTop, 10);
		left = left + parseInt(elem.offsetLeft, 10);
		elem = elem.offsetParent;
	}
	var html = document.getElementsByTagName('html')[0];
	if (html) { // маргины html не учитываются при суммировании оффсетов
		top += parseInt(getStyle(html, 'margin-top'), 0);
		left += parseInt(getStyle(html, 'margin-left'), 0);
	}
	return {top: top, left: left};
}
/**
 * @param {!HTMLElement} elem HTML Element.
 * @return {{top: number, left: number}} Element's position related to the
 * window using getBoundingClientRect (proper way).
 */
function getOffsetRect(elem) {
	var box = elem.getBoundingClientRect();

	var body = document.body;
	var docElem = document.documentElement;

	var scrollTop = window.pageYOffset ||
		docElem.scrollTop ||
		body.scrollTop;

	var scrollLeft = window.pageXOffset ||
		docElem.scrollLeft ||
		body.scrollLeft;

	var clientTop = docElem.clientTop || body.clientTop || 0;
	var clientLeft = docElem.clientLeft || body.clientLeft || 0;

	var top = box.top + scrollTop - clientTop;
	var left = box.left + scrollLeft - clientLeft;

	return {top: Math.round(top), left: Math.round(left)};
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