/*global escape:true, unescape:true*/
(function () {
	'use strict';

	if (!Date.now) {
		Date.now = function now() {
			return new Date().getTime();
		};
	}

	var head = document.head || document.getElementsByTagName('head')[0],
		appHash = (head.dataset && head.dataset.apphash) || head.getAttribute('data-apphash') || '000',
		appName = (head.dataset && head.dataset.appname) || head.getAttribute('data-appname') || 'Main',
		loadImg,
		docCookies = {
			getItem: function (sKey) {
				return unescape(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + escape(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
			},
			setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
				if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) {
					return false;
				}
				var sExpires = "";
				if (vEnd) {
					switch (vEnd.constructor) {
					case Number:
						if (vEnd === Infinity) {
							sExpires = "; expires=Fri, 31 Dec 9999 23:59:59 GMT";
						} else {
							sExpires = "; expires=" + new Date(Date.now() + vEnd * 1000).toUTCString() + "; max-age=" + vEnd;
						}
						break;
					case String:
						sExpires = "; expires=" + vEnd;
						break;
					case Date:
						sExpires = "; expires=" + vEnd.toGMTString();
						break;
					}
				}
				document.cookie = escape(sKey) + "=" + escape(sValue) + sExpires + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "") + (bSecure ? "; secure" : "");
				return true;
			},
			removeItem: function (sKey, sPath) {
				if (!sKey || !this.hasItem(sKey)) {
					return false;
				}
				document.cookie = escape(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + (sPath ? "; path=" + sPath : "");
				return true;
			},
			hasItem: function (sKey) {
				return (new RegExp("(?:^|;\\s*)" + escape(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=")).test(document.cookie);
			},
			keys: /* optional method: you can safely remove it! */ function () {
				var aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, "").split(/\s*(?:\=[^;]*)?;\s*/),
					nIdx;
				for (nIdx = 0; nIdx < aKeys.length; nIdx++) {
					aKeys[nIdx] = unescape(aKeys[nIdx]);
				}
				return aKeys;
			}
		};

	bindReady(function () {
		if (!docCookies.getItem('pastvu.load.' + appHash)) {
			document.title = 'Фотографии прошлого';
			window.wasLoading = true;

			var loadLayout = '<div id="apploader">' +
				'<div id="apploaderCenter">' +
				'<div id="apploaderLogo"></div>' +
				'<div id="apploaderLoading"></div>' +
				'</div>' +
				'<div id="apploaderHelper"></div>' +
				'</div>';
			document.body.innerHTML = loadLayout;

			loadImg = new Image();
			loadImg.onabort = loadImg.onerror = function () {
				start();
			};
			loadImg.onload = function () {
				document.getElementById('apploader').className += ' show';
				loadImg = null;
				start();
			};
			loadImg.src = '/img/misc/load.gif';
		} else {
			start();
		}
	});

	function start() {
		//Всё время устанавливаем куку, продлевая её каждый раз на 7 дней с последнего захода
		docCookies.setItem('pastvu.load.' + appHash, String(Date.now()), 604800, '/', null);

		var s = document.createElement('script');
		s.setAttribute('type', 'text/javascript');
		s.setAttribute('src', '/js/module/app' + appName + '.js?__=' + appHash);
		head.appendChild(s);
	}

	// Inspired by http://javascript.info/tutorial/onload-ondomcontentloaded
	function bindReady(handler) {
		var called = false,
			isFrame,
			fn;

		function ready() {
			if (called) {
				return;
			}
			called = true;
			handler();
		}

		if (document.addEventListener) { // native event
			document.addEventListener("DOMContentLoaded", ready, false);
		} else if (document.attachEvent) {  // IE
			isFrame = false;

			try {
				isFrame = window.frameElement !== null;
			} catch (e) {
			}

			// IE, the document is not inside a frame
			if (document.documentElement.doScroll && !isFrame) {
				tryScroll();
			}

			// IE, the document is inside a frame
			document.attachEvent("onreadystatechange", function () {
				if (document.readyState === "complete") {
					ready();
				}
			});
		}

		// Old browsers
		if (window.addEventListener) {
			window.addEventListener('load', ready, false);
		} else if (window.attachEvent) {
			window.attachEvent('onload', ready);
		} else {
			fn = window.onload; // very old browser, copy old onload
			window.onload = function () { // replace by new onload and call the old one
				if (fn) {
					fn();
				}
				ready();
			};
		}
		function tryScroll() {
			if (called) {
				return;
			}
			try {
				document.documentElement.doScroll("left");
				ready();
			} catch (e) {
				setTimeout(tryScroll, 10);
			}
		}
	}
}());