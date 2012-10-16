var fs = require('fs');
var Utils = new Object(null);

/**
 * ��������� �� ������������ ������� ���� (������ typeof)
 * @param {string} type ��� ����.��������� �������� (�� ������������):
 * Arguments, Array, Boolean, Date, Error, Function, JSON, Math, Number, Object, RegExp, String.
 * @param {Object} obj ����������� ������.
 * @return {boolean}
 */
Utils.isObjectType = function (type, obj) {
    return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
};

/**
 * ��������� ������
 * @param {Object} obj ����������� ������.
 * @return {Object}
 */
Utils.clone = function (obj) {
    if (obj == null || typeof(obj) != 'object') return obj;
    var temp = new obj.constructor();
    for (var key in obj) {
        temp[key] = Utils.clone(obj[key]);
    }
    return temp;
};

/**
 * �������� ��� �������� �� src � dst,
 * ������� ��, ��� � ������� ���������� src �� Object
 * @param {Object} dst
 * @param {Object} src
 * @param {boolean=} force Is replace existing dst values Default true.
 */

Utils.mixin = function (dst, src, force) {
    // tobj - ��������������� ������ ��� ���������� �������,
    // ������� ���� � ������� Object � ��� ���������
    var tobj = {};
    if (typeof force !== 'boolean') force = true;
    for (var x in src) {
        // �������� � dst �������� src, ����� ���, ������� ������������ �� Object
        if ((typeof tobj[x] == "undefined") || (tobj[x] != src[x])) {
            if (!force && typeof dst[x] !== "undefined") continue;
            dst[x] = src[x];
        }
    }
    return dst;
};

Utils.randomString = function (length) {
    'use strict';
    var chars = String('0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz').split(''),
        str = '',
        i;

    if (!length) {
        length = Math.floor(Math.random() * chars.length);
    }

    for (i = 0; i < length; i += 1) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    chars = i = null;
    return str;
};

Utils.time = {};
Utils.time.second = 1000;
Utils.time.minute = 60 * Utils.time.second;
Utils.time.hour = 60 * Utils.time.minute;
Utils.time.day = 24 * Utils.time.hour;
Utils.time.week = 7 * Utils.time.day;
Utils.time.month = 30.4368499 * Utils.time.day;
Utils.time.oneYear = 365 * Utils.time.day;


Utils.ComboCallback = function (callback) {
    this.callback = callback;
    this.items = 0;
    this.results = [];
};

Utils.ComboCallback.prototype.add = function () {
    var self = this;
    var itemId = this.items++;
    return function () {
        self.check(itemId, arguments);
    };
};

Utils.ComboCallback.prototype.check = function (id, arguments_in) {
    this.results[id] = arguments_in;
    this.items--;
    if (this.items == 0) {
        this.callback.call(this, this.results);
    }
};

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
    if (!num) num = 0;
    var str = '0' + num;
    return str.substr(str.length - 2, 2);
}

Utils.DURATION_TEMPLATE = {
    days: 'd',
    hours: 'h',
    minutes: 'min',
    seconds: 'sec'
};

/**
 * Cast duration to human format (ex. 3h 25m 35sec)
 * @param {number} duration Duration in seconds
 * @param {Object=} template Duration template
 * @return {string}
 */
Utils.formatDuration = function () {

    var SEC_IN_DAY = 24 * 60 * 60;
    var SEC_IN_HOUR = 60 * 60;
    var SEC_IN_MINUTE = 60;

    var addLeftZero = Utils.addLeftZero;

    return function formatDuration(duration, template) {

        var days = 0,
            hours = 0,
            minutes = 0,
            seconds = 0,
            res = [],
            template = template || Utils.DURATION_TEMPLATE;

        if (!duration) return '0' + template.seconds;

        duration = Math.round(duration);

        days = Math.floor(duration / SEC_IN_DAY);
        duration -= days * SEC_IN_DAY;

        hours = Math.floor(duration / SEC_IN_HOUR);
        duration -= hours * SEC_IN_HOUR;

        minutes = Math.floor(duration / SEC_IN_MINUTE);
        duration -= minutes * SEC_IN_MINUTE;

        seconds = duration;

        if (days) res.push(days + template.days);
        if (res.length || hours)   res.push(addLeftZero(hours) + template.hours);
        if (res.length || minutes) res.push(addLeftZero(minutes) + template.minutes);
        if (res.length || seconds) res.push(addLeftZero(seconds) + template.seconds);
        if (res.length === 0) return '0' + template.seconds;
        return res.join(' ');
    }
}();

/**
 * List on files in folder recursive (in parallel mode)
 * @param dir Folder to search files
 * @param done Callback function with params (err, resultArr)
 */
Utils.walkParallel = function (dir, done) {
    var results = [];
    fs.readdir(dir, function (err, list) {
        if (err) {
            return done(err);
        }
        var pending = list.length;
        if (!pending) {
            return done(null, results);
        }
        list.forEach(function (file) {
            file = dir + '/' + file;
            fs.stat(file, function (err, stat) {
                if (stat && stat.isDirectory()) {
                    Utils.walkParallel(file, function (err, res) {
                        results = results.concat(res);
                        if (!--pending) {
                            done(null, results);
                        }
                    });
                } else {
                    results.push(file);
                    if (!--pending) {
                        done(null, results);
                    }
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
            file = dir + '/' + file;
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
