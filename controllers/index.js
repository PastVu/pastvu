'use strict';

var auth = require('./auth.js'),
	_session = require('./_session.js'),
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
	commentController = require('./comment.js'),

	dayStart, //Время начала дня
	weekStart; //Время начала недели

(function periodStartCalc() {
	dayStart = moment().startOf('day').toDate();
	weekStart = moment().startOf('week').toDate();
	//На начало следующего дня планируем пересчет
	setTimeout(periodStartCalc, moment().add('d', 1).startOf('day').diff(moment()) + 1000);
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

	return Utils.memoizeAsync(function (handler) {
		var //st = Date.now(),
			pcommdayHash = {},
			pcommweekHash = {},
			ucommdayHash = {},
			ucommweekHash = {},
			updayHash = {},
			upweekHash = {};


		step(
			//Сначала запускаем агрегацию по всем показателем, требующим расчет
			function aggregation() {
				Comment.collection.aggregate([
					{$match: {stamp: {$gt: dayStart}}},
					{$group: {_id: '$obj', ccount: {$sum: 1}}},
					{$sort: {ccount: -1}},
					{$limit: limit}
				], this.parallel());
				Comment.collection.aggregate([
					{$match: {stamp: {$gt: weekStart}}},
					{$group: {_id: '$obj', ccount: {$sum: 1}}},
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
					return handler({message: err && err.message, error: true});
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
				User.collection.find({_id: {$in: ucdayarr}}, {_id: 1, login: 1, avatar: 1, disp: 1, ccount: 1}, this.parallel());
				for (i = ucweek.length; i--;) {
					ucommweekHash[ucweek[i]._id] = ucweek[i].ccount;
					ucweekarr.push(ucweek[i]._id);
				}
				User.collection.find({_id: {$in: ucweekarr}}, {_id: 1, login: 1, avatar: 1, disp: 1, ccount: 1}, this.parallel());
				User.collection.find({ccount: {$gt: 0}}, {_id: 0, login: 1, avatar: 1, disp: 1, ccount: 1}, {limit: limit, sort: [
					['ccount', 'desc']
				]}, this.parallel());

				// User by photos
				for (i = upday.length; i--;) {
					updayHash[upday[i]._id] = upday[i].pcount;
					updayarr.push(upday[i]._id);
				}
				User.collection.find({_id: {$in: updayarr}}, {_id: 1, login: 1, avatar: 1, disp: 1, pcount: 1}, this.parallel());
				for (i = upweek.length; i--;) {
					upweekHash[upweek[i]._id] = upweek[i].pcount;
					upweekarr.push(upweek[i]._id);
				}
				User.collection.find({_id: {$in: upweekarr}}, {_id: 1, login: 1, avatar: 1, disp: 1, pcount: 1}, this.parallel());
				User.collection.find({pcount: {$gt: 0}}, {_id: 0, login: 1, avatar: 1, disp: 1, pcount: 1}, {limit: limit, sort: [
					['pcount', 'desc']
				]}, this.parallel());
			},
			Utils.cursorsExtract,
			function (err, pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall, upday, upweek, upall) {
				if (err) {
					return handler({message: err && err.message, error: true});
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
					ucday[i].online = _session.us[ucday[i].login] !== undefined;
				}
				for (i = ucweek.length; i--;) {
					ucweek[i].ccount = ucommweekHash[ucweek[i]._id];
					ucweek[i].online = _session.us[ucweek[i].login] !== undefined;
				}
				for (i = ucall.length; i--;) {
					ucall[i].online = _session.us[ucall[i].login] !== undefined;
				}

				for (i = upday.length; i--;) {
					upday[i].pcount = updayHash[upday[i]._id];
					upday[i].online = _session.us[upday[i].login] !== undefined;
				}
				for (i = upweek.length; i--;) {
					upweek[i].pcount = upweekHash[upweek[i]._id];
					upweek[i].online = _session.us[upweek[i].login] !== undefined;
				}
				for (i = upall.length; i--;) {
					upall[i].online = _session.us[upall[i].login] !== undefined;
				}

				//console.log(Date.now() - st);
				handler({pday: pday || [], pweek: pweek || [], pall: pall || [], pcday: pcday.sort(sortCcount), pcweek: pcweek.sort(sortCcount), pcall: pcall, ucday: ucday.sort(sortCcount), ucweek: ucweek.sort(sortCcount), ucall: ucall, upday: upday.sort(sortPcount), upweek: upweek.sort(sortPcount), upall: upall});
			}
		);
	}, ms('1m'));
}());

/**
 * Статистика
 */
var giveStats = (function () {
	var aggregateParams = [
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
	];

	return Utils.memoizeAsync(function (handler) {
		var //st = Date.now(),
			photoYear;

		step(
			//Сначала запускаем агрегацию по всем показателем, требующим расчет
			function aggregation() {
				Photo.collection.aggregate(aggregateParams, this);
			},
			function getAggregationResultObjects(err, pMaxYear) {
				if (err) {
					return handler(err);
				}
				photoYear = pMaxYear[0];

				Photo.count(this.parallel());
				User.count({active: true}, this.parallel());

				Photo.count({adate: {$gt: dayStart}}, this.parallel());
				Photo.count({adate: {$gt: weekStart}}, this.parallel());
			},
			function (err, pallCount, userCount, pdayCount, pweekCount) {
				if (err) {
					return handler(err);
				}
				//console.log(Date.now() - st);
				handler(null, {all: {pallCount: pallCount || 0, userCount: userCount || 0, photoYear: photoYear, pdayCount: pdayCount || 0, pweekCount: pweekCount || 0}});
			}
		);
	}, ms('5m'));
}());

/**
 * Быстрая статистика
 */
var giveFastStats = (function () {

	return Utils.memoizeAsync(function (handler) {
		var usersCount = Utils.getObjectPropertyLength(_session.us),
			sessions = _session.sess,
			anonymCount = 0,
			i;

		//Общее кол-во "на сайте" считаем по анонимным сессиям плюс кол-во вошедших пользователей,
		//чтобы вычесть пользователей, залогиненных в нескольких сессиях
		for (i in sessions) {
			if (sessions[i] !== undefined && sessions[i].user === undefined) {
				anonymCount++;
			}
		}

		handler(null, {
			onall: anonymCount + usersCount,
			onreg: usersCount
		});
	}, ms('15s'));
}());

/**
 * Новости на главной в memoize
 */
var giveIndexNews = (function () {
	var select = {_id: 0, user: 0, cdate: 0, tdate: 0, nocomments: 0},
		options = {lean: true, limit: 3, sort: {pdate: -1}};

	return Utils.memoizeAsync(function (handler) {
		var now = new Date();
		News.find({pdate: {$lte: now}, $or: [
			{tdate: {$gt: now}},
			{tdate: {$exists: false}}
		]}, select, options, handler);
	}, ms('1m'));
}());

/**
 * Архив новостей
 */
function giveAllNews(cb) {
	News.find({pdate: {$lte: new Date()}}, {_id: 0, cdate: 0, tdate: 0, nocomments: 0}, {lean: true, sort: {pdate: -1}}).populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, disp: 1}}).exec(function (err, news) {
		if (err) {
			return cb({message: err.message, error: true});
		}
		cb({news: news});
	});
}

function giveNewsFull(data, cb) {
	if (!Utils.isType('object', data) || !Utils.isType('number', data.cid)) {
		return cb({message: 'Bad params', error: true});
	}
	step(
		function () {
			News.collection.findOne({cid: data.cid}, {_id: 0}, this);
		},
		function (err, news) {
			if (err) {
				return cb({message: err && err.message, error: true});
			}
			cb({news: news});
		}
	);
}
function giveNewsPublic(iAm, data, cb) {
	if (!Utils.isType('object', data) || !Utils.isType('number', data.cid)) {
		return cb({message: 'Bad params'});
	}

	News.findOne({cid: data.cid}, {_id: 1, cid: 1, user: 1, pdate: 1, title: 1, txt: 1, ccount: 1, nocomments: 1})
		.populate({path: 'user', select: {_id: 0, login: 1, avatar: 1, disp: 1}})
		.exec(function (err, news) {
			if (err) {
				return cb(err);
			}
			news = news.toObject(); //Чтобы можно было присвоить ccount_new и удалить _id

			if (!iAm || !news.ccount) {
				delete news._id;
				cb(null, {news: news});
			} else {
				commentController.getNewCommentsCount([news._id], iAm._id, 'news', function (err, countsHash) {
					if (err) {
						return cb(err);
					}
					if (countsHash[news._id])  {
						news.ccount_new = countsHash[news._id];
					}
					delete news._id;
					cb(null, {news: news});
				});
			}
		});
}

/**
 * Аватары для About
 */
var giveAbout = (function () {
	var select = {_id: 0, login: 1, avatar: 1},
		options = {lean: true};

	return Utils.memoizeAsync(function (handler) {
		User.find({login: {$in: ['Ilya', 'Duche', 'klimashkin', 'dema501', 'abdulla_hasan']}}, select, options, function (err, users) {
			if (err || !users) {
				users = [];
			}
			var result = {}, i;
			for (i = users.length; i--;) {
				result[users[i].login] = users[i].avatar || '/img/caps/avatar.png';
			}
			handler(result);
		});
	}, ms('1m'));
}());


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

		socket.on('giveIndexNews', function () {
			giveIndexNews(function (err, news) {
				socket.emit('takeIndexNews', err ? {message: err.message, error: true} : {news: news});
			});
		});
		socket.on('giveAllNews', function (data) {
			giveAllNews(function (resultData) {
				socket.emit('takeAllNews', resultData);
			});
		});
		socket.on('giveNews', function (data) {
			giveNewsFull(data, function (resultData) {
				socket.emit('takeNews', resultData);
			});
		});
		socket.on('giveNewsPublic', function (data) {
			giveNewsPublic(socket.handshake.session.user, data, function (err, result) {
				socket.emit('takeNewsPublic', err ? {message: err.message, error: true} : result);
			});
		});

		socket.on('giveRatings', function (data) {
			giveRatings(function (resultData) {
				socket.emit('takeRatings', resultData);
			});
		});

		socket.on('giveStats', function () {
			step(
				function () {
					giveStats(this.parallel());
					giveFastStats(this.parallel());
				},
				function (err, stat, statFast) {
					if (err) {
						return socket.emit('takeStats', {message: err && err.message, error: true});
					}
					stat.common = {};
					for (var i in statFast) {
						if (statFast[i] !== undefined) {
							stat.common[i] = statFast[i];
						}
					}
					socket.emit('takeStats', stat);
				}
			);
		});

		socket.on('giveAbout', function () {
			giveAbout(function (resultData) {
				socket.emit('takeAbout', resultData);
			});
		});
	});
};