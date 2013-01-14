var fs = require('fs');
var Utils = new Object(null);

/**
 * Проверяет на соответствие объекта типу (вместо typeof)
 * @param {string} type Имя типа.
 * @param {Object} obj Проверяемый объект.
 * @return {boolean}
 */
Utils.isType = function (type, obj) {
    return Object.prototype.toString.call(obj).slice(8, -1).toUpperCase() === type.toUpperCase();
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

Utils.filesRecursive = function filesRecursive(files, prefix, excludeFolders, filter) {
    'use strict';
    var result = [];

    Object.keys(files).forEach(function (element, index, array) {
        if (Utils.isType('object', files[element])) {
            if (!Utils.isType('array', excludeFolders) || (Utils.isType('array', excludeFolders) && excludeFolders.indexOf(element) === -1)) {
                Array.prototype.push.apply(result, filesRecursive(files[element], prefix + element + '/', excludeFolders, filter));
            }
        } else {
            result.push(prefix + element);
        }
    });

    if (filter) {
        result = result.filter(filter);
    }

    return result;
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
