var fs = require('fs');
var path = require('path');
var Utils = Object.create(null);
var _ = require('lodash');
var _s = require('underscore.string');
var useragent = require('useragent');
var DMP = require('./diff_match_patch.js');

Utils.isEven = function (n) {
    return n % 2 === 0;
};
Utils.isOdd = function (n) {
    return Math.abs(n) % 2 === 1;
};

//Проверяет user-agent на совпадение с передаными разрешенными версиями
//Если такого браузера нет в списке проверок, возвращается true
Utils.checkUserAgent = (function () {
    var browserAcceptFromVerionDefault = { 'IE': '>=9.0.0' };

    return function (browserAcceptFromVerion) {
        var semver = require('semver'),
            cache = require('lru-cache')({ max: 1500 }); //Кэш для строк проверенных юзер-агентов, чтобы парсить уникальный юзер-агент только раз

        if (!browserAcceptFromVerion) {
            browserAcceptFromVerion = browserAcceptFromVerionDefault;
        }

        //If you are paranoid and always want your RegExp library to be up to date to match with agent,
        //this will async load the database from the https://raw.github.com/tobie/ua-parser/master/regexes.yaml
        //and compile it to a proper JavaScript supported format.
        //If it fails to compile or load it from the remote location it will just fall back silently to the shipped version.
        useragent(true);

        return function (userAgent) {
            var agent, acceptVersion, result;

            if (!userAgent) {
                return true;
            }

            result = cache.peek(userAgent);
            if (result === undefined) {
                agent = useragent.parse(userAgent);
                acceptVersion = browserAcceptFromVerion[agent.family];

                result = {
                    agent: agent,
                    accept: acceptVersion === undefined || semver.satisfies((Number(agent.major) || 0) + '.' + (Number(agent.minor) || 0) + '.' + (Number(agent.patch) || 0), acceptVersion)
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
    var cache = require('lru-cache')({ max: 500 });

    return function (userAgent) {
        if (!userAgent) {
            return {};
        }

        var result = cache.peek(userAgent);
        if (result === undefined) {
            result = useragent.parse(userAgent);
            cache.set(userAgent, result);
        }
        return result;
    };
}());

/**
 * Проверяет на соответствие объекта типу (вместо typeof)
 * @param {string} type Имя типа.
 * @param {Object} obj Проверяемый объект.
 * @return {boolean}
 */
Utils.isType = function (type, obj) {
    return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
};

/**
 * Проверяет что в объекте нет собственный свойств
 * @param {Object} obj Проверяемый объект.
 * @return {boolean}
 */
Utils.isObjectEmpty = function (obj) {
    return this.getObjectPropertyLength(obj) === 0;
};

Utils.getObjectPropertyLength = function (obj) {
    return Object.keys(obj).length;
};

Utils.dummyFn = function () {
};

Utils.randomString = (function () {
    var charsAll = String('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz').split(''),
        charsLow = String('0123456789abcdefghijklmnopqrstuvwxyz').split('');

    return function (resultLen, lowOnly) {
        var chars = lowOnly ? charsLow : charsAll,
            charsLen = chars.length,
            str = '';

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
    var result,
        i,
        processPath = function (path) {
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
 * Асинхронный memoize с опциональным временем жизни
 * @param memoizedFunc Функция, результат которой будет запомнен
 * @param ttl Время жизни в ms
 * @returns {Function}
 */
Utils.memoizeAsync = function (memoizedFunc, ttl) {
    var cache;
    var waitings = []; // Массив коллбеков, которые будут наполняться пока функция работает и вызванны, после её завершения

    function memoizeHandler() {
        cache = arguments;
        for (var i = waitings.length; i--;) {
            waitings[i].apply(null, arguments);
        }
        waitings = [];
        if (typeof ttl === 'number' && ttl > 0) {
            setTimeout(function () {
                cache = undefined;
            }, ttl);
        }
    }

    return function (cb) {
        if (cache !== undefined) {
            cb.apply(null, cache);
        } else {
            // Сначала кладем, а потом проверяем на то что положили первый,
            // чтобы корректно вызвалось, когда memoizedFunc выполнится мгновенно
            waitings.push(cb);
            if (waitings.length === 1) {
                memoizedFunc(memoizeHandler);
            }
        }
    };
};

/**
 * Promise-memoize с опциональным временем жизни
 * @param func Функция, возвращаемый promise которой будет запомнен
 * @param ttl Время жизни в ms
 */
Utils.memoizePromise = function (func, ttl) {
    var memoizedPromise;

    function resetPromise() {
        memoizedPromise = func();

        if (typeof ttl === 'number' && ttl > 0) {
            setTimeout(function () {
                memoizedPromise = undefined;
            }, ttl);
        }

        return memoizedPromise;
    }

    return function () {
        return memoizedPromise || resetPromise();
    };
};

Utils.linkifyMailString = function (inputText, className) {
    var replacedText, replacePattern;
    className = className ? ' class="' + className + '"' : '';

    //Change email addresses to mailto:: links.
    replacePattern = /(\w+@[a-zA-Z_]+?\.[a-zA-Z]{2,6})/gim;
    replacedText = replacedText.replace(replacePattern, '<a href="mailto:$1"' + className + '>$1</a>');

    return replacedText;
};

Utils.linkifyUrlString = function (text, target, className) {
    var replacePattern, matches, url, i;

    target = target ? ' target="' + target + '"' : '';
    className = className ? ' class="' + className + '"' : '';

    //Используем match и вручную перебираем все совпадающие ссылки, чтобы декодировать их с decodeURI,
    //на случай, если ссылка, содержащая не аски символы, вставлена из строки браузера, вида http://ru.wikipedia.org/wiki/%D0%A1%D0%B5%D0%BA%D1%81
    //Массив совпадений делаем уникальными (uniq)

    //Starting with http://, https://, or ftp://
    replacePattern = /(\b(https?|ftp):\/\/[-A-Z0-9А-Я+&@#\/%?=~_|!:,.;]*[-A-Z0-9А-Я+&@#\/%=~_|])/gim;
    matches = _.uniq(text.match(replacePattern));
    for (i = 0; i < matches.length; i++) {
        url = decodeURI(matches[i]);
        text = text.replace(matches[i], '<a href="' + url + '" rel="nofollow"' + target + className + '>' + url + '<\/a>');
    }

    //Starting with "www." (without // before it, or it'd re-link the ones done above).
    replacePattern = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
    matches = _.uniq(text.match(replacePattern));
    for (i = 0; i < matches.length; i++) {
        matches[i] = _s.trim(matches[i]); //Так как в результат match попадут и переносы и пробелы (^|[^\/]), то надо их удалить
        url = decodeURI(matches[i]);
        text = text.replace(matches[i], '<a href="http:\/\/' + url + '" rel="nofollow"' + target + className + '>' + url + '<\/a>');
    }

    return text;
};
Utils.inputIncomingParse = (function () {
    var host = global.appVar && global.appVar.serverAddr && global.appVar.serverAddr.host || '',
        reversedEscapeChars = { "<": "lt", ">": "gt", "\"": "quot", "&": "amp", "'": "#39" };

    function escape(txt) {
        //Паттерн из _s.escapeHTML(result); исключая амперсант
        return txt.replace(/[<>"']/g, function (m) {
            return '&' + reversedEscapeChars[m] + ';';
        });
    }

    return function (txt) {
        var result = txt,
            plain;

        result = _s.trim(result); //Обрезаем концы

        //Заменяем ссылку на фото на диез-ссылку #xxx
        //Например, http://domain.com/p/123456 -> #123456
        result = result.replace(new RegExp('(\\b)(?:https?://)?(?:www.)?' + host + '/p/(\\d{1,8})/?(?=[\\s\\)\\.,;>]|$)', 'gi'), '$1#$2');

        //Все внутрипортальные ссылки оставляем без доменного имени, от корня
        //Например, http://domain.com/u/klimashkin/photo -> /u/klimashkin/photo
        result = result.replace(new RegExp('(\\b)(?:https?://)?(?:www.)?' + host + '(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1$2');

        plain = result;

        result = escape(result); //Эскейпим

        //Оборачиваем внутренние ссылкы в линк
        //Например, <a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>
        result = result.replace(new RegExp('(^|\\s|\\()(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1<a target="_blank" class="innerLink" href="$2">$2</a>');

        //Заменяем диез-ссылку фото #xxx на линк
        //Например, #123456 -> <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>
        result = result.replace(/(^|\s|\()#(\d{1,8})(?=[\s\)\.\,]|$)/g, '$1<a target="_blank" class="sharpPhoto" href="/p/$2">#$2</a>');

        result = Utils.linkifyUrlString(result, '_blank'); //Оборачиваем остальные url в ahref
        result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
        result = _s.clean(result); //Очищаем лишние пробелы

        return { result: result, plain: plain };
    };
}());
Utils.txtHtmlToPlain = function (txt) {
    'use strict';
    var result = txt;

    result = result.replace(/<br\s*[\/]?>/gi, '\n'); //Заменяем <br> на \n
    result = _s.stripTags(result); //Убираем обрамляющие тэги ahref
    result = _s.unescapeHTML(result); //Возвращаем эскейпленные
    return result;
};
Utils.txtdiff = (function () {
    'use strict';
    var dmp = new DMP.diff_match_patch();

    return function (text1, text2) {
        var result = '',
            pattern_para = /\n/g,
            diffs = dmp.diff_main(text1, text2),
            operationType,
            text;

        dmp.diff_cleanupSemantic(diffs);

        for (var x = 0; x < diffs.length; x++) {
            operationType = diffs[x][0];    // Operation (insert, delete, equal)
            text = _s.escapeHTML(diffs[x][1]).replace(pattern_para, '&para;<br>');
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
    var result = 0,
        i;

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
    var result,
        res,
        i;

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

Utils.copyFile = function (source, target, cb) {
    'use strict';
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function (err) {
        done(err);
    });

    var wr = fs.createWriteStream(target);
    wr.on("error", function (err) {
        done(err);
    });
    wr.on("close", function (ex) {
        done();
    });

    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
};

//Экстракт данных из курсора MongoDB-native
Utils.cursorExtract = function (err, cursor) {
    if (err || !cursor) {
        this(err || { message: 'Create cursor error', error: true });
        return;
    }
    cursor.toArray(this);
};
//Экстракт всех входящих параметров-курсоров MongoDB-native
Utils.cursorsExtract = function cursorsExtract(err) {
    if (err) {
        this({ message: err && err.message, error: true });
        return;
    }

    for (var i = 1; i < arguments.length; i++) {
        arguments[i].toArray(this.parallel());
    }
};

// Находит свойства объекта a, значения которых не совпадают с такими свойствами объекта b
Utils.diff = function (a, b) {
    return _.transform(a, function (result, val, key) {
        if (!_.isEqual(val, b[key])) {
            result[key] = val;
        }
    }, {});
};

Utils.math = (function () {
    'use strict';

    var defDivider = 1e6;

    /**
     * Обрезание числа с плавающей запятой до указанного количества знаков после запятой
     * http://jsperf.com/math-round-vs-tofixed-with-decimals/2
     * @param {number} number Число для обрезания
     * @param {number} [precision] Точность
     * @return {number}
     */
    function toPrecision(number, precision) {
        var divider = precision ? Math.pow(10, precision) : defDivider;
        return ~~(number * divider) / divider;
    }

    /**
     * Обрезание с округлением числа с плавающей запятой до указанного количества знаков после запятой
     * @param {number} number Число
     * @param {number} [precision] Точность
     * @return {number}
     */
    function toPrecisionRound(number, precision) {
        var divider = precision ? Math.pow(10, precision) : defDivider;
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
        }
    };
}());

Utils.geo = (function () {
    'use strict';

    //Рассчитывает цетр тяжести полигона. Без учета внутренних выколотых полигонов(дыр)
    //На вход подаётся массив точек [lng, lat]
    //http://stackoverflow.com/a/10129983/1309851
    function polyCentroid(points) {
        var pointsLen = points.length,
            i = 0, j = pointsLen - 1,
            f,
            x = 0, y = 0,
            area = 0,
            p1, p2;

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

    //Рассчитывает BBOX полигона/мультиполигона. По первой замкнутой линии полигона, т.к. она должна быть exterior ring для следующих
    //На вход подаётся объект geometry полигона
    //Возвращает [WestLng, SouthLat, EastLng, NorthLat]
    function polyBBOX(geometry) {
        var i, resultbbox, polybbox, multipolycoords;

        if (geometry.type === 'Polygon') {
            resultbbox = getbbox(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            i = geometry.coordinates.length;
            multipolycoords = [];

            while (i--) {
                polybbox = getbbox(geometry.coordinates[i][0]);

                multipolycoords.push([polybbox[0], polybbox[1]]); //SouthWest
                multipolycoords.push([polybbox[2], polybbox[1]]); //NorthWest
                multipolycoords.push([polybbox[2], polybbox[3]]); //NorthEast
                multipolycoords.push([polybbox[0], polybbox[3]]); //SouthEast
            }
            multipolycoords.sort(function (a, b) {
                return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
            });
            multipolycoords.push(multipolycoords[0]);
            resultbbox = getbbox(multipolycoords);
        }

        function getbbox(points) {
            var pointsLen = points.length,
                i = 0, j = pointsLen - 1,
                x1 = points[j][0], x2,
                y1 = points[j][1], y2,
                p1, p2,
                bbox;

            if (x1 === -180) {
                x1 = 180;
            }
            bbox = [x1, y1, x1, y1];

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
                } else {
                    if (x2 < 0 && x1 > 0 && (x2 > bbox[2] || bbox[2] > 0)) {
                        bbox[2] = x2;
                    } else if (x2 > 0 && x1 < 0 && (x2 < bbox[0] || bbox[0] < 0)) {
                        bbox[0] = x2;
                    }
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
    function checkbboxLatLng(bbox) {
        return Array.isArray(bbox) && bbox.length === 4 && checkLatLng([bbox[0], bbox[1]]) && checkLatLng([bbox[2], bbox[3]]) && bbox[0] < bbox[2];
    }

    //Переставляет местами lat и lng в bbox
    function bboxReverse(bbox) {
        return [bbox[1], bbox[0], bbox[3], bbox[2]];
    }

    return {
        deg2rad: deg2rad,
        geoToPrecision: geoToPrecision,
        geoToPrecisionRound: geoToPrecisionRound,
        getDistanceFromLatLonInKm: getDistanceFromLatLonInKm,
        polyCentroid: polyCentroid,
        polyBBOX: polyBBOX,
        spinLng: spinLng,
        latlngToArr: latlngToArr,
        check: check,
        checkLatLng: checkLatLng,
        checkbbox: checkbbox,
        checkbboxLatLng: checkbboxLatLng,
        bboxReverse: bboxReverse
    };
}());

Utils.presentDateStart = function () {
    var present_date = new Date();
    present_date.setHours(0);
    present_date.setMinutes(0);
    present_date.setSeconds(0);
    present_date.setMilliseconds(0);
    return present_date;
};

Utils.tomorrowDateStart = function () {
    var date = Utils.presentDateStart();
    date.setDate(date.getDate() + 1);
    return date;
};

/**
 * Adds left zero to number and rteturn string in format xx (01, 23 etc)
 * @param {number} num
 * @return {string}
 */
Utils.addLeftZero = function (num) {
    if (!num) {
        num = 0;
    }
    var str = '0' + num;
    return str.substr(str.length - 2, 2);
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

    var wordEndOfNumCases = [2, 0, 1, 1, 1, 2];

    function declOfNum(number, titles) {
        return titles[(number % 100 > 4 && number % 100 < 20) ? 2 : wordEndOfNumCases[(number % 10 < 5) ? number % 10 : 5]];
    }

    return {
        fileSize: formatFileSize,
        bitrate: formatBitrate,
        secondsToTime: secondsToTime,
        percentage: formatPercentage,
        wordEndOfNum: declOfNum
    };
}());

Utils.filesListProcess = function filesRecursive(files, dirCutOff, prefixAdd, filter) {
    'use strict';

    var result = [],
        file,
        dirCutOffLen = dirCutOff && dirCutOff.length,
        i = files.length;

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
 * @param dir Folder to search files
 */
Utils.walkParallel = function (dir/*, noDir, excludeFolders, done*/) {
    var done = arguments[arguments.length - 1],
        noDir = arguments.length > 2 && arguments[1],
        excludeFolders = arguments.length > 3 && arguments[2],
        checkDirsExcluding = Array.isArray(excludeFolders) && excludeFolders.length,
        results = [];

    fs.readdir(dir, function (err, list) {
        if (err) {
            return done(err);
        }
        var pending = list.length,
            checkEnd = function () {
                if (!--pending) {
                    done(null, results);
                }
            };

        if (!pending) {
            return done(null, results);
        }

        list.forEach(function (file) {
            var fileFull = path.join(dir, file);

            fs.stat(fileFull, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    if (checkDirsExcluding && ~excludeFolders.indexOf(file)) {
                        checkEnd();
                    } else {
                        Utils.walkParallel(fileFull, noDir, excludeFolders, function (err, res) {
                            results = results.concat(res);
                            checkEnd();
                        });
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
 * @param dir Folder to search files
 * @param done Callback function with params (err, resultArr)
 */
Utils.walkSerial = function (dir, done) {
    var results = [];
    fs.readdir(dir, function (err, list) {
        if (err) {
            return done(err);
        }
        var i = 0;
        (function next() {
            var file = list[i++];
            if (!file) {
                return done(null, results);
            }
            file = path.join(dir, file);
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    Utils.walkSerial(file, function (err, res) {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(file);
                    next();
                }
            });
        })();
    });
};

/**
 * Example walkParallel
 */
/*walkParallel('./public/style', function(err, results) {
 if (err) {
 throw err;
 }
 console.log(results);
 });*/

Object.freeze(Utils);
module.exports = Utils;