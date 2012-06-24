/**
 * Utils
 * @author Klimashkin P.
 */
define(['jquery', 'jqplugins/extends'], function ($) {
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
		
		isObjectsEqual: function(obj1, obj2) {
			var p1 = this.getOwnPropertyNames(obj1), i = p1.length, prop,
				p2 = this.getOwnPropertyNames(obj2);
			if (i == p2.length){
				while (i--) {
					prop = p1[i];
					if (!obj2.hasOwnProperty(prop) || obj2[prop]!==obj2[prop]) return false;
				}
				return true;
			}
			return false;
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
		
		randomString: function(length) {
			var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz'.split('');
			
			if (!length) {
				length = Math.floor(Math.random() * chars.length);
			}
			
			var str = '';
			for (var i = 0; i < length; i++) {
				str += chars[Math.floor(Math.random() * chars.length)];
			}
			return str;
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
		
		getCookie: function(){
			if (typeof window.getCookie == 'function') {
				var func = window.getCookie;
				delete window.getCookie;
				return func;
			}else {
				return function (name) {
					var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"));
					return matches ? decodeURIComponent(matches[1]) : undefined 
				};
			}
		}(),
		setCookie: function(){
			if (typeof window.setCookie == 'function') {
				var func = window.setCookie;
				delete window.setCookie;
				return func;
			}else {
				return function (name, value, props) {
					props = props || {}
					var exp = props.expires
					if (typeof exp == "number" && exp) {
						var d = new Date()
						d.setTime(d.getTime() + exp*1000)
						exp = props.expires = d
					}
					if(exp && exp.toUTCString) { props.expires = exp.toUTCString() }

					value = encodeURIComponent(value)
					var updatedCookie = name + "=" + value
					for(var propName in props){
						updatedCookie += "; " + propName
						var propValue = props[propName]
						if(propValue !== true){ updatedCookie += "=" + propValue }
					}
					document.cookie = updatedCookie

				};
			}
		}(),
		deleteCookie: function(){
			if (typeof window.deleteCookie == 'function') {
				var func = window.deleteCookie;
				delete window.deleteCookie;
				return func;
			}else {
				return function (name) {
					setCookie(name, null, { expires: -1 })
				};
			}
		}(),
		
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
	
	return Utils;
});