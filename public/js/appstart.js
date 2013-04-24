(function () {
	'use strict';

	var head = document.head || document.getElementsByTagName('head')[0],
		appHash = (head.dataset && head.dataset.apphash) || head.getAttribute('data-apphash') || '000',
		loadImg;

	bindReady(function () {
		if (!getCookie('oldmos.load.' + appHash)) {
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
				setCookie('oldmos.load.' + appHash, new Date().toUTCString());
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
		var s = document.createElement('script');
		s.setAttribute('type', 'text/javascript');
		s.setAttribute('src', '/js/appMain.js?__=' + appHash);
		head.appendChild(s);
	}

	function getCookie(name) {
		var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"));
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