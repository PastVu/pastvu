(function () {
    if (!document.head) {
        document.head = document.getElementsByTagName('head')[0];
    }
    var appHash = (document.head.dataset && document.head.dataset.apphash) || document.head.getAttribute('data-apphash') || '000',
        loadImg;

    if (!getCookie('oldmos.load.' + appHash)) {
        loadImg = new Image();

        loadImg.onabort = loadImg.onerror = function (evt) {
            start();
        };

        loadImg.onload = function (evt) {
            setCookie('oldmos.load.' + appHash, new Date().toUTCString());
            var loading_pics = document.getElementById('loading_pics');
            loading_pics.style.backgroundImage = 'url(/images/loading/Loading1.jpg)';
            document.getElementById('main_loader').className += ' visi';
            loading_pics.className += ' finish';
            loadImg = null;

            start();
        };

        loadImg.src = '/images/loading/Loading1.jpg';
    } else {
        start();
    }

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
}());