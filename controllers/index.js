var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
	Comment,
	moment = require('moment'),
	Utils = require('../commons/Utils.js'),
	step = require('step'),
	log4js = require('log4js'),
	appEnv = {};

module.exports.loadController = function (app, db, io) {
	var logger = log4js.getLogger("index.js");
	appEnv = app.get('appEnv');

	Settings = db.model('Settings');
	User = db.model('User');
	Photo = db.model('Photo');
	Comment = db.model('Comment');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		//hs.session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
		if (hs.session.message) {
			socket.emit('initMessage', {init_message: hs.session.message});
			hs.session.message = null;
		}

		socket.on('giveGlobeParams', function (data) {
			var params = {
				ip: hs.address
			};
			step(
				function () {
					Settings.find({}, this);
				},
				function (err, settings, user) {
					var x = settings.length - 1;
					do {
						params[settings[x]['key']] = settings[x]['val'];
					} while (x--);
					params.user = hs.session.user;
					this();
				},
				function () {
					socket.emit('takeGlobeParams', params.extend({appHash: app.hash, domain: appEnv.domain, port: appEnv.port, uport: appEnv.uport}));
				}
			);
		});

		(function () {
			/**
			 * Рейтинги
			 */
			var limit = 10; //Ограничиваем кол-во результатов по каждому показателю

			//Так как после выборки объектов по вхождению в массив ключей ($in) порядок сортировки не гарантируется,
			//то перед отдачей сортируем массивы по требуемому показателю
			function sortCcount (a, b) {
				return b.ccount - a.ccount;
			}
			function sortPcount (a, b) {
				return b.pcount - a.pcount;
			}
			function result(data) {
				socket.emit('takeRatings', data);
			}

			socket.on('giveRatings', function (data) {
				var st = Date.now(),
					pcommdayHash = {},
					pcommweekHash = {},
					ucommdayHash = {},
					ucommweekHash = {},
					updayHash = {},
					upweekHash = {};

				if (!Utils.isType('object', data)) {
					result({message: 'Bad params', error: true});
					return;
				}

				step(
					//Сначала запускаем агрегацию по всем показателем, требующим расчет
					function aggregation() {
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('day').toDate()}}},
							{$group: {_id: '$photo', ccount: {$sum: 1}}},
							{$sort: {ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('week').toDate()}}},
							{$group: {_id: '$photo', ccount: {$sum: 1}}},
							{$sort: {ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('day').toDate()}}},
							{$group: {_id: '$user', ccount: {$sum: 1}}},
							{$sort: {ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('week').toDate()}}},
							{$group: {_id: '$user', ccount: {$sum: 1}}},
							{$sort: {ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Photo.collection.aggregate([
							{$match: {adate: {$gt: moment().startOf('day').toDate()}, disabled: {$exists: false}, del: {$exists: false}}},
							{$group: {_id: '$user', pcount: {$sum: 1}}},
							{$sort: {pcount: -1}},
							{$limit: limit}
						], this.parallel());
						Photo.collection.aggregate([
							{$match: {adate: {$gt: moment().startOf('week').toDate()}, disabled: {$exists: false}, del: {$exists: false}}},
							{$group: {_id: '$user', pcount: {$sum: 1}}},
							{$sort: {pcount: -1}},
							{$limit: limit}
						], this.parallel());
					},
					function getAggregationResultObjects(err, pcday, pcweek, ucday, ucweek, upday, upweek) {
						if (err) {
							result({message: err && err.message, error: true});
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
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, stats_day: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, stats_day: 1}, {limit: limit, sort: [
							['stats_day', 'desc']
						]}, this.parallel());
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, stats_week: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, stats_week: 1}, {limit: limit, sort: [
							['stats_week', 'desc']
						]}, this.parallel());
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, stats_all: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, stats_all: 1}, {limit: limit, sort: [
							['stats_all', 'desc']
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
					function cursorsExtract(err) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}

						for (var i = 1; i < arguments.length; i++) {
							arguments[i].toArray(this.parallel());
						}
					},
					function (err, pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall, upday, upweek, upall) {
						if (err) {
							result({message: err && err.message, error: true});
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
						result({pday: pday || [], pweek: pweek || [], pall: pall || [], pcday: pcday.sort(sortCcount), pcweek: pcweek.sort(sortCcount), pcall: pcall, ucday: ucday.sort(sortCcount), ucweek: ucweek.sort(sortCcount), ucall: ucall, upday: upday.sort(sortPcount), upweek: upweek.sort(sortPcount), upall: upall});
					}
				);

			});
		}());
	});


};