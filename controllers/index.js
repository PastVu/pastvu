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
			var limit = 10;
			function result(data) {
				socket.emit('takeRatings', data);
			}

			socket.on('giveRatings', function (data) {
				var st = Date.now(),
					pcommdayHash = {},
					pcommweekHash = {},
					ucommdayHash = {},
					ucommweekHash = {};

				if (!Utils.isType('object', data)) {
					result({message: 'Bad params', error: true});
					return;
				}

				step(
					function aggregation() {
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('day').toDate()}}},
							{$group: {_id: '$photo', ccount: {$sum: 1}}},
							{$sort: { ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('week').toDate()}}},
							{$group: {_id: '$photo', ccount: {$sum: 1}}},
							{$sort: { ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('day').toDate()}}},
							{$group: {_id: '$user', ccount: {$sum: 1}}},
							{$sort: { ccount: -1}},
							{$limit: limit}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('week').toDate()}}},
							{$group: {_id: '$user', ccount: {$sum: 1}}},
							{$sort: { ccount: -1}},
							{$limit: limit}
						], this.parallel());
					},
					function getAggregationResultObjects(err, pcday, pcweek, ucday, ucweek) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						var i,
							pcdayarr = [],
							pcweekarr = [],
							ucdayarr = [],
							ucweekarr = [];

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
					function (err, pday, pweek, pall, pcday, pcweek, pcall, ucday, ucweek, ucall) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						var i;

						i = pcday.length;
						while (i--) {
							pcday[i].ccount = pcommdayHash[pcday[i]._id];
						}
						i = pcweek.length;
						while (i--) {
							pcweek[i].ccount = pcommweekHash[pcweek[i]._id];
						}
						i = ucday.length;
						while (i--) {
							ucday[i].ccount = ucommdayHash[ucday[i]._id];
						}
						i = ucweek.length;
						while (i--) {
							ucweek[i].ccount = ucommweekHash[ucweek[i]._id];
						}

						console.log(Date.now() - st);
						result({pday: pday || [], pweek: pweek || [], pall: pall || [], pcday: pcday, pcweek: pcweek, pcall: pcall, ucday: ucday, ucweek: ucweek, ucall: ucall});
					}
				);

			});
		}());
	});


};