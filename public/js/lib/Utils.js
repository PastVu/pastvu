/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Utils
 *
 * @author Klimashkin
 */
define(['jquery', 'underscore', 'underscore.string', 'lib/geocoordsparser', 'lib/jsuri', 'lib/jquery/plugins/extends', 'bs/tooltip'], function ($, _, _s, parsecoords) {
    const Utils = {

        /**
         * Class powers the OOP facilities of the library. Thanks to John Resig and Dean Edwards for inspiration!
         */
        Class: (function () {
            /**
             * Merge src properties into dest
             *
             * @param {!object} dest
             * @returns {!object}
             */
            function extend(dest) {
                const sources = Array.prototype.slice.call(arguments, 1); let src; let i; let j = 0; const
                    len = sources.length;

                for (; j < len; j++) {
                    src = sources[j] || {};

                    for (i in src) {
                        if (src.hasOwnProperty(i)) {
                            dest[i] = src[i];
                        }
                    }
                }

                return dest;
            }

            // eslint-disable-next-line no-empty-function
            const Class = function () {
            };

            /**
             *
             * @param {!object} props
             * @returns {Function} Class
             */
            Class.extend = function (props) {
                let i;

                // extended class with the new prototype
                const NewClass = function () {
                    if (this.initialize) {
                        this.initialize.apply(this, arguments);
                    }
                };

                // instantiate class without calling constructor
                // eslint-disable-next-line no-empty-function
                const F = function () {
                };

                F.prototype = this.prototype;

                const proto = new F();

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

        inherit: (function () {
            // eslint-disable-next-line no-empty-function
            const F = function () {};

            return function (child, parent) {
                F.prototype = parent.prototype;
                child.prototype = new F();
                child.prototype.constructor = child;
                child.superproto = parent.prototype;

                return child;
            };
        }()),

        /**
         * Проверяет на соответствие объекта типу (вместо typeof)
         *
         * @param {string} type Имя типа.
         * @param {object} obj Проверяемый объект.
         * @returns {boolean}
         */
        isType: function (type, obj) {
            return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
        },

        isObjectEmpty: function (obj) {
            return this.getObjectPropertyLength(obj) === 0;
        },

        isObjectsEqual: function (obj1, obj2) {
            const p1 = this.getOwnPropertyNames(obj1); let i = p1.length; let prop;
            const p2 = this.getOwnPropertyNames(obj2);

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

        clickElement: function (element) {
            if (typeof element.click === 'function') {
                element.click();
            } else if (document.createEvent) {
                const eventObj = document.createEvent('MouseEvents');

                eventObj.initEvent('click', true, true);
                element.dispatchEvent(eventObj);
            }
        },

        getObjectPropertyLength: (function () {
            function ecma5(obj) {
                return Object.keys(obj).length;
            }

            function ecma3(obj) {
                let result = 0; let
                    prop;

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
                let prop;

                for (prop in obj) {
                    if (obj.hasOwnProperty(prop)) {
                        return prop;
                    }
                }
            }

            return Object.keys ? ecma5 : ecma3;
        }()),

        printObject: function (o) {
            let out = ''; let
                p;

            for (p in o) {
                if (o.hasOwnProperty(p)) {
                    out += p + ': ' + o[p] + '\n';
                }
            }

            return out;
        },

        getLocalStorage: function (key) {
            let result;
            const val = localStorage[key];

            if (val) {
                try {
                    result = JSON.parse(localStorage[key]);
                } catch (e) {
                    console.warn('Can not parse ' + key);
                }
            }

            return result;
        },
        setLocalStorage: function (key, val) {
            if (val !== undefined) {
                // undefined не stringify'ется в строку, а вернёт просто undefined,
                // который localStorage преобразует в строку "localStorage" и затем
                // не парсится и сохранять в localStorage undefined бессмысленно.
                localStorage[key] = JSON.stringify(val);
            }
        },
        removeLocalStorage: function (key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.warn('Can not remove localStorage item' + key + '. Set null');
                Utils.setLocalStorage(key, null);
            }
        },

        fallbackCopyTextToClipboard: function (text) {
            // https://stackoverflow.com/a/33928558/447249
            if (window.clipboardData && window.clipboardData.setData) {
                window.clipboardData.setData('Text', text);
            } else if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
                const textarea = document.createElement('textarea');

                textarea.textContent = text;
                textarea.style.position = 'fixed';  // Prevent scrolling to bottom of page in Microsoft Edge.
                document.body.appendChild(textarea);
                textarea.select();

                try {
                    document.execCommand('copy');  // Security exception may be thrown by some browsers.
                } catch (ex) {
                    console.error('Could not copy text using execCommand:' + ex.message);
                } finally {
                    document.body.removeChild(textarea);
                }
            }
        },

        copyTextToClipboard: function (text) {
            // navigator.clipboard only works if using https (for debugging in chrome://flags
            // set 'Insecure origins treated as secure')
            if (!navigator.clipboard) {
                this.fallbackCopyTextToClipboard(text);

                return;
            }

            navigator.clipboard.writeText(text).catch(error => {
                console.error('Could not copy text using navigator.clipboard:' + error);
            });
        },

        flashTooltip: function (target, text) {
            const element = $(target);
            const origTitle = element.attr('title');

            element.tooltip({ placement: 'right', trigger: 'manual' }).attr('data-original-title', text).tooltip('show');
            setTimeout(function () {
                element.tooltip('destroy');
                // Restore original title as it seems being cleared.
                element.attr('title', origTitle);
            }, 1000);
        },

        popupCenter: function (url, title, w, h) {
            // Fixes dual-screen position
            const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left;
            const dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top;

            const width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width; // eslint-disable-line max-len
            const height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height; // eslint-disable-line max-len

            const left = width / 2 - w / 2 + dualScreenLeft >> 0;
            const top = height / 2 - h / 2 + dualScreenTop >> 0;
            const newWindow = window.open(
                url,
                title,
                'menubar=no,toolbar=0,status=0,width=' + w + ',height=' + h + ',top=' + top + ',left=' + left
            );

            // Puts focus on the newWindow
            if (window.focus) {
                newWindow.focus();
            }

            return newWindow;
        },

        /**
         * Загружает изображение и по завешению загрузки вызывает callback
         *
         * @param {string} url
         * @param {Function} callback
         * @param {object} ctx
         * @param {*} callbackParam
         */
        loadImage: function (url, callback, ctx, callbackParam) {
            let loadImg = new Image();

            loadImg.onload = function (/*evt*/) {
                if (Utils.isType('function', callback)) {
                    callback.call(ctx, callbackParam);
                }

                loadImg = null;
            };
            loadImg.src = url;
        },

        //Парсинг url через ahref. Возвращает объект со свойствами как window.location
        parseUrl: (function () {
            const a = document.createElement('a');
            let ahrefProperties;
            let ahrefLen;

            a.href = location.href;

            if (a.hostname) {
                //Parse properties from href element http://stackoverflow.com/a/12470263/1309851
                ahrefProperties = ['href', 'protocol', 'host', 'hostname', 'port', 'origin', 'pathname', 'search', 'hash'];
                ahrefLen = ahrefProperties.length;

                return function (url, ahref) {
                    let i = ahrefLen;
                    const result = {};

                    if (!ahref) {
                        ahref = a;
                        ahref.href = url;
                    }

                    while (i--) {
                        result[ahrefProperties[i]] = ahref[ahrefProperties[i]];
                    }

                    if (!result.pathname) {
                        result.pathname = '/';
                    }

                    //console.dir(result);
                    return result;
                };
            }

            console.error('Can\'t parse url with ahref');
        }()),

        /**
         * Возвращает значение параметра из строки адреса, содержащей параметры, или переданной строки
         *
         * @param {string} name Имя параметра
         * @param {string} url Часть строки, начиная со знака ?
         * @returns {string | null}
         */
        getURLParameter: function (name, url) {
            return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(url || location.search) || [undefined, ''])[1].replace(/\+/g, '%20')) || null;
        },

        getURLParameters: (function () {
            const decode = decodeURIComponent;
            const regexpPlus = /\+/g;
            const replacePlus = '%20';
            const maxKeys = 100; // maxKeys <= 0 means that we should not limit keys count
            const sep = '&';
            const eq = '=';

            return function (url) {
                const queryStart = url.indexOf('?');
                const fragmentStart = url.indexOf('#');
                let query;
                let param;
                let len;
                let key; let val; let i;
                const result = {};

                if (queryStart > -1) {
                    query = url.substr(queryStart + 1, fragmentStart > -1 ? fragmentStart - queryStart - 1 : undefined);

                    if (query) {
                        query = query.split(sep);

                        len = query.length;

                        if (maxKeys > 0 && len > maxKeys) {
                            len = maxKeys;
                        }

                        for (i = 0; i < len; i++) {
                            //decodeURIComponent в определенных кейсах может сломаться, нужен try
                            try {
                                param = query[i].replace(regexpPlus, replacePlus).split(eq);
                                key = decode(param[0]);
                                val = param[1] ? decode(param[1]) : '';
                            } catch (e) {
                                continue;
                            }

                            if (!result.hasOwnProperty(key)) {
                                result[key] = val;
                            } else if (Array.isArray(result[key])) {
                                result[key].push(val);
                            } else {
                                result[key] = [result[key], val];
                            }
                        }
                    }
                }

                return result;
            };
        }()),

        urlReplaceParameterValue: function (url, param, value) {
            return url.replace(new RegExp('(' + param + '=).*?(&)'), '$1' + value + '$2');
        },

        randomString: (function () {
            'use strict';

            const charsAll = String('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz').split('');
            const charsLow = String('0123456789abcdefghijklmnopqrstuvwxyz').split('');

            return function (resultLen, lowOnly) {
                const chars = lowOnly ? charsLow : charsAll;
                const charsLen = chars.length;
                let str = '';

                if (!resultLen) {
                    resultLen = Math.random() * charsLen + 1 >> 0;
                }

                while (resultLen--) {
                    str += chars[Math.random() * charsLen >> 0];
                }

                return str;
            };
        }()),

        txtHtmlToPlain: function (txt, brShrink) {
            let result = txt;

            result = result.replace(/<br\s*[/]?>/gi, brShrink ? ' ' : '\n'); // Заменяем <br> на \n или ничего
            result = _s.stripTags(result); //Убираем обрамляющие тэги ahref
            result = _s.unescapeHTML(result); //Возвращаем эскейпленные

            return result;
        },

        cutStringByWord: function (text, n) {
            'use strict';

            const cut = text.lastIndexOf(' ', n);

            if (cut === -1) {
                return text.substr(0, n);
            }

            return text.substring(0, cut);
        },
        capitalizeFirst: function (str) {
            return str ? str[0].toUpperCase() + str.substr(1) : '';
        },

        /**
         *
         * @param {number} time Время в миллисекундах
         * @param {Function} update Колбэк, вызываемый каждую секунду. Передается параметр - секунд осталось
         * @param {Function} complete
         */
        timer: function timer(time, update, complete) {
            const start = Date.now();
            const interval = setInterval(function () {
                const now = time - (Date.now() - start);

                if (now <= 1) {
                    clearInterval(interval);

                    if (complete) {
                        complete();
                    }
                } else if (update) {
                    update(now / 1000 >> 0);
                }
            }, 200); // the smaller this number, the more accurate the timer will be
        },
        times: (function () {
            const times = {
                msDay: 864e5,
                msWeek: 6048e5,

                midnight: null, // Миллисекунды полуночи текущего дня
                midnightWeekAgo: null, // Миллисекунды полуночи семи дней назад
            };

            // Считаем переменные времен
            (function timesRecalc() {
                const dateMidnight = new Date();

                times.midnight = dateMidnight.setHours(0, 0, 0, 0);
                times.midnightWeekAgo = times.midnight - times.msWeek;

                // Планируем пересчет на первую миллисекунду следующего дня
                setTimeout(timesRecalc, times.midnight + times.msDay - Date.now() + 1);
            }());

            return times;
        }()),

        format: (function () {
            const dateFormat = (function () {
                const months = [
                    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
                ];
                const weekDays = [
                    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
                ];
                const weekDaysIn = [
                    'at sunday', 'at monday', 'at tuesday', 'at wednesday', 'at thursday', 'at friday', 'at saturday',
                ];

                function dMMYYYYhhmm(date) {
                    return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear() + ', ' + hhmm(date);
                }

                function hhmm(date) {
                    let hours = date.getHours();
                    const mintues = date.getMinutes();
                    let ext;

                    if (hours > 12) {
                        ext = 'PM';
                        hours -= 12;

                        if (hours < 10) {
                            hours = '0' + hours;
                        } else if (hours === 12) {
                            hours = '12';
                            ext = 'AM';
                        }
                    } else if (hours < 12) {
                        hours = hours < 10 ? '0' + hours : hours;
                        ext = 'AM';
                    } else if (hours === 12) {
                        ext = 'PM';
                    }

                    return hours + ':' + (mintues > 9 ? mintues : '0' + mintues) + ' ' + ext;
                }

                // Возвращает дату относительно переданной в формате "Сегодня в 12:15"
                function relative(date) {
                    const dateMs = date.getTime();
                    let result;

                    if (dateMs < Utils.times.midnightWeekAgo) {
                        result = dateFormat.dMMYYYYhhmm(date);
                    } else if (dateMs < Utils.times.midnight) {
                        if (dateMs < Utils.times.midnight - Utils.times.msDay) {
                            result = weekDays[date.getDay()] + ', ' + dateFormat.hhmm(date);
                        } else {
                            result = 'Yesterday at ' + dateFormat.hhmm(date);
                        }
                    } else {
                        result = 'Today at ' + dateFormat.hhmm(date);
                    }

                    return result;
                }

                function relativeIn(date) {
                    const dateMs = date.getTime();
                    let result;

                    if (dateMs < Utils.times.midnightWeekAgo) {
                        result = dateFormat.dMMYYYYhhmm(date);
                    } else if (dateMs < Utils.times.midnight) {
                        if (dateMs < Utils.times.midnight - Utils.times.msDay) {
                            result = weekDaysIn[date.getDay()] + ', ' + dateFormat.hhmm(date);
                        } else {
                            result = 'yesterday at ' + dateFormat.hhmm(date);
                        }
                    } else {
                        result = 'today at ' + dateFormat.hhmm(date);
                    }

                    return result;
                }

                return {
                    dMMYYYYhhmm: dMMYYYYhhmm,
                    hhmm: hhmm,
                    relative: relative,
                    relativeIn: relativeIn,
                };
            }());

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
                'use strict';

                if (secs < 60) {
                    return '0:' + (secs > 9 ? secs : '0' + secs);
                }

                const hours = secs / (60 * 60) >> 0;
                const divisor_for_minutes = secs % (60 * 60);
                const minutes = divisor_for_minutes / 60 >> 0;
                const divisor_for_seconds = divisor_for_minutes % 60;
                const seconds = Math.ceil(divisor_for_seconds);

                return (hours > 0 ? hours + ':' + (minutes > 9 ? minutes : '0' + minutes) : minutes) + ':' + (seconds > 9 ? seconds : '0' + seconds);
            }

            function formatPercentage(floatValue) {
                return (floatValue * 100).toFixed(2) + ' %';
            }

            //Разделяет число по тысячам переданной строкой(если не передана - пробелом)
            //http://stackoverflow.com/a/2901298/1309851
            //DEPRECATED. Use intl instead
            function numberByThousands(val, divider) {
                return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, divider || ' ');
            }

            const wordEndOfNumCases = [2, 0, 1, 1, 1, 2];

            function declOfNum(number, titles) {
                return titles[number % 100 > 4 && number % 100 < 20 ? 2 : wordEndOfNumCases[number % 10 < 5 ? number % 10 : 5]];
            }

            return {
                date: dateFormat,
                fileSize: formatFileSize,
                bitrate: formatBitrate,
                secondsToTime: secondsToTime,
                percentage: formatPercentage,
                numberByThousands: numberByThousands,
                wordEndOfNum: declOfNum,
            };
        }()),

        mousePageXY: function (e) {
            let x = 0; let y = 0; let
                et;

            if (!e) {
                e = window.event;
            }

            if (e.touches && e.touches.item && e.touches.item(0)) {
                et = e.touches.item(0);

                if (et.pageX || et.pageY) {
                    x = et.pageX;
                    y = et.pageY;
                } else if (et.clientX || et.clientY) {
                    x = et.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft; // eslint-disable-line max-len
                    y = et.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
                }
            } else if (e.pageX || e.pageY) {
                x = e.pageX;
                y = e.pageY;
            } else if (e.clientX || e.clientY) {
                x = e.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft) - document.documentElement.clientLeft;
                y = e.clientY + (document.documentElement.scrollTop || document.body.scrollTop) - document.documentElement.clientTop;
            }

            return { 'x': x, 'y': y };
        },

        /**
         * Caps Lock Detector 1.0
         *
         * @author Igor Tigirlas, last update 05.08.2005
         * @param {Event} evt
         */
        capsLockDetect: function (evt) {
            if (!evt) {
                evt = window.event || null;
            }

            if (!evt) {
                return;
            }

            const n = evt.keyCode || evt.charCode;
            let c;
            let cUC;
            let cLC;

            if (evt.type === 'keypress') {
                c = String.fromCharCode(n);
                cUC = c.toUpperCase();
                cLC = c.toLowerCase();

                if (cUC !== cLC) {
                    return evt.shiftKey && cLC === c || !evt.shiftKey && cUC === c;
                }
            } else if (evt.type === 'keydown' && n === 20) {
                return false;
            }
        },

        getElementComputedStyle: function (elem, prop) {
            if (typeof elem !== 'object') {
                elem = document.getElementById(elem);
            }

            // external stylesheet for Mozilla, Opera 7+ and Safari 1.3+
            if (document.defaultView && document.defaultView.getComputedStyle) {
                if (prop.match(/[A-Z]/)) {
                    prop = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                }

                return document.defaultView.getComputedStyle(elem, '').getPropertyValue(prop);
            }

            // external stylesheet for Explorer and Opera 9
            if (elem.currentStyle) {
                let i = prop.indexOf('-');

                while (i !== -1) {
                    prop = prop.substr(0, i) + prop.substr(i + 1, 1).toUpperCase() + prop.substr(i + 2);
                    i = prop.indexOf('-');
                }

                return elem.currentStyle[prop];
            }

            return '';
        },

        /**
         * @param {!HTMLElement} elem HTML Element.
         * @returns {{top: number, left: number}} Element's position related to the
         * window.
         */
        getOffset: function (elem) {
            return elem.getBoundingClientRect ? getOffsetRect(elem) : getOffsetSum(elem);
        },

        getDistance: function (x1, x2, y1, y2) {
            return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
        },

        /**
         * A complete cookies reader/writer framework with full unicode support.
         *
         * https://developer.mozilla.org/en-US/docs/DOM/document.cookie
         * This framework is released under the GNU Public License, version 3 or later.
         *
         * Syntaxes:
         *
         * docCookies.setItem(name, value[, end[, path[, domain[, secure]]]])
         * docCookies.getItem(name)
         * docCookies.removeItem(name[, path])
         * docCookies.hasItem(name)
         * docCookies.keys()
         */
        cookie: {
            getItem: function (sKey) {
                return unescape(document.cookie.replace(new RegExp('(?:(?:^|.*;)\\s*' + escape(sKey).replace(/[\-\.\+\*]/g, '\\$&') + '\\s*\\=\\s*([^;]*).*$)|^.*$'), '$1')) || null; //eslint-disable-line no-useless-escape
            },
            setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
                if (!sKey || /^(?:expires|max-age|path|domain|secure)$/i.test(sKey)) {
                    return false;
                }

                let sExpires = '';

                if (vEnd) {
                    switch (vEnd.constructor) {
                        case Number:
                            if (vEnd === Infinity) {
                                sExpires = '; expires=Fri, 31 Dec 9999 23:59:59 GMT';
                            } else {
                                sExpires = '; expires=' + new Date(Date.now() + vEnd * 1000).toUTCString() + '; max-age=' + vEnd;
                            }

                            break;
                        case String:
                            sExpires = '; expires=' + vEnd;
                            break;
                        case Date:
                            sExpires = '; expires=' + vEnd.toGMTString();
                            break;
                    }
                }

                document.cookie = escape(sKey) + '=' + escape(sValue) + sExpires + (sDomain ? '; domain=' + sDomain : '') + (sPath ? '; path=' + sPath : '') + (bSecure ? '; secure' : '');

                return true;
            },
            removeItem: function (sKey, sPath) {
                if (!sKey || !this.hasItem(sKey)) {
                    return false;
                }

                document.cookie = escape(sKey) + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT' + (sPath ? '; path=' + sPath : '');

                return true;
            },
            hasItem: function (sKey) {
                return new RegExp('(?:^|;\\s*)' + escape(sKey).replace(/[\-\.\+\*]/g, '\\$&') + '\\s*\\=').test(document.cookie); //eslint-disable-line no-useless-escape
            },
            keys: /* optional method: you can safely remove it! */ function () {
                //eslint-disable-next-line no-useless-escape
                const aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, '').split(/\s*(?:\=[^;]*)?;\s*/);
                let nIdx;

                for (nIdx = 0; nIdx < aKeys.length; nIdx++) {
                    aKeys[nIdx] = unescape(aKeys[nIdx]);
                }

                return aKeys;
            },
        },

        title: (function () {
            'use strict';

            let titlePostfix = '';
            let titlePre = '';
            let titleVal = '';
            let titlePost = '';

            function updateTitle() {
                document.title = titlePre + titleVal + titlePost + (titlePostfix ? ' - ' + titlePostfix : '');

                return document.title;
            }

            return {
                setPostfix: function (val) {
                    titlePostfix = val || '';
                },
                setTitle: function (options) {
                    titlePre = options.pre || titlePre;
                    titleVal = options.title || titleVal;
                    titlePost = options.post || titlePost;

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
                },
            };
        }()),

        math: (function () {
            'use strict';

            /**
             * Обрезание числа с плавающей запятой до указанного количества знаков после запятой
             * http://jsperf.com/math-round-vs-tofixed-with-decimals/2
             *
             * @param {number} number Число для обрезания
             * @param {number} precision Точность
             * @returns {number}
             */
            function toPrecision(number, precision) {
                const divider = Math.pow(10, precision || 6);

                return ~~(number * divider) / divider;
            }

            /**
             * Обрезание с округлением числа с плавающей запятой до указанного количества знаков после запятой
             *
             * @param {number} number Число
             * @param {number} precision Точность
             * @returns {number}
             */
            function toPrecisionRound(number, precision) {
                const divider = Math.pow(10, precision || 6);

                return Math.round(number * divider) / divider;
            }

            return {
                toPrecision: toPrecision,
                toPrecisionRound: toPrecisionRound,
                toPrecision6: function (number) {
                    return toPrecision(number, 6);
                },
                toPrecisionRound6: function (number) {
                    return toPrecisionRound(number, 6);
                },
            };
        }()),

        geo: (function () {
            'use strict';

            /**
             * Haversine formula to calculate the distance
             *
             * @param {number} lat1
             * @param {number} lon1
             * @param {number} lat2
             * @param {number} lon2
             * @returns {number}
             */
            function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
                const R = 6371; // Mean radius of the earth in km
                const dLat = deg2rad(lat2 - lat1); // deg2rad below
                const dLon = deg2rad(lon2 - lon1);
                // eslint-disable-next-line max-len
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const d = R * c; // Distance in km

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

            function spinLng(geo) {
                if (geo[0] < -180) {
                    geo[0] += 360;
                } else if (geo[0] > 180) {
                    geo[0] -= 360;
                }
            }

            function latlngToArr(ll, lngFirst) {
                return lngFirst ? [ll.lng, ll.lat] : [ll.lat, ll.lng];
            }

            //Проверка на валидность geo [lng, lat]
            function check(geo) {
                // eslint-disable-next-line max-len
                return Array.isArray(geo) && geo.length === 2 && (geo[0] || geo[1]) && geo[0] > -180 && geo[0] < 180 && geo[1] > -90 && geo[1] < 90;
            }

            //Проверка на валидность geo [lat, lng]
            function checkLatLng(geo) {
                // eslint-disable-next-line max-len
                return Array.isArray(geo) && geo.length === 2 && (geo[0] || geo[1]) && geo[1] > -180 && geo[1] < 180 && geo[0] > -90 && geo[0] < 90;
            }

            //Проверка на валидность bbox [leftlng, bottomlat, rightlng, toplat]
            function checkbbox(bbox) {
                // eslint-disable-next-line max-len
                return Array.isArray(bbox) && bbox.length === 4 && check([bbox[0], bbox[1]]) && check([bbox[2], bbox[3]]) && bbox[1] < bbox[3];
            }

            //Проверка на валидность bbox [bottomlat, leftlng, toplat, rightlng]
            function checkbboxLatLng(bbox) {
                // eslint-disable-next-line max-len
                return Array.isArray(bbox) && bbox.length === 4 && checkLatLng([bbox[0], bbox[1]]) && checkLatLng([bbox[2], bbox[3]]) && bbox[0] < bbox[2];
            }

            //Переставляет местами lat и lng в bbox
            function bboxReverse(bbox) {
                return [bbox[1], bbox[0], bbox[3], bbox[2]];
            }

            /**
             * @param {string} coordsString string with geo coordinates
             * @returns {(Array|undefined)} Coordinates as float numbers [latitude, longitude] or undef when a string has a bad format
             */
            function parseCoordinates(coordsString) {
                // Support wikipedia coordinates in ru.
                const n_pat = /с\.?\s?ш\.?/i;
                const s_pat = /ю\.?\s?ш\.?/i;
                const e_pat = /в\.?\s?д\.?/i;
                const w_pat = /з\.?\s?д\.?/i;

                coordsString = coordsString.replace(n_pat, 'N').replace(s_pat, 'S').replace(e_pat, 'E').replace(w_pat, 'W');

                try {
                    const coord = parsecoords(coordsString, 6);

                    return [coord.decimalLatitude, coord.decimalLongitude];
                } catch (err) {
                    return undefined;
                }
            }

            return {
                deg2rad: deg2rad,
                geoToPrecision: geoToPrecision,
                geoToPrecisionRound: geoToPrecisionRound,
                getDistanceFromLatLonInKm: getDistanceFromLatLonInKm,
                spinLng: spinLng,
                latlngToArr: latlngToArr,
                check: check,
                checkLatLng: checkLatLng,
                checkbbox: checkbbox,
                checkbboxLatLng: checkbboxLatLng,
                bboxReverse: bboxReverse,
                parseCoordinates: parseCoordinates,
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
                const r = parseInt(HTMLcolor.substring(0, 2), 16) / 255;
                const g = parseInt(HTMLcolor.substring(2, 4), 16) / 255;
                const b = parseInt(HTMLcolor.substring(4, 6), 16) / 255;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const d = max - min;
                let h;
                let s;
                const l = (max + min) / 2;

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

                return { h: h, s: s, l: l };
            },

            /**
             * Converts an HSL color value to RGB. Conversion formula
             * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
             * Assumes h, s, and l are contained in the set [0, 1] and
             * returns r, g, and b in the set [0, 255].
             */
            hslToRgb: function (h, s, l) {
                let r; let g; let b; let hue2rgb; let q; let
                    p;

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

                return { r: r * 255, g: g * 255, b: b * 255 };
            },

            /**
             * Converts an RGB color value to HSV. Conversion formula
             * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
             * Assumes HTMLcolor and
             * returns h, s, and v in the set [0, 1].
             */
            rgbToHsv: function (HTMLcolor) {
                const r = parseInt(HTMLcolor.substring(0, 2), 16) / 255;
                const g = parseInt(HTMLcolor.substring(2, 4), 16) / 255;
                const b = parseInt(HTMLcolor.substring(4, 6), 16) / 255;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const d = max - min;
                let h;
                const s = max === 0 ? 0 : d / max;

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
                let r; let g; let b;
                const i = h * 6 >> 0;
                const f = h * 6 - i;
                const p = v * (1 - s);
                const q = v * (1 - f * s);
                const t = v * (1 - (1 - f) * s);

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
            },
        },
    };


    /**
     * @param {!HTMLElement} elem HTML Element.
     * @returns {{top: number, left: number}} Element's position related to the
     * window using the offsets sum (obsolete way).
     */
    function getOffsetSum(elem) {
        let top = 0; let left = 0; const
            html = document.getElementsByTagName('html')[0];

        while (elem) {
            top = top + parseInt(elem.offsetTop, 10);
            left = left + parseInt(elem.offsetLeft, 10);
            elem = elem.offsetParent;
        }

        if (html) { // маргины html не учитываются при суммировании оффсетов
            top += parseInt(Utils.getElementComputedStyle(html, 'margin-top'), 10);
            left += parseInt(Utils.getElementComputedStyle(html, 'margin-left'), 10);
        }

        return { top: top, left: left };
    }

    /**
     * @param {!HTMLElement} elem HTML Element.
     * @returns {{top: number, left: number}} Element's position related to the
     * window using getBoundingClientRect (proper way).
     */
    function getOffsetRect(elem) {
        const box = elem.getBoundingClientRect();

        const body = document.body;
        const docElem = document.documentElement;

        const scrollTop = window.pageYOffset || docElem.scrollTop || body.scrollTop;

        const scrollLeft = window.pageXOffset || docElem.scrollLeft || body.scrollLeft;

        const clientTop = docElem.clientTop || body.clientTop || 0;
        const clientLeft = docElem.clientLeft || body.clientLeft || 0;

        const top = box.top + scrollTop - clientTop;
        const left = box.left + scrollLeft - clientLeft;

        return { top: Math.round(top), left: Math.round(left) };
    }

    return Utils;
});
