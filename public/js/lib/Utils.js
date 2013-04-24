/*global requirejs:true, require:true, define:true*/
/**
 * Utils
 * @author Klimashkin P.
 */
define(['jquery', 'underscore', 'lib/jquery/plugins/extends'], function ($, _) {
	var Utils = {

		/**
		 * Class powers the OOP facilities of the library. Thanks to John Resig and Dean Edwards for inspiration!
		 */
		Class: (function () {
			/**
			 * Merge src properties into dest
			 * @param {!Object} dest
			 * @return {!Object}
			 */
			function extend(dest) {
				var sources = Array.prototype.slice.call(arguments, 1), i, j, len, src;
				for (j = 0, len = sources.length; j < len; j++) {
					src = sources[j] || {};
					for (i in src) {
						if (src.hasOwnProperty(i)) {
							dest[i] = src[i];
						}
					}
				}
				return dest;
			}

			var Class = function () {
			};

			/**
			 *
			 * @param {!Object} props
			 * @return {Function} Class
			 */
			Class.extend = function (props) {
				var NewClass, F, proto, i;

				// extended class with the new prototype
				NewClass = function () {
					if (this.initialize) {
						this.initialize.apply(this, arguments);
					}
				};

				// instantiate class without calling constructor
				F = function () {
				};
				F.prototype = this.prototype;

				proto = new F();
				proto.constructor = NewClass;

				NewClass.prototype = proto;

				//inherit parent's statics
				for (i in this) {
					if (this.hasOwnProperty(i) && i !== 'prototype') {
						NewClass[i] = this[i];
					}
				}

				// mix static properties into the class
				if (props.statics) {
					extend(NewClass, props.statics);
					delete props.statics;
				}

				// mix includes into the prototype
				if (props.includes) {
					extend.apply(null, [proto].concat(props.includes));
					delete props.includes;
				}

				// merge options
				if (props.options && proto.options) {
					props.options = extend({}, proto.options, props.options);
				}

				// mix given properties into the prototype
				extend(proto, props);

				return NewClass;
			};


			// method for adding properties to prototype
			Class.include = function (props) {
				extend(this.prototype, props);
			};

			Class.mergeOptions = function (options) {
				extend(this.prototype.options, options);
			};

			return Class;
		}()),

		/**
		 * Проверяет на соответствие объекта типу (вместо typeof)
		 * @param {string} type Имя типа.
		 * @param {Object} obj Проверяемый объект.
		 * @return {boolean}
		 */
		isType: function (type, obj) {
			return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
		},

		isObjectEmpty: function (obj) {
			return this.getObjectPropertyLength(obj) === 0;
		},

		isObjectsEqual: function (obj1, obj2) {
			var p1 = this.getOwnPropertyNames(obj1), i = p1.length, prop,
				p2 = this.getOwnPropertyNames(obj2);
			if (i === p2.length) {
				while (i--) {
					prop = p1[i];
					if (!obj2.hasOwnProperty(prop)) {
						return false;
					}
				}
				return true;
			}
			return false;
		},


		getObjectPropertyLength: (function () {
			function ecma5(obj) {
				return Object.keys(obj).length;
			}

			function ecma3(obj) {
				var result = 0, prop;
				for (prop in obj) {
					if (obj.hasOwnProperty(prop)) {
						result += 1;
					}
				}
				return result;
			}

			return Object.keys ? ecma5 : ecma3;
		}()),

		getObjectOneOwnProperty: (function () {
			function ecma5(obj) {
				return Object.keys(obj)[0];
			}

			function ecma3(obj) {
				var prop;
				for (prop in obj) {
					if (obj.hasOwnProperty(prop)) {
						return prop;
					}
				}
			}

			return Object.keys ? ecma5 : ecma3;
		}()),

		printObject: function (o) {
			var out = '', p;
			for (p in o) {
				if (o.hasOwnProperty(p)) {
					out += p + ': ' + o[p] + '\n';
				}
			}
			return out;
		},

		/**
		 * Загружает изображение и по завешению загрузки вызывает callback
		 * @param url
		 * @param callback
		 * @param ctx
		 * @param callbackParam
		 */
		loadImage: function (url, callback, ctx, callbackParam) {
			var loadImg = new Image();
			loadImg.onload = function (evt) {
				if (Utils.isType('function', callback)) {
					callback.call(ctx, callbackParam);
				}
				loadImg = null;
			};
			loadImg.src = url;
		},

		/**
		 * Возвращает значение параметра из строки адреса, содержащей параметры, или переданной строки
		 * @param name Имя параметра
		 * @param url Часть строки, начиная со знака ?
		 * @return {String|null}
		 */
		getURLParameter: function (name, url) {
			return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(url || location.search) || [undefined, ""])[1].replace(/\+/g, '%20')) || null;
		},

		getURLParameters: function (url) {
			var qs = url.indexOf("?"),
				fr = url.indexOf("#"),
				parts,
				vars = {},
				p,
				q,
				i;

			if (qs > -1) {
				q = (fr === -1) ? url.substr(qs + 1) : url.substr(qs + 1, fr - qs - 1);
				parts = q.split("&");

				for (i = 0; i < parts.length; i++) {
					p = parts[i].split("=");
					if (p[1]) {
						vars[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
					} else {
						vars[decodeURIComponent(p[0])] = "";
					}
				}
			}

			return vars;
		},

		urlReplaceParameterValue: function (url, param, value) {
			return url.replace(new RegExp('(' + param + '=).*?(&)'), '$1' + value + '$2');
		},

		/**
		 * Возвращает значение data- параметра dom-элемента
		 * @param ele Элемент
		 * @param name Имя параметра
		 */
		getDataParam: (function () {
			"use strict";
			function html5data(ele, name) {
				return ele.dataset[name];
			}

			function attrData(ele, name) {
				return ele.getAttribute('data-' + name);
			}

			return !!document.createElement('div').dataset ? html5data : attrData;
		}()),

		randomString: function (length) {
			'use strict';
			var chars = String('0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz').split(''),
				str = '',
				i;

			if (!length) {
				length = Math.random() * chars.length >> 0;
			}

			for (i = 0; i < length; i += 1) {
				str += chars[Math.random() * chars.length >> 0];
			}
			chars = i = null;
			return str;
		},

		cutStringByWord: function (text, n) {
			"use strict";
			var cut = text.lastIndexOf(' ', n);
			if (cut === -1) {
				return text.substr(0, n);
			}
			return text.substring(0, cut);
		},

		/**
		 *
		 * @param time Время в миллисекундах
		 * @param update Колбэк, вызываемый каждую секунду. Передается параметр - секунд осталось
		 * @param complete
		 */
		timer: function timer(time, update, complete) {
			var start = new Date().getTime(),
				interval = setInterval(function () {
					var now = time - (new Date().getTime() - start);
					if (now <= 0) {
						clearInterval(interval);
						if (complete) {
							complete();
						}
					} else if (update) {
						update(now / 1000 >> 0);
					}
				}, 100); // the smaller this number, the more accurate the timer will be
		},

		format: (function () {
			function formatFileSize(bytes) {
				if (typeof bytes !== 'number') {
					return '';
				}
				if (bytes >= 1000000000) {
					return (bytes / 1000000000).toFixed(2) + ' GB';
				}
				if (bytes >= 1000000) {
					return (bytes / 1000000).toFixed(2) + ' MB';
				}
				return (bytes / 1000).toFixed(2) + ' KB';
			}

			function formatBitrate(bits) {
				if (typeof bits !== 'number') {
					return '';
				}
				if (bits >= 1000000000) {
					return (bits / 1000000000).toFixed(2) + ' Gbit/s';
				}
				if (bits >= 1000000) {
					return (bits / 1000000).toFixed(2) + ' Mbit/s';
				}
				if (bits >= 1000) {
					return (bits / 1000).toFixed(2) + ' kbit/s';
				}
				return bits.toFixed(2) + ' bit/s';
			}

			function secondsToTime(secs) {
				"use strict";
				if (secs < 60) {
					return '0:' + (secs > 9 ? secs : '0' + secs);
				}

				var hours = (secs / (60 * 60)) >> 0,
					divisor_for_minutes = secs % (60 * 60),
					minutes = (divisor_for_minutes / 60) >> 0,
					divisor_for_seconds = divisor_for_minutes % 60,
					seconds = Math.ceil(divisor_for_seconds);

				return (hours > 0 ? hours + ':' + (minutes > 9 ? minutes : '0' + minutes) : minutes) + ':' + (seconds > 9 ? seconds : '0' + seconds);
			}

			function formatPercentage(floatValue) {
				return (floatValue * 100).toFixed(2) + ' %';
			}

			return {
				fileSize: formatFileSize,
				bitrate: formatBitrate,
				secondsToTime: secondsToTime,
				percentage: formatPercentage
			};
		}()),

		mousePageXY: function (e) {
			var x = 0, y = 0, et;
			if (!e) {
				e = window.event;
			}
			if (e.touches && e.touches.item && e.touches.item(0)) {
				et = e.touches.item(0);
				if (et.pageX || et.pageY) {
					x = et.pageX;
					y = et.pageY;
				} else if (et.clientX || et.clientY) {
					x = et.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
					y = et.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
				}
			} else if (e.pageX || e.pageY) {
				x = e.pageX;
				y = e.pageY;
			} else if (e.clientX || e.clientY) {
				x = e.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
				y = e.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
			}
			return {"x": x, "y": y};
		},

		/**
		 * Caps Lock Detector 1.0
		 * @author Igor Tigirlas, last update 05.08.2005
		 * @param evt
		 */
		capsLockDetect: function (evt) {
			if (!evt) {
				evt = window.event || null;
			}
			if (!evt) {
				return;
			}

			var n = evt.keyCode || evt.charCode,
				c,
				cUC,
				cLC;

			if (evt.type === "keypress") {
				c = String.fromCharCode(n);
				cUC = c.toUpperCase();
				cLC = c.toLowerCase();

				if (cUC !== cLC) {
					return ((evt.shiftKey && cLC === c) || (!evt.shiftKey && cUC === c));
				}
			} else if (evt.type === "keydown" && n === 20) {
				return false;
			}
		},


		getClientWidth: function () {
			var result = 0;
			if (window.opera && window.innerWidth) {
				result = window.innerWidth;
			} else {
				result = (document.compatMode === 'CSS1Compat' && !window.opera ?
				          document.documentElement.clientWidth : document.body.clientWidth);
			}
			return result;
		},

		getClientHeight: function () {
			return window.opera && window.innerWidth ? window.innerWidth : (document.compatMode === 'CSS1Compat' && !window.opera ?
			                                                                document.documentElement.clientHeight :
			                                                                document.body.clientHeight);
		},

		getBodyScrollTop: function () {
			return window.pageYOffset ||
				(document.documentElement && document.documentElement.scrollTop) ||
				(document.body && document.body.scrollTop);
		},

		getBodyScrollLeft: function () {
			return window.pageXOffset ||
				(document.documentElement && document.documentElement.scrollLeft) ||
				(document.body && document.body.scrollLeft);
		},

		getDocumentHeight: function () {
			var scrollHeight = document.body.scrollHeight,
				offsetHeight = document.body.offsetHeight;
			return (scrollHeight > offsetHeight) ? scrollHeight : offsetHeight;
		},

		getDocumentWidth: function () {
			var scrollWidth = document.body.scrollWidth,
				offsetWidth = document.body.offsetWidth;

			return (scrollWidth > offsetWidth) ? scrollWidth : offsetWidth;
		},

		getElementComputedStyle: function (elem, prop) {
			if (typeof elem !== "object") {
				elem = document.getElementById(elem);
			}
			// external stylesheet for Mozilla, Opera 7+ and Safari 1.3+
			if (document.defaultView && document.defaultView.getComputedStyle) {
				if (prop.match(/[A-Z]/)) {
					prop = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
				}
				return document.defaultView.getComputedStyle(elem, "").getPropertyValue(prop);
			}
			// external stylesheet for Explorer and Opera 9
			if (elem.currentStyle) {
				var i;
				while ((i = prop.indexOf("-")) !== -1) {
					prop = prop.substr(0, i) + prop.substr(i + 1, 1).toUpperCase() + prop.substr(i + 2);
				}
				return elem.currentStyle[prop];
			}
			return "";
		},

		/**
		 * @param {!HTMLElement} elem HTML Element.
		 * @return {{top: number, left: number}} Element's position related to the
		 * window.
		 */
		getOffset: function (elem) {
			return elem.getBoundingClientRect ? getOffsetRect(elem) : getOffsetSum(elem);
		},

		getDistance: function (x1, x2, y1, y2) {
			return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
		},

		cookie: (function () {
			'use strict';

			function getCookie(name) {
				var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+\^])/g, '\\$1') + "=([^;]*)"));
				return matches ? decodeURIComponent(matches[1]) : undefined;
			}

			function setCookie(name, value, props) {
				props = props || {};
				value = encodeURIComponent(value);

				var updatedCookie = name + "=" + value,
					exp = props.expires,
					dat,
					propName,
					propValue;
				if (typeof exp === "number" && exp) {
					dat = new Date();
					dat.setTime(dat.getTime() + exp * 1000);
					exp = props.expires = dat;
				}
				if (exp && exp.toUTCString) {
					props.expires = exp.toUTCString();
				}

				for (propName in props) {
					if (props.hasOwnProperty(propName)) {
						updatedCookie += "; " + propName;
						propValue = props[propName];
						if (propValue !== true) {
							updatedCookie += "=" + propValue;
						}
					}
				}
				document.cookie = updatedCookie;
			}

			function deleteCookie(name) {
				setCookie(name, null, { expires: -1 });

			}

			return {
				get: getCookie,
				set: setCookie,
				delete: deleteCookie
			};
		}()),

		title: (function () {
			'use strict';

			var titlePostfix = '',
				titlePre = '',
				titleVal = '',
				titlePost = '';

			function updateTitle() {
				document.title = titlePre + titleVal + titlePost + (titlePostfix ? ' - ' + titlePostfix : '');
				return document.title;
			}

			return {
				setPostfix: function (val) {
					titlePostfix = val || '';
				},
				setTitle: function (options) {
					titlePre = options.pre || '';
					titleVal = options.title || '';
					titlePost = options.post || '';
					if (options.postfix) {
						titlePostfix = String(options.postfix);
					}
					return updateTitle();
				},
				addPre: function (val) {
					titlePre = val || '';
					return updateTitle();
				},
				removePre: function () {
					titlePre = '';
					return updateTitle();
				},
				addPost: function (val) {
					titlePost = val || '';
					return updateTitle();
				},
				removePost: function () {
					titlePost = '';
					return updateTitle();
				}
			};
		}()),

		math: (function () {
			'use strict';

			/**
			 * Обрезание числа с плавающей запятой до указанного количества знаков после запятой
			 * http://jsperf.com/math-round-vs-tofixed-with-decimals/2
			 * @param number Число для обрезания
			 * @param precision Точность
			 * @return {Number}
			 */
			function toPrecision(number, precision) {
				var divider = Math.pow(10, precision || 6);
				return ~~(number * divider) / divider;
			}

			/**
			 * Обрезание с округлением числа с плавающей запятой до указанного количества знаков после запятой
			 * @param number Число
			 * @param precision Точность
			 * @return {Number}
			 */
			function toPrecisionRound(number, precision) {
				var divider = Math.pow(10, precision || 6);
				return Math.round(number * divider) / divider;
			}

			return {
				toPrecision: toPrecision,
				toPrecisionRound: toPrecisionRound
			};
		}()),

		geo: (function () {
			'use strict';

			/**
			 * Haversine formula to calculate the distance
			 * @param lat1
			 * @param lon1
			 * @param lat2
			 * @param lon2
			 * @return {Number}
			 */
			function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
				var R = 6371, // Mean radius of the earth in km
					dLat = deg2rad(lat2 - lat1), // deg2rad below
					dLon = deg2rad(lon2 - lon1),
					a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
						Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2),
					c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
					d = R * c; // Distance in km
				return d;
			}

			function deg2rad(deg) {
				return deg * (Math.PI / 180);
			}

			function geoToPrecision(geo, precision) {
				_.forEach(geo, function (item, index, array) {
					array[index] = Utils.math.toPrecision(item, precision || 6);
				});
				return geo;
			}

			function geoToPrecisionRound(geo, precision) {
				_.forEach(geo, function (item, index, array) {
					array[index] = Utils.math.toPrecisionRound(item, precision || 6);
				});
				return geo;
			}

			function latlngToArr(ll, lngFirst) {
				return lngFirst ? [ll.lng, ll.lat] : [ll.lat, ll.lng];
			}

			return {
				geoToPrecision: geoToPrecision,
				geoToPrecisionRound: geoToPrecisionRound,
				getDistanceFromLatLonInKm: getDistanceFromLatLonInKm,
				deg2rad: deg2rad,
				latlngToArr: latlngToArr
			};
		}()),

		color: {
			/**
			 * Converts an RGB in hex color value to HSL. Conversion formula
			 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
			 * Assumes HTMLcolor (like '00ff99') and
			 * returns h, s, and l in the set [0, 1].
			 */
			hex2hsl: function (HTMLcolor) {
				var r = parseInt(HTMLcolor.substring(0, 2), 16) / 255,
					g = parseInt(HTMLcolor.substring(2, 4), 16) / 255,
					b = parseInt(HTMLcolor.substring(4, 6), 16) / 255,
					max = Math.max(r, g, b),
					min = Math.min(r, g, b),
					d = max - min,
					h,
					s,
					l = (max + min) / 2;
				if (max === min) {
					h = s = 0;
				} else {
					s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
					switch (max) {
					case r:
						h = (g - b) / d + (g < b ? 6 : 0);
						break;
					case g:
						h = (b - r) / d + 2;
						break;
					case b:
						h = (r - g) / d + 4;
						break;
					}
					h /= 6;
				}
				return {h: h, s: s, l: l};
			},

			/**
			 * Converts an HSL color value to RGB. Conversion formula
			 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
			 * Assumes h, s, and l are contained in the set [0, 1] and
			 * returns r, g, and b in the set [0, 255].
			 */
			hslToRgb: function (h, s, l) {
				var r, g, b, hue2rgb, q, p;

				if (s === 0) {
					r = g = b = l; // achromatic
				} else {
					hue2rgb = function (p, q, t) {
						if (t < 0) {
							t += 1;
						}
						if (t > 1) {
							t -= 1;
						}
						if (t < 1 / 6) {
							return p + (q - p) * 6 * t;
						}
						if (t < 1 / 2) {
							return q;
						}
						if (t < 2 / 3) {
							return p + (q - p) * (2 / 3 - t) * 6;
						}
						return p;
					};

					q = l < 0.5 ? l * (1 + s) : l + s - l * s;
					p = 2 * l - q;
					r = hue2rgb(p, q, h + 1 / 3);
					g = hue2rgb(p, q, h);
					b = hue2rgb(p, q, h - 1 / 3);
				}

				return {r: r * 255, g: g * 255, b: b * 255};
			},

			/**
			 * Converts an RGB color value to HSV. Conversion formula
			 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
			 * Assumes HTMLcolor and
			 * returns h, s, and v in the set [0, 1].
			 */
			rgbToHsv: function (HTMLcolor) {
				var r = parseInt(HTMLcolor.substring(0, 2), 16) / 255,
					g = parseInt(HTMLcolor.substring(2, 4), 16) / 255,
					b = parseInt(HTMLcolor.substring(4, 6), 16) / 255,
					max = Math.max(r, g, b),
					min = Math.min(r, g, b),
					d = max - min,
					h,
					s = max === 0 ? 0 : d / max;

				if (max === min) {
					h = 0; // achromatic
				} else {
					switch (max) {
					case r:
						h = (g - b) / d + (g < b ? 6 : 0);
						break;
					case g:
						h = (b - r) / d + 2;
						break;
					case b:
						h = (r - g) / d + 4;
						break;
					}
					h /= 6;
				}

				return [h, s, max];
			},

			/**
			 * Converts an HSV color value to RGB. Conversion formula
			 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
			 * Assumes h, s, and v are contained in the set [0, 1] and
			 * returns r, g, and b in the set [0, 255].
			 */
			hsvToRgb: function (h, s, v) {
				var r, g, b,
					i = h * 6 >> 0,
					f = h * 6 - i,
					p = v * (1 - s),
					q = v * (1 - f * s),
					t = v * (1 - (1 - f) * s);

				switch (i % 6) {
				case 0:
					r = v;
					g = t;
					b = p;
					break;
				case 1:
					r = q;
					g = v;
					b = p;
					break;
				case 2:
					r = p;
					g = v;
					b = t;
					break;
				case 3:
					r = p;
					g = q;
					b = v;
					break;
				case 4:
					r = t;
					g = p;
					b = v;
					break;
				case 5:
					r = v;
					g = p;
					b = q;
					break;
				}

				return [r * 255, g * 255, b * 255];
			}
		},

		Event: (function () {

			var guid = 0;

			function returnFalse() {
				this.returnValue = false;
			}

			function cancelBubble() {
				this.cancelBubble = true;
			}

			function stopAllAftermath() {
				if (this.stopImmediatePropagation) {
					this.stopImmediatePropagation();
				} else if (this.stopPropagation) {
					this.stopPropagation();
				}
				if (this.preventDefault) {
					this.preventDefault();
				}
			}

			function fixEvent(event) {
				event = event || window.event;

				if (event.isFixed) {
					return event;
				}
				event.isFixed = true;

				event.preventDefault = event.preventDefault || returnFalse;
				event.stopPropagation = event.stopPropagation || cancelBubble;
				event.stopAllAftermath = stopAllAftermath;

				if (!event.target) {
					event.target = event.srcElement;
				}

				if (!event.relatedTarget && event.fromElement) {
					event.relatedTarget = event.fromElement === event.target ?
					                      event.toElement : event.fromElement;
				}

				if (!event.which && event.button) {
					event.which = (event.button & 1 ?
					               1 : (event.button & 2 ?
					                    3 : (event.button & 4 ?
					                         2 : 0)));
				}
				return event;
			}

			/* Вызывается в контексте элемента всегда this = element */
			function commonHandle(event) {
				event = fixEvent(event);

				var handlers = this.events[event.type],
					handler,
					g,
					ret;

				for (g in handlers) {
					if (handlers.hasOwnProperty(g)) {
						handler = handlers[g];

						ret = handler.call(this, event);
						if (ret === false) {
							event.stopAllAftermath();
						}
					}
				}
			}

			return {
				add: function (elem, type, handler) {
					if (elem.setInterval && (elem !== window && !elem.frameElement)) {
						elem = window;
					}

					if (!handler.guid) {
						handler.guid = ++guid;
					}

					if (!elem.events) {
						elem.events = {};
						elem.handle = function (event) {
							if (Utils.isType('function', event)) {
								return commonHandle.call(elem, event);
							}
						};
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

				getEventArray: function (elem) {
					var res = [],
						elemEvents = elem.events,
						type,
						handle;
					for (type in elemEvents) {
						if (elemEvents.hasOwnProperty(type)) {
							for (handle in elemEvents[type]) {
								if (elemEvents[type].hasOwnProperty(handle)) {
									res.push({type: type, handler: elemEvents[type][handle]});
								}
							}
						}
					}
					elemEvents = type = handle = null;
					return res;
				},

				remove: function (elem, type, handler) {
					var handlers = elem.events && elem.events[type],
						any;

					if (!handlers) {
						return elem;
					}

					delete handlers[handler.guid];

					for (any in handlers) {
						if (handlers.hasOwnProperty(any)) {
							return elem;
						}
					}
					if (elem.removeEventListener) {
						elem.removeEventListener(type, elem.handle, false);
					} else if (elem.detachEvent) {
						elem.detachEvent("on" + type, elem.handle);
					}

					delete elem.events[type];

					for (any in elem.events) {
						if (elem.events.hasOwnProperty(any)) {
							return elem;
						}
					}
					try {
						delete elem.handle;
						delete elem.events;
					} catch (e) { // IE
						elem.removeAttribute("handle");
						elem.removeAttribute("events");
					}
					return elem;
				},

				removeAll: function (elem) {
					var events = this.getEventArray(elem),
						numberOfRemoved = events.length,
						e;
					for (e = 0; e < events.length; e++) {
						this.remove(elem, events[e].type, events[e].handler);
					}
					events = null;
					return numberOfRemoved;
				}
			};
		}()),

		/**
		 * Creates Style element in head.
		 * @param {!string=} src location.
		 */
		addStyle: function (src, doneCallback) {
			var dfd = $.Deferred();
			dfd.done(function () {
				console.log("Source '%s' loaded success", src);
				if (doneCallback) {
					doneCallback();
				}
			});
			$.getStyle(src, dfd.resolve);
			return dfd.promise();
		},
		/**
		 * Creates Script element in head.
		 * @param {!string=} src location.
		 */
		addScript: function (src, doneCallback) {
			var dfd = $.Deferred();

			dfd.done(function (script, textStatus) {
				console.log("Source '%s' loaded %s", src, textStatus);
				if (doneCallback) {
					doneCallback();
				}
			});

			$.cachedScript(src).done(dfd.resolve);
			return dfd.promise();
		},

		/**
		 * Creates DOM Element.
		 */
		debug: function (msg) {
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
		var top = 0, left = 0, html = document.getElementsByTagName('html')[0];
		while (elem) {
			top = top + parseInt(elem.offsetTop, 10);
			left = left + parseInt(elem.offsetLeft, 10);
			elem = elem.offsetParent;
		}

		if (html) { // маргины html не учитываются при суммировании оффсетов
			top += parseInt(Utils.getElementComputedStyle(html, 'margin-top'), 10);
			left += parseInt(Utils.getElementComputedStyle(html, 'margin-left'), 10);
		}
		return {top: top, left: left};
	}

	/**
	 * @param {!HTMLElement} elem HTML Element.
	 * @return {{top: number, left: number}} Element's position related to the
	 * window using getBoundingClientRect (proper way).
	 */
	function getOffsetRect(elem) {
		var box = elem.getBoundingClientRect(),

			body = document.body,
			docElem = document.documentElement,

			scrollTop = window.pageYOffset ||
				docElem.scrollTop ||
				body.scrollTop,

			scrollLeft = window.pageXOffset ||
				docElem.scrollLeft ||
				body.scrollLeft,

			clientTop = docElem.clientTop || body.clientTop || 0,
			clientLeft = docElem.clientLeft || body.clientLeft || 0,

			top = box.top + scrollTop - clientTop,
			left = box.left + scrollLeft - clientLeft;

		return {top: Math.round(top), left: Math.round(left)};
	}

	return Utils;
});