/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const Utils = Object.create(null);
const _ = require('lodash');
const _s = require('underscore.string');
const useragent = require('useragent');
const DMP = require('diff-match-patch');
const turf = require('@turf/turf');
const ms = require('ms');

Utils.isEven = function (n) {
    return n % 2 === 0;
};
Utils.isOdd = function (n) {
    return Math.abs(n) % 2 === 1;
};

// Check user-gent for a match with the specified versions
// If such browser not specified - returns true
Utils.checkUserAgent = (function () {
    'use strict';

    const browserVerionsDefault = { badbrowserList: {}, polyfillFreelist: {} };

    return function (browserVerions) {
        const semver = require('semver');

        // Cache for checked user-agents, to parse a unique user-agent only once
        const cache = new (require('lru-cache'))({ max: 1500 });

        // If you are paranoid and always want your RegExp library to be up to date to match with agent,
        // this will async load the database from the https://raw.github.com/tobie/ua-parser/master/regexes.yaml
        // and compile it to a proper JavaScript supported format.
        // If it fails to compile or load it from the remote location it will just fall back silently to the shipped version.
        useragent(true);

        if (!browserVerions) {
            browserVerions = browserVerionsDefault;
        }

        const badbrowserList = browserVerions.badbrowserList;
        const polyfillFreelist = browserVerions.polyfillFreelist;

        return function (userAgent) {
            if (!userAgent) {
                return true;
            }

            let result = cache.peek(userAgent);

            if (result === undefined) {
                const agent = useragent.parse(userAgent);
                const family = agent.family;
                const version = Number(agent.major) || 0;

                // Check version match with semver, so we should have semver string guaranteed
                const versionString = `${version}.${Number(agent.minor) || 0}.${Number(agent.patch) || 0}`;

                // Check for bad browser
                const browser = badbrowserList[family];
                const isBadbrowser = browser ? semver.satisfies(versionString, browser) : false;

                result = {
                    agent,
                    version,
                    badbrowser: isBadbrowser,
                    polyfills: isBadbrowser ? {} : _.transform(polyfillFreelist, (result, browsers, polyfill) => {
                        const browser = browsers[family];

                        result[polyfill] = !browser || !semver.satisfies(versionString, browser);
                    }),
                };

                cache.set(userAgent, result);
            }

            return result;
        };
    };
}());

//Возвращает распарсенный агент
//Агенты некоторый соц.сетей:
//G+ 'Mozilla/5.0 (Windows NT 6.1; rv:6.0) Gecko/20110814 Firefox/6.0 Google (+)'
//FB 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
//VK 'Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)'
Utils.getMyAgentParsed = (function () {
    const cache = new (require('lru-cache'))({ max: 500 });

    return function (userAgent) {
        if (!userAgent) {
            return {};
        }

        let result = cache.peek(userAgent);

        if (result === undefined) {
            result = useragent.parse(userAgent);
            cache.set(userAgent, result);
        }

        return result;
    };
}());

/**
 * Проверяет на соответствие объекта типу (вместо typeof)
 *
 * @param {string} type Имя типа.
 * @param {object} obj Проверяемый объект.
 * @returns {boolean}
 */
Utils.isType = function (type, obj) {
    return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
};

/**
 * Checks if email is of valid format.
 *
 * @param {string} email
 * @returns {boolean}
 */
Utils.validateEmail = function (email) {
    const emailRegexp = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    return !!email.toLowerCase().match(emailRegexp);
};

/**
 * Checks if URI is of valid format.
 *
 * We use Diego Perini's validator retrieved from https://gist.github.com/dperini/729294,
 * MIT licensed, version 2018/09/12, see http://mathiasbynens.be/demo/url-regex for details.
 *
 * @param {string} uri
 * @returns {boolean}
 */
Utils.validateURI = function (uri) {
    const uriRegexp = /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i;

    return !!uri.match(uriRegexp);
};

/**
 * Проверяет что в объекте нет собственный свойств
 *
 * @param {object} obj Проверяемый объект.
 * @returns {boolean}
 */
Utils.isObjectEmpty = function (obj) {
    return this.getObjectPropertyLength(obj) === 0;
};

Utils.getObjectPropertyLength = function (obj) {
    return Object.keys(obj).length;
};

Utils.randomString = (function () {
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
}());

//Преобразование путей для express. http://stackoverflow.com/questions/16577396/express-optional-trailing-slash-for-top-level-path
// '/dev' - везьмет и со слешом в конце и без. Чтобы взял и дочерние, добавляем /:p?*, где p - переменная с дальнейшим путем в request
Utils.pathForExpress = function (paths) {
    let result;
    let i;
    const processPath = function (path) {
        if (path.substr(-2, 2) === '/*') {
            return path.substr(0, path.length - 1) + ':p?*';
        }

        return path;
    };

    if (!Array.isArray(paths)) {
        result = processPath(paths);
    } else {
        result = [];

        for (i = 0; i < paths.length; i++) {
            result.unshift(processPath(paths[i]));
        }
    }

    return result;
};

/**
 * Promise-memoize с опциональным временем жизни
 *
 * @param {Function} func Функция, возвращаемый promise которой будет запомнен
 * @param {number} ttl Время жизни в ms
 */
Utils.memoizePromise = function (func, ttl) {
    let memoizedPromise;

    function resetPromise() {
        memoizedPromise = func();

        if (typeof ttl === 'number' && ttl > 0) {
            setTimeout(() => {
                memoizedPromise = undefined;
            }, ttl);
        }

        return memoizedPromise;
    }

    return function () {
        return memoizedPromise || resetPromise();
    };
};

/**
 * Transforms a complex object (with nested objects) in a simple (flatten with one level).
 * Return new object
 *
 * example:
 *     flattenObject({
 *       a: {
 *         b: {
 *           c: 'test1',
 *           d: 'test2
 *         }
 *       },
 *       e: 1,
 *       d: null
 *     }); // ==>
 *
 *     {
 *       'a.b.c': 'test1',
 *       'a.b.d': 'test2',
 *       'e': 1,
 *       'd': null
 *     }
 *
 * @param {object} obj Object to transform
 * @param {object} [opts] Options
 * @param {Function} [opts.filter] Function of filtration nested objects.
 *                                 If specified and returns 'true', need to transform. If 'false' - no transformation
 * @param {string} [prefix]  Prefix, which will be putted before all keys
 * @param {object} [resultObj={}]  Объект, в который будут записываться преобразованные свойства.
 * @returns {object}
 */
Utils.flattenObject = (obj, opts, prefix, resultObj) => {
    'use strict';

    const filter = opts && opts.filter;

    prefix = prefix || '';
    resultObj = resultObj || Object.create(null);

    _.forOwn(obj, (val, key) => {
        if (_.isPlainObject(val) && (!filter || filter(val))) {
            Utils.flattenObject(val, opts, prefix + key + '.', resultObj);
        } else {
            resultObj[prefix + key] = val;
        }
    });

    return resultObj;
};

Utils.reflectKeys = function (obj) {
    return _.forOwn(obj, (value, key, object) => {
        object[key] = key;
    });
};


Utils.linkifyUrlString = function (text, target, className) {
    'use strict';

    target = target ? ` target="${target}"` : '';
    className = className ? ` class="${className}"` : '';

    const replaceLink = function (match, url, punctuation) {
        const append = punctuation || '';
        let linkText = url;

        if (/^www\./i.test(url)) {
            url = url.replace(/^www\./i, 'http://www.');
        }

        if (!Utils.validateURI(url)) {
            // Invalid URL, return original string.
            return match;
        }

        try {
            // Decode URI, e.g. to make http://ru.wikipedia.org/wiki/%D0%A1%D0%B5%D0%BA%D1%81 url readable.
            url = decodeURI(url);
            linkText = decodeURI(linkText);

            return `<a href="${url}" rel="nofollow noopener"${target}${className}>${linkText}</a>${append}`;
        } catch (err) {
            // Malformed URI sequence, return original string.
            return match;
        }
    };

    // Capture url starting with http://, https://, ftp:// or www, keep
    // trailing punctuation ([.!?()]) in a separate group, so we append it later.
    const simpleURLRegex = /\b((?:(?:https?|ftp):\/\/|www\.)[^'">\s]+\.[^'">\s]+?)([.,;!?)]?)(?=\s|$)/gmi;

    return text.replace(simpleURLRegex, replaceLink);
};

Utils.inputIncomingParse = (function () {
    'use strict';

    const host = config.client.host;
    const reversedEscapeChars = { '<': 'lt', '>': 'gt', '"': 'quot', '&': 'amp', "'": '#39' };
    const trailingChars = '\\s).,;>';

    function escape(txt) {
        //Паттерн из _s.escapeHTML(result); исключая амперсант
        return txt.replace(/[<>"']/g, m => `&${reversedEscapeChars[m]};`);
    }

    return function (txt) {
        let result = txt;

        result = _s.trim(result); //Обрезаем концы

        //Заменяем ссылку на фото на диез-ссылку #xxx
        //Например, http://domain.com/p/123456 -> #123456
        result = result.replace(new RegExp(`(\\b)(?:https?://)?(?:www.)?${host}/p/(\\d{1,8})/?(?=[${trailingChars}]|$)`, 'gi'), '$1#$2');
        // /p/123456 -> #123456
        result = result.replace(new RegExp(`(^|\\s|\\()/p/(\\d{1,8})/?(?=[${trailingChars}]|$)`, 'gi'), '$1#$2');

        //Все внутрипортальные ссылки оставляем без доменного имени, от корня
        //Например, http://domain.com/u/klimashkin/photo -> /u/klimashkin/photo
        result = result.replace(new RegExp(`(\\b)(?:https?://)?(?<=[^.|www.])${host}(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])`, 'gim'), '$1$2');

        // Replace links to protected/covered photos with regular link
        // For example, /_pr/a/b/c/abc.jpg -> /_p/a/b/c/abc.jpg
        result = result.replace(/\/_prn?\/([/a-z0-9]+\.(?:jpe?g|png))/gi, '/_p/$1');

        const plain = result;

        result = escape(result); //Эскейпим

        //Оборачиваем внутренние ссылкы в линк
        //Например, <a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>
        // eslint-disable-next-line prefer-regex-literals
        result = result.replace(new RegExp('(^|\\s|\\()(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1<a target="_blank" class="innerLink" href="$2">$2</a>');

        //Заменяем диез-ссылку фото #xxx на линк
        //Например, #123456 -> <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>
        result = result.replace(new RegExp(`(^|\\s|\\()#(\\d{1,8})(?=[${trailingChars}]|$)`, 'g'), '$1<a target="_blank" class="sharpPhoto" href="/p/$2">#$2</a>');

        result = Utils.linkifyUrlString(result, '_blank'); //Оборачиваем остальные url в ahref
        result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
        result = _s.clean(result); //Очищаем лишние пробелы

        return { result, plain };
    };
}());

Utils.txtHtmlToPlain = function (txt, brShrink) {
    'use strict';

    let result = txt;

    result = result.replace(/<br\s*[/]?>/gi, brShrink ? ' ' : '\n'); // Заменяем <br> на \n или ничего
    result = _s.stripTags(result); // Убираем обрамляющие тэги ahref
    result = _s.unescapeHTML(result); // Возвращаем эскейпленные

    return result;
};
Utils.txtdiff = (function () {
    'use strict';

    const dmp = new DMP.diff_match_patch();

    return function (text1, text2) {
        let result = '';
        const patternPara = /\n/g;
        const diffs = dmp.diff_main(text1, text2);
        let operationType;
        let text;

        dmp.diff_cleanupSemantic(diffs);

        for (let x = 0; x < diffs.length; x++) {
            operationType = diffs[x][0];    // Operation (insert, delete, equal)
            text = _s.escapeHTML(diffs[x][1]).replace(patternPara, '&para;<br>');

            switch (operationType) {
                case DMP.DIFF_INSERT:
                    result += '<span class="diffIns">' + text + '</span>';
                    break;
                case DMP.DIFF_DELETE:
                    result += '<span class="diffDel">' + text + '</span>';
                    break;
                default:
                    result += '<span class="diffEq">' + text + '</span>';
            }
        }

        return result;
    };
}());

Utils.calcGeoJSONPointsNum = function (arr) {
    'use strict';

    let result = 0;
    let i;

    if (Array.isArray(arr[0])) {
        for (i = arr.length; i--;) {
            result += Utils.calcGeoJSONPointsNum(arr[i]);
        }
    } else {
        result = 1;
    }

    return result;
};
Utils.calcGeoJSONPolygonsNum = function (geometry) {
    'use strict';

    let result;
    let res;
    let i;

    if (geometry.type === 'MultiPolygon') {
        result = { exterior: 0, interior: 0 };

        for (i = geometry.coordinates.length; i--;) {
            res = polyNum(geometry.coordinates[i]);
            result.exterior += res.exterior;
            result.interior += res.interior;
        }
    } else if (geometry.type === 'Polygon') {
        result = polyNum(geometry.coordinates);
    }

    function polyNum(polygons) {
        return { exterior: 1, interior: polygons.length - 1 };
    }

    return result;
};

Utils.calcGeoJSONPointsNumReduce = function (previousValue, currentValue) {
    'use strict';

    return previousValue + (Array.isArray(currentValue[0]) ? currentValue.reduce(Utils.calcGeoJSONPointsNumReduce, 0) : 1);
};

Utils.copyFile = (source, target) => new Promise((resolve, reject) => {
    'use strict';

    let isDone = false;
    const rd = fs.createReadStream(source);

    rd.on('error', err => {
        done(err);
    });

    const wr = fs.createWriteStream(target);

    wr.on('error', err => {
        done(err);
    });
    wr.on('close', () => {
        done();
    });

    rd.pipe(wr);

    function done(err) {
        if (isDone) {
            return;
        }

        isDone = true;

        if (err) {
            reject(err);
        } else {
            resolve();
        }
    }
});

// Находит свойства объекта a, значения которых не совпадают с такими свойствами объекта b
Utils.diff = function (a, b) {
    return _.transform(a, (result, val, key) => {
        if (!_.isEqual(val, b[key])) {
            result[key] = val;
        }
    }, {});
};

Utils.math = (function () {
    'use strict';

    const defDivider = 1e6;

    /**
     * Обрезание числа с плавающей запятой до указанного количества знаков после запятой
     * http://jsperf.com/math-round-vs-tofixed-with-decimals/2
     *
     * @param {number} number Число для обрезания
     * @param {number} [precision] Точность
     * @returns {number}
     */
    function toPrecision(number, precision) {
        const divider = precision ? Math.pow(10, precision) : defDivider;

        return ~~(number * divider) / divider;
    }

    /**
     * Обрезание с округлением числа с плавающей запятой до указанного количества знаков после запятой
     *
     * @param {number} number Число
     * @param {number} [precision] Точность
     * @returns {number}
     */
    function toPrecisionRound(number, precision) {
        const divider = precision ? Math.pow(10, precision) : defDivider;

        return Math.round(number * divider) / divider;
    }

    return {
        toPrecision,
        toPrecisionRound,
        toPrecision6(number) {
            return toPrecision(number, 6);
        },
        toPrecisionRound6(number) {
            return toPrecisionRound(number, 6);
        },
    };
}());

Utils.geo = (function () {
    'use strict';

    //Рассчитывает цетр тяжести полигона. Без учета внутренних выколотых полигонов(дыр)
    //На вход подаётся массив точек [lng, lat]
    //http://stackoverflow.com/a/10129983/1309851
    function polyCentroid(points) {
        const pointsLen = points.length;
        let i = 0; let j = pointsLen - 1;
        let f;
        let x = 0; let y = 0;
        let area = 0;
        let p1; let
            p2;

        for (i; i < pointsLen; j = i++) {
            p1 = points[i];
            p2 = points[j];
            f = p1[1] * p2[0] - p2[1] * p1[0];
            y += (p1[1] + p2[1]) * f;
            x += (p1[0] + p2[0]) * f;

            area += p1[1] * p2[0];
            area -= p1[0] * p2[1];
        }

        area /= 2;
        f = area * 6;

        return [x / f, y / f];
    }

    /**
     * Get polygon area
     * TODO: sphere, now we just move coordinates by 180 for lng and 90 for lat
     *
     * @param {object[]} points Path (array) of points ([[lng, lat]])
     * @param {boolean} [signed] If true function returns the signed area of the polygon (negative if path points are clockwise)
     * @returns {number}
     */
    function polyArea(points, signed) {
        let area = 0;
        const isSigned = signed || false;

        if (!_.isEqual(_.head(points), _.last(points))) {
            points = points.concat(points[0]);
        }

        for (let i = 0, l = points.length; i < l; i++) {
            area += (points[i][0] + 180) * (points[i + 1][1] + 90) - (points[i][1] + 90) * (points[i + 1][0] + 180);
        }

        if (!isSigned) {
            area = Math.abs(area);
        }

        return area / 2;
    }

    function sortPolygonSegmentsByArea(a, b) {
        const areaA = Utils.geo.polyArea(a);
        const areaB = Utils.geo.polyArea(b);

        return areaA > areaB ? 1 : areaA < areaB ? -1 : 0;
    }

    // Compute BBOX of polygon/multipolygon.
    // By the first line of the closed polygon, because it must be exterior ring for the followings
    // The input is polygon geometry object {type, coordinates}
    // Return [WestLng, SouthLat, EastLng, NorthLat]
    function polyBBOX(geometry) {
        let i; let resultbbox; let polybbox; let
            multipolycoords;

        if (geometry.type === 'Polygon') {
            resultbbox = getbbox(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            i = geometry.coordinates.length;
            multipolycoords = [];

            while (i--) {
                polybbox = getbbox(geometry.coordinates[i][0]);

                multipolycoords.push([polybbox[0], polybbox[1]]); // SouthWest
                multipolycoords.push([polybbox[2], polybbox[1]]); // NorthWest
                multipolycoords.push([polybbox[2], polybbox[3]]); // NorthEast
                multipolycoords.push([polybbox[0], polybbox[3]]); // SouthEast
            }

            multipolycoords.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
            multipolycoords.push(multipolycoords[0]);
            resultbbox = getbbox(multipolycoords);
        }

        function getbbox(points) {
            const pointsLen = points.length;
            let i = 0; let j = pointsLen - 1;
            let x1 = points[j][0]; let x2;
            const y1 = points[j][1]; let y2;
            let p1; let p2;

            if (x1 === -180) {
                x1 = 180;
            }

            const bbox = [x1, y1, x1, y1];

            for (i; i < pointsLen - 1; j = i++) {
                p1 = points[j]; //prev
                x1 = p1[0];
                p2 = points[i]; //current
                x2 = p2[0];
                y2 = p2[1];

                if (x1 === -180) {
                    x1 = 180;
                }

                if (x2 === -180) {
                    x2 = 180;
                }

                if (Math.abs(x2 - x1) <= 180) {
                    if (x2 > x1 && x2 > bbox[2] && Math.abs(x2 - bbox[2]) <= 180) {
                        bbox[2] = x2;
                    } else if (x2 < x1 && x2 < bbox[0] && Math.abs(x2 - bbox[0]) <= 180) {
                        bbox[0] = x2;
                    }
                } else if (x2 < 0 && x1 > 0 && (x2 > bbox[2] || bbox[2] > 0)) {
                    bbox[2] = x2;
                } else if (x2 > 0 && x1 < 0 && (x2 < bbox[0] || bbox[0] < 0)) {
                    bbox[0] = x2;
                }

                if (y2 < bbox[1]) {
                    bbox[1] = y2;
                } else if (y2 > bbox[3]) {
                    bbox[3] = y2;
                }
            }

            return bbox;
        }

        return resultbbox;
    }

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
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km

        return d;
    }

    /**
     * Degrees to radians
     *
     * @param {number} deg
     * @returns {number}
     */
    function deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    /**
     * Radians to meters (assuming a spherical Earth)
     *
     * @param {number} rad
     * @returns {number}
     */
    function rad2meter(rad) {
        return turf.radiansToLength(rad, 'metres');
    }

    function geoToPrecision(geo, precision) {
        _.forEach(geo, (item, index, array) => {
            array[index] = Utils.math.toPrecision(item, precision || 6);
        });

        return geo;
    }

    function geoToPrecisionRound(geo, precision) {
        _.forEach(geo, (item, index, array) => {
            array[index] = Utils.math.toPrecisionRound(item, precision || 6);
        });

        return geo;
    }

    /**
     * Normalize coordinates.
     *
     * This spins longtitude if required and makes sure latitude is not out of
     * EPSG:4326 permitted range.
     *
     * @param {Array} geo coordiante pair [lng, lat]
     */
    function normalizeCoordinates(geo) {
        // Spin longtitude.
        if (geo[0] < -180) {
            geo[0] += 360;
        } else if (geo[0] > 180) {
            geo[0] -= 360;
        }

        // Limit latitude.
        geo[1] = Math.min(geo[1], 89.999999);
        geo[1] = Math.max(geo[1], -89.999999);
    }

    function latlngToArr(ll, lngFirst) {
        return lngFirst ? [ll.lng, ll.lat] : [ll.lat, ll.lng];
    }

    //Проверка на валидность geo [lng, lat]
    function check(geo) {
        return Array.isArray(geo) && geo.length === 2 && (geo[0] || geo[1]) && geo[0] > -180 && geo[0] < 180 && geo[1] > -90 && geo[1] < 90;
    }

    //Проверка на валидность geo [lat, lng]
    function checkLatLng(geo) {
        return Array.isArray(geo) && geo.length === 2 && (geo[0] || geo[1]) && geo[1] > -180 && geo[1] < 180 && geo[0] > -90 && geo[0] < 90;
    }

    //Проверка на валидность bbox [leftlng, bottomlat, rightlng, toplat]
    function checkbbox(bbox) {
        return Array.isArray(bbox) && bbox.length === 4 && check([bbox[0], bbox[1]]) && check([bbox[2], bbox[3]]) && bbox[1] < bbox[3];
    }

    //Проверка на валидность bbox [bottomlat, leftlng, toplat, rightlng]
    const checkbboxLatLng = bbox =>
        Array.isArray(bbox) && bbox.length === 4 && checkLatLng([bbox[0], bbox[1]]) && checkLatLng([bbox[2], bbox[3]]) && bbox[0] < bbox[2];


    //Переставляет местами lat и lng в bbox
    function bboxReverse(bbox) {
        return [bbox[1], bbox[0], bbox[3], bbox[2]];
    }

    /**
     * Computes GeoJSON Poligon from bbox.
     *
     * @param {Array} bbox
     * @returns {object} polygon GeoJSON Polygon geometry object
     */
    function bboxPoly(bbox) {
        return turf.bboxPolygon(bbox).geometry;
    }

    /**
     * Compensate map distortion in polygon geometry object used in geospacial
     * query.
     *
     * This function adds more points along latitude at each degree to compensate
     * distortion of mapping a flat object to a spherical surface.
     * Works with box and L-shape single-ringed polygons that are used to request object on
     * the map after moving and zooming actions.
     *
     * @param {object} polygon GeoJSON Polygon geometry object
     * @returns {object}
     */
    function polygonFixMapDistortion(polygon) {
        const coords = [];

        turf.segmentEach(turf.feature(polygon), currentSegment => {
            // Push first coordinate.
            coords.push(currentSegment.geometry.coordinates[0]);

            if (currentSegment.geometry.coordinates[0][1] === currentSegment.geometry.coordinates[1][1]) {
                // Horisontal line, add more points at each degree to compensate map distortion.
                let lon = currentSegment.geometry.coordinates[0][0];
                const deduct = currentSegment.geometry.coordinates[0][0] > currentSegment.geometry.coordinates[1][0];
                let diff = Math.trunc(Math.abs(currentSegment.geometry.coordinates[0][0] - currentSegment.geometry.coordinates[1][0]));

                while (diff > 1) {
                    lon = deduct ? lon - 1 : lon + 1;
                    coords.push([lon, currentSegment.geometry.coordinates[0][1]]);
                    diff--;
                }
            }
            // No need to push last coordinate, it is the same as first at
            // next segment. If there is no new segment, turf.lineToPolygon
            // will autocomplete ring to first coodrinate by default.
        });

        return turf.getGeom(turf.lineToPolygon(turf.lineString(coords)));
    }

    return {
        deg2rad,
        rad2meter,
        geoToPrecision,
        geoToPrecisionRound,
        getDistanceFromLatLonInKm,
        polyCentroid,
        polyBBOX,
        polyArea,
        sortPolygonSegmentsByArea,
        normalizeCoordinates,
        latlngToArr,
        check,
        checkLatLng,
        checkbbox,
        checkbboxLatLng,
        bboxReverse,
        bboxPoly,
        polygonFixMapDistortion,
    };
}());

/**
 * Adds left zero to number and rteturn string in format xx (01, 23 etc)
 *
 * @param {number} num Number to process
 * @returns {string}
 */
Utils.addLeftZero = function (num) {
    if (!num) {
        num = 0;
    }

    const str = '0' + num;

    return str.substr(str.length - 2, 2);
};

Utils.isThisYear = function (date) {
    return new Date(date).getFullYear() === new Date().getFullYear();
};

Utils.isYesterday = function (date) {
    return date >= new Date().setHours(0, 0, 0, 0) - ms('1d') && date < new Date().setHours(0, 0, 0, 0);
};

Utils.isToday = function (date) {
    return date >= new Date().setHours(0, 0, 0, 0) && date < new Date().setHours(0, 0, 0, 0) + ms('1d');
};

Utils.hh_mm_ss = function (millisec, utc = false) {
    if (!_.isDate(millisec)) {
        millisec = new Date(millisec);
    }

    const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    if (utc) {
        options.timeZone = 'UTC';
    }

    return millisec.toLocaleTimeString([], options);
};

Utils.format = (function () {
    'use strict';

    function formatFileSize(bytes) {
        if (typeof bytes !== 'number') {
            return '';
        }

        if (bytes >= 1000000000) {
            return (bytes / 1000000000).toFixed(2) + 'GB';
        }

        if (bytes >= 1000000) {
            return (bytes / 1000000).toFixed(2) + 'MB';
        }

        return (bytes / 1000).toFixed(2) + 'KB';
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
        if (secs < 60) {
            return '0:' + (secs > 9 ? secs : '0' + secs);
        }

        const hours = secs / (60 * 60) >> 0;
        const divisorForMinutes = secs % (60 * 60);
        const minutes = divisorForMinutes / 60 >> 0;
        const divisorForSeconds = divisorForMinutes % 60;
        const seconds = Math.ceil(divisorForSeconds);

        return (hours > 0 ? hours + ':' + (minutes > 9 ? minutes : '0' + minutes) : minutes) + ':' + (seconds > 9 ? seconds : '0' + seconds);
    }

    function formatPercentage(floatValue) {
        return (floatValue * 100).toFixed(2) + ' %';
    }

    const wordEndOfNumCases = [2, 0, 1, 1, 1, 2];

    function declOfNum(number, titles) {
        return titles[number % 100 > 4 && number % 100 < 20 ? 2 : wordEndOfNumCases[number % 10 < 5 ? number % 10 : 5]];
    }

    return {
        fileSize: formatFileSize,
        bitrate: formatBitrate,
        secondsToTime,
        percentage: formatPercentage,
        wordEndOfNum: declOfNum,
    };
}());

Utils.filesListProcess = function filesListProcess(files, dirCutOff, prefixAdd, filter) {
    'use strict';

    let result = [];
    let file;
    const dirCutOffLen = dirCutOff && dirCutOff.length;
    let i = files.length;

    while (i--) {
        file = files[i];

        if (dirCutOffLen && file.indexOf(dirCutOff) === 0) {
            file = file.substr(dirCutOffLen);
        }

        if (prefixAdd) {
            file = prefixAdd + file;
        }

        result.unshift(file);
    }

    if (filter) {
        result = result.filter(filter);
    }

    return result;
};

/**
 * List on files in folder recursive (in parallel mode)
 *
 * @param {object} obj
 * @param {string} obj.dir Folder to search files
 * @param {boolean} obj.noDir
 * @param {string[]} obj.excludeFolders
 * @param {Function} obj.onDone
 */
Utils.walkParallel = function ({ dir, noDir, excludeFolders, onDone }) {
    const checkDirsExcluding = Array.isArray(excludeFolders) && excludeFolders.length;
    let results = [];

    fs.readdir(dir, (err, list) => {
        if (err) {
            return onDone(err);
        }

        let pending = list.length;
        const checkEnd = function () {
            if (!--pending) {
                onDone(null, results);
            }
        };

        if (!pending) {
            return onDone(null, results);
        }

        list.forEach(file => {
            const fileFull = path.join(dir, file);

            fs.stat(fileFull, (err, stat) => {
                if (stat && stat.isDirectory()) {
                    if (checkDirsExcluding && ~excludeFolders.indexOf(file)) {
                        checkEnd();
                    } else {
                        Utils.walkParallel({ dir: fileFull, noDir, excludeFolders, onDone: (err, res) => {
                            results = results.concat(res);
                            checkEnd();
                        } });
                    }
                } else {
                    results.push((noDir ? file : fileFull).split(path.sep).join('/'));
                    checkEnd();
                }
            });
        });
    });
};

/**
 * List on files in folder recursive (in serial mode)
 *
 * @param {string} dir Folder to search files
 * @param {Function} done Callback function with params (err, resultArr)
 */
Utils.walkSerial = function (dir, done) {
    let results = [];

    fs.readdir(dir, (err, list) => {
        if (err) {
            return done(err);
        }

        let i = 0;

        (function next() {
            let file = list[i++];

            if (!file) {
                return done(null, results);
            }

            file = path.join(dir, file);
            fs.stat(file, (err, stat) => {
                if (stat && stat.isDirectory()) {
                    Utils.walkSerial(file, (err, res) => {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        }());
    });
};

/**
 * Example walkParallel
 */
/*walkParallel({dir: './public/style', onDone: function(err, results) {
 if (err) {
 throw err;
 }
 console.log(results);
 }});*/

Object.freeze(Utils);
module.exports = Utils;
