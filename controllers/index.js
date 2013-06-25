'use strict';

var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	Comment,
	News,
	ms = require('ms'), // Tiny milisecond conversion utility
	moment = require('moment'),
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	log4js = require('log4js'),
	appvar,
	appEnv = {},

	dayStart, //Время начала дня
	weekStart; //Время начала недели

(function periodStartCalc() {
	dayStart = moment().startOf('day').toDate();
	weekStart = moment().startOf('week').toDate();
	//На начало следующего дня планируем пересчет
	setTimeout(periodStartCalc, moment().add('d', 1).startOf('day').diff(moment()) + 1000);
}());

/**
 * Параметры
 */
var giveGlobeParams = (function () {

	return function (hs, cb) {
		var params = {
			client: hs.address,
			server: appEnv.serverAddr,
			appHash: appEnv.hash,
			appVersion: appEnv.version
		};
		step(
			function () {
				Settings.collection.find({}, {_id: 0, key: 1, val: 1}, this);
			},
			Utils.cursorExtract,
			function (err, settings) {
				var i = settings.length;
				while (i--) {
					params[settings[i].key] = settings[i].val;
				}
				cb(params);
			}
		);
	};
}());

//Рейтинги
var giveRatings = (function () {
	var limit = 10; //Ограничиваем кол-во результатов по каждому показателю

	//Так как после выборки объектов по вхождению в массив ключей ($in) порядок сортировки не гарантируется,
	//то перед отдачей сортируем массивы по требуемому показателю
	function sortCcount(a, b) {
		return b.ccount - a.ccount;
	}

	function sortPcount(a, b) {
		return b.pcount - a.pcount;
	}

	return function (data, cb) {
		var st = Date.now(),
			pcommdayHash = {},
			pcommweekHash = {},
			ucommdayHash = {},
			ucommweekHash = {},
			updayHash = {},
			upweekHash = {};

		if (!Utils.isType('object', data)) {
			cb({message: 'Bad params', error: true});
			return;
		}

		step(
			//Сначала запускаем агрегацию по всем показателем, требующим расчет
			function aggregation() {
				Comment.collection.aggregate([
					{$match: {stamp: {$gt: dayStart}}},
					{$group: {_id: '$photo', ccount: {$sum: 1}}},
					{$sort: {ccount: -1}},
					{$limit: limit}
				], this.parallel());
				Comment.collection.aggregate([
					{$match: {stamp: {$gt: weekStart}}},
					{$group: {_id: '$photo', ccount: {$sum: 1}}},
					{$sort: {ccount: -1}},
					{$limit: limit}
				], this.parallel());
				Comment.collection.aggregate([
					{$match: {stamp: {$gt: dayStart}}},
					{$group: {_id: '$user', ccount: {$sum: 1}}},
					{$sort: {ccount: -1}},
					{$limit: limit}
				], this.parallel());
				Comment.collection.aggregate([
					{$match: {stamp: {$gt: weekStart}}},
					{$group: {_id: '$user', ccount: {$sum: 1}}},
					{$sort: {ccount: -1}},
					{$limit: limit}
				], this.parallel());
				Photo.collection.aggregate([
					{$match: {adate: {$gt: dayStart}, disabled: {$exists: false}, del: {$exists: false}}},
					{$group: {_id: '$user', pcount: {$sum: 1}}},
					{$sort: {pcount: -1}},
					{$limit: limit}
				], this.parallel());
				Photo.collection.aggregate([
					{$match: {adate: {$gt: weekStart}, disabled: {$exists: false}, del: {$exists: false}}},
					{$group: {_id: '$user', pcount: {$sum: 1}}},
					{$sort: {pcount: -1}},
					{$limit: limit}
				], this.parallel());
			},
			function getAggregationResultObjects(err, pcday, pcweek, ucday, ucweek, upday, upweek) {
				if (err) {
					cb({message: err && err.message, error: true});
					return;
				}
				var i,
					pcdayarr = [],
					pcweekarr = [],
					ucdayarr = [],
					ucweekarr = [],
					updayarr = [],
					upweekarr = [];

				// Photo by views
				Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, vdcount: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, vdcount: 1}, {limit: limit, sort: [
					['vdcount', 'desc']
				]}, this.parallel());
				Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, vwcount: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, vwcount: 1}, {limit: limit, sort: [
					['vwcount', 'desc']
				]}, this.parallel());
				Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, vcount: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, vcount: 1}, {limit: limit, sort: [
					['vcount', 'desc']
				]}, this.parallel());

				// Photo by comments
				for (i = pcday.length; i--;) {
					pcommdayHash[pcday[i]._id] = pcday[i].ccount;
					pcdayarr.push(pcday[i]._id);
				}
				Photo.collection.find({_id: {$in: pcdayarr}, fresh: {$exists: false}, del: {$exists: false}}, {_id: 1, cid: 1, file: 1, title: 1, ccount: 1}, this.parallel());
				for (i = pcweek.length; i--;) {
					pcommweekHash[pcweek[i]._id] = pcweek[i].ccount;
					pcweekarr.push(pcweek[i]._id);
				}
				Photo.collection.find({_id: {$in: pcweekarr}, fresh: {$exists: false}, del: {$exists: false}}, {_id: 1, cid: 1, file: 1, title: 1, ccount: 1}, this.parallel());
				Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}}, {_id: 0, cid: 1, file: 1, title: 1, ccount: 1}, {limit: limit, sort: [
					['ccount', 'desc']
				]}, this.parallel());

				// User by comments
				for (i = ucday.length; i--;) {
					ucommdayHash[ucday[i]._id] = ucday[i].ccount;
					ucdayarr.push(ucday[i]._id);
				}
				User.collection.find({_id: {$in: ucdayarr}}, {_id: 1, login: 1, avatar: 1, firstName: 1, lastName: 1, ccount: 1}, this.parallel());
				for (i = ucweek.length; i--;) {
					ucommweekHash[ucweek[i]._id] = ucweek[i].ccount;
					ucweekarr.push(ucweek[i]._id);
				}
				User.collection.find({_id: {$in: ucweekarr}}, {_id: 1, login: 1, avatar: 1, firstName: 1, lastName: 1, ccount: 1}, this.parallel());
				User.collection.find({ccount: {$gt: 0}}, {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1, ccount: 1}, {limit: limit, sort: [
					['ccount', 'desc']
				]}, this.parallel());

				// User by photos
				for (i = upday.length; i--;) {
					updayHash[upday[i]._id] = upday[i].pcount;
					updayarr.push(upday[i]._id);
				}
				User.collection.find({_id: {$in: updayarr}}, {_id: 1, login: 1, avatar: 1, firstName: 1, lastName: 1, pcount: 1}, this.parallel());
				for (i = upweek.length; i--;) {
					upweekHash[upweek[i]._id] = upweek[i].pcount;
					upweekarr.push(upweek[i]._id);
				}
				User.collection.find({_id: {$in: upweekarr}}, {_id: 1, login: 1, avatar: 1, firstName: 1, lastName: 1, pcount: 1}, this.parallel());
				User.collection.find({pcount: {$gt: 0}}, {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1, pcount: 1}, {limit: limit, sort: [
					['pcount', 'desc']
				]}, this.parallel());
			},
			Utils.cursorsExtract,
			function (err, pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall, upday, upweek, upall) {
				if (err) {
					cb({message: err && err.message, error: true});
					return;
				}
				var i;

				for (i = pcday.length; i--;) {
					pcday[i].ccount = pcommdayHash[pcday[i]._id];
				}
				for (i = pcweek.length; i--;) {
					pcweek[i].ccount = pcommweekHash[pcweek[i]._id];
				}

				for (i = ucday.length; i--;) {
					ucday[i].ccount = ucommdayHash[ucday[i]._id];
				}
				for (i = ucweek.length; i--;) {
					ucweek[i].ccount = ucommweekHash[ucweek[i]._id];
				}

				for (i = upday.length; i--;) {
					upday[i].pcount = updayHash[upday[i]._id];
				}
				for (i = upweek.length; i--;) {
					upweek[i].pcount = upweekHash[upweek[i]._id];
				}

				//console.log(Date.now() - st);
				cb({pday: pday || [], pweek: pweek || [], pall: pall || [], pcday: pcday.sort(sortCcount), pcweek: pcweek.sort(sortCcount), pcall: pcall, ucday: ucday.sort(sortCcount), ucweek: ucweek.sort(sortCcount), ucall: ucall, upday: upday.sort(sortPcount), upweek: upweek.sort(sortPcount), upall: upall});
			}
		);
	};
}());

/**
 * Статистика
 */
var giveStats = (function () {
	var ttl = ms('5m'), //Время жизни кэша
		cache,
		waitings = []; //Массив коллбеков, которые будут наполняться пока функция работает и вызванны, после её завершения

	function memoize(data, cb) {
		if (cache !== undefined) {
			cb(cache);
		} else {
			if (waitings.length === 0) {
				calcStats(data, function (data) {
					cache = data;
					for (var i = waitings.length; i--;) {
						waitings[i](cache);
					}
					waitings = [];
					setTimeout(function () {
						cache = undefined;
					}, ttl);
				});
			}
			waitings.push(cb);
		}
	}

	function calcStats(data, cb) {
		var st = Date.now(),
			photoYear;

		if (!Utils.isType('object', data)) {
			cb({message: 'Bad params', error: true});
			return;
		}

		step(
			//Сначала запускаем агрегацию по всем показателем, требующим расчет
			function aggregation() {
				Photo.collection.aggregate([
					{$match: {fresh: {$exists: false}, disabled: {$exists: false}, del: {$exists: false}}},
					{$group: {_id: '$year', count: {$sum: 1}}},
					{$sort: {count: -1}},
					{$group: {
						_id: null,
						popYear: {$first: '$_id'},
						popYearCount: {$first: '$count'},
						unpopYear: {$last: '$_id'},
						unpopYearCount: {$last: '$count'}
					}},
					{$project: {
						_id: 0,
						pop: {year: "$popYear", count: "$popYearCount" },
						unpop: {year: "$unpopYear", count: "$unpopYearCount" }
					}}
				], this.parallel());
			},
			function getAggregationResultObjects(err, pMaxYear) {
				if (err) {
					cb({message: err && err.message, error: true});
					return;
				}
				photoYear = pMaxYear[0];

				Photo.count({fresh: {$exists: false}, disabled: {$exists: false}, del: {$exists: false}}, this.parallel());
				User.count({active: true}, this.parallel());

				Photo.count({adate: {$gt: dayStart}, disabled: {$exists: false}, del: {$exists: false}}, this.parallel());
				Photo.count({adate: {$gt: weekStart}, disabled: {$exists: false}, del: {$exists: false}}, this.parallel());
			},
			function (err, pallCount, userCount, pdayCount, pweekCount) {
				if (err) {
					cb({message: err && err.message, error: true});
					return;
				}
				console.log(Date.now() - st);
				cb({all: {pallCount: pallCount || 0, userCount: userCount || 0, photoYear: photoYear, pdayCount: pdayCount || 0, pweekCount: pweekCount || 0}});
			}
		);
	}

	return memoize;
}());

/**
 * Новости
 */
function giveIndexNews(hs, cb) {
	step(
		function () {
			var now = new Date();
			News.collection.find({pdate: {$lte: now}/*, tdate: {$gt: now}*/}, {_id: 0, user: 0, cdate: 0, tdate: 0}, {limit: 3, sort: [
				['pdate', 'desc']
			]}, this);
		},
		Utils.cursorExtract,
		function (err, news) {
			if (err) {
				cb({message: err && err.message, error: true});
				return;
			}
			cb({news: news});
		}
	);
}
/**
 * Новости
 */
function giveAllNews(hs, cb) {
	step(
		function () {
			var now = new Date();
			News.collection.find({pdate: {$lte: now}}, {_id: 0, user: 0, cdate: 0}, {sort: [
				['pdate', 'desc']
			]}, this);
		},
		Utils.cursorExtract,
		function (err, news) {
			if (err) {
				cb({message: err && err.message, error: true});
				return;
			}
			cb({news: news});
		}
	);
}

function giveNewsFull(data, cb) {
	if (!Utils.isType('object', data) || !Utils.isType('number', data.cid)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	step(
		function () {
			News.collection.findOne({cid: data.cid}, {_id: 0}, this);
		},
		function (err, news) {
			if (err) {
				cb({message: err && err.message, error: true});
				return;
			}
			cb({news: news});
		}
	);
}
function giveNewsPublic(data, cb) {
	if (!Utils.isType('object', data) || !Utils.isType('number', data.cid)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	step(
		function () {
			News.findOne({cid: data.cid}, {_id: 0, cid: 1, user: 1, pdate: 1, title: 1, txt: 1, ccount: 1}).populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, firstName: 1, lastName: 1}}).exec(this);
		},
		function (err, news) {
			if (err) {
				cb({message: err && err.message, error: true});
				return;
			}
			cb({news: news});
		}
	);
}

module.exports.loadController = function (app, db, io) {
	var logger = log4js.getLogger("index.js");
	appvar = app;
	appEnv = app.get('appEnv');

	Settings = db.model('Settings');
	User = db.model('User');
	Photo = db.model('Photo');
	Comment = db.model('Comment');
	News = db.model('News');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveGlobeParams', function () {
			giveGlobeParams(hs, function (resultData) {
				socket.emit('takeGlobeParams', resultData);
			});
		});

		socket.on('giveIndexNews', function (data) {
			giveIndexNews(hs, function (resultData) {
				socket.emit('takeIndexNews', resultData);
			});
		});
		socket.on('giveAllNews', function (data) {
			giveAllNews(hs, function (resultData) {
				socket.emit('takeAllNews', resultData);
			});
		});
		socket.on('giveNews', function (data) {
			giveNewsFull(data, function (resultData) {
				socket.emit('takeNews', resultData);
			});
		});
		socket.on('giveNewsPublic', function (data) {
			giveNewsPublic(data, function (resultData) {
				socket.emit('takeNewsPublic', resultData);
			});
		});

		socket.on('giveRatings', function (data) {
			giveRatings(data, function (resultData) {
				socket.emit('takeRatings', resultData);
			});
		});

		socket.on('giveStats', function (data) {
			giveStats(data, function (resultData) {
				socket.emit('takeStats', resultData);
			});
		});
	});
};