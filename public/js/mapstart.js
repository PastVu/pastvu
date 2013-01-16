(function () {
    'use strict';

    if (!document.head) {
        document.head = document.getElementsByTagName('head')[0];
    }
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
        loadImg;

    bindReady(function () {
        if (!getCookie('oldmos.load.' + appHash)) {
            window.wasLoading = true;

            var loadLayout =
                '<div id="main_loader">' +
                '<div id="cnt">' +
                '<div id="welcome_msg">Retro photo of humankind urbanization</div><div id="loading_pics"><div id="l1"></div><div id="l2"></div><div id="l3"></div><div id="l4"></div><div id="l5"></div><div id="l6"></div><div id="l7"></div><div id="l8"></div><div id="l9"></div><div id="l10"></div></div><div id="bar"><div id="bar_fill"></div></div><div id="info_msg">loading, please wait</div>' +
                '</div><div class="helper"></div>' +
                '</div>';
            document.body.innerHTML = loadLayout;

            loadImg = new Image();

            loadImg.onabort = loadImg.onerror = function (evt) {
                start();
            };

            loadImg.onload = function (evt) {
                setCookie('oldmos.load.' + appHash, new Date().toUTCString());
                var loading_pics = document.getElementById('loading_pics');
                loading_pics.style.backgroundImage = 'url(/img/loading/Loading1.jpg)';
                document.getElementById('main_loader').className += ' show';
                loading_pics.className += ' finish';
                loadImg = null;

                start();
            };

            loadImg.src = '/img/loading/Loading1.jpg';
        } else {
            start();
        }
    });

    function start() {
        var s = document.createElement('script');
        s.setAttribute('type', 'text/javascript');
        s.setAttribute('src', '/js/appMap.js?__=' + appHash);
        document.head.appendChild(s);
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