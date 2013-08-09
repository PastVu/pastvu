var fs = require('fs'),
	Utils = new Object(null),
	_ = require('lodash'),
	_s = require('underscore.string');

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

Utils.randomString = (function () {
	'use strict';
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


/**
 * Асинхронный memoize с опциональным временем жизни
 * @param memoizedFunc Функция, результат которой будет запомнен
 * @param ttl Время жизни в ms
 * @returns {Function}
 */
Utils.memoizeAsync = function (memoizedFunc, ttl) {
	'use strict';

	var cache,
		waitings = []; //Массив коллбеков, которые будут наполняться пока функция работает и вызванны, после её завершения

	function memoizeHandler() {
		cache = arguments;
		for (var i = waitings.length; i--;) {
			waitings[i].apply(null, arguments);
		}
		waitings = [];
		if (ttl) {
			setTimeout(function () {
				cache = undefined;
			}, ttl);
		}
	}

	return function (cb) {
		if (cache !== undefined) {
			cb.apply(null, cache);
		} else {
			if (!waitings.length) {
				memoizedFunc(memoizeHandler);
			}
			waitings.push(cb);
		}
	};
};

Utils.linkifyUrlString = function (inputText, target, className) {
	var replacedText, replacePattern1, replacePattern2;

	target = target ? ' target="' + target + '"' : '';
	className = className ? ' class="' + className + '"' : '';

	//URLs starting with http://, https://, or ftp://
	replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9А-Я+&@#\/%?=~_|!:,.;]*[-A-Z0-9А-Я+&@#\/%=~_|])/gim;
	replacedText = inputText.replace(replacePattern1, '<a href="$1"' + target + className + '>$1</a>');

	//URLs starting with "www." (without // before it, or it'd re-link the ones done above).
	replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
	replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2"' + target + className + '>$2</a>');

	return replacedText;
};
Utils.inputIncomingParse = (function () {
	var host = global.appVar && global.appVar.serverAddr && global.appVar.serverAddr.host || '',
		reversedEscapeChars = {"<": "lt", ">": "gt", "\"": "quot", "&": "amp", "'": "#39"};

	function escape(txt) {
		//Паттерн из _s.escapeHTML(result); исключая амперсант
		return txt.replace(/[<>"']/g, function (m) {
			return '&' + reversedEscapeChars[m] + ';';
		});
	}

	return function (txt) {
		var result = txt;

		result = _s.trim(result); //Обрезаем концы
		result = decodeURI(result); //Декодируем возможные закодированные ссылки, вставленные из строки адреса браузера, содержащие не аски символы
		result = escape(result); //Эскейпим

		//Заменяем ссылку на фото на диез-ссылку #xxx
		//Например, http://domain.com/p/123456 -> #123456
		result = result.replace(new RegExp('(\\b)(?:https?://)?(?:www.)?' + host + '/p/(\\d{1,8})/?(?=[\\s\\)\\.,;>]|$)', 'gi'), '$1#$2');

		//Восстанавливаем внтуреннюю ссылку чтобы на следующей операции обернуть её в линк
		//Например, /u/klimashkin/photo -> http://domain.com/u/klimashkin/photo
		result = result.replace(new RegExp('(^|\\s|\\()(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1' + host + '$2');

		//Все ссылки на адреса внутри портала оставляем без доменного имени, от корня, и оборачиваем в линк
		//Например, http://domain.com/u/klimashkin/photo -> /u/klimashkin/photo
		result = result.replace(new RegExp('(\\b)(?:https?://)?(?:www.)?' + host + '(/[-A-Z0-9+&@#\\/%?=~_|!:,.;]*[-A-Z0-9+&@#\\/%=~_|])', 'gim'), '$1<a target="_blank" class="innerLink" href="$2">$2</a>');

		//Заменяем диез-ссылку фото #xxx на линк
		//Например, #123456 -> <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>
		result = result.replace(/(^|\s|\()#(\d{1,8})(?=[\s\)\.\,]|$)/g, '$1<a target="_blank" class="sharpPhoto" href="/p/$2">#$2</a>');

		result = Utils.linkifyUrlString(result, '_blank'); //Оборачиваем остальные url в ahref
		result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
		result = _s.clean(result); //Очищаем лишние пробелы
		return result;
	};
}());

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

//Экстракт данных из курсора MongoDB-native
Utils.cursorExtract = function (err, cursor) {
	if (err || !cursor) {
		this(err || {message: 'Create cursor error', error: true});
		return;
	}
	cursor.toArray(this);
};
//Экстракт всех входящих параметров-курсоров MongoDB-native
Utils.cursorsExtract = function cursorsExtract(err) {
	if (err) {
		this({message: err && err.message, error: true});
		return;
	}

	for (var i = 1; i < arguments.length; i++) {
		arguments[i].toArray(this.parallel());
	}
};

//Проверка на валидность geo [lng, lat]
Utils.geoCheck = function (geo) {
	return Array.isArray(geo) && geo.length === 2 && (geo[0] || geo[1]) && geo[0] > -180 && geo[0] < 180 && geo[1] > -90 && geo[1] < 90;
};

//Находит свойства объекта a, значения которых не совпадают с такими свойствами объекта b
Utils.diff = function (a, b) {
	var res = {},
		i;
	for (i in a) {
		if (a[i] !== undefined && !_.isEqual(a[i], b[i])) {
			res[i] = a[i];
		}
	}
	return res;
};

Utils.math = (function () {
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
}());

Utils.geo = (function () {
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

	return {
		getDistanceFromLatLonInKm: getDistanceFromLatLonInKm,
		deg2rad: deg2rad,
		geoToPrecision: geoToPrecision,
		geoToPrecisionRound: geoToPrecisionRound
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
