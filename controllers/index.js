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
			function result(data) {
				socket.emit('takeRatings', data);
			}

			socket.on('giveRatings', function (data) {
				var st = Date.now(),
					pviewday,
					pviewweek,
					pviewall,

					pcommdayHash = {},
					pcommweekHash = {};
				if (!Utils.isType('object', data)) {
					result({message: 'Bad params', error: true});
					return;
				}

				step(
					function () {
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, stats_day: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, stats_day: 1}, {limit: 10, sort: [
							['stats_day', 'desc']
						]}, this.parallel());
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, stats_week: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, stats_week: 1}, {limit: 10, sort: [
							['stats_week', 'desc']
						]}, this.parallel());
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}, stats_all: {$gt: 0}}, {_id: 0, cid: 1, file: 1, title: 1, stats_all: 1}, {limit: 10, sort: [
							['stats_all', 'desc']
						]}, this.parallel());
					},
					function cursors(err) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}

						for (var i = 1; i < arguments.length; i++) {
							arguments[i].toArray(this.parallel());
						}

						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('day').toDate()}}},
							{$group: {_id: '$photo', ccount: {$sum: 1}}},
							{$sort: { ccount: -1}},
							{$limit: 10}
						], this.parallel());
						Comment.collection.aggregate([
							{$match: {stamp: {$gt: moment().startOf('week').toDate()}}},
							{$group: {_id: '$photo', ccount: {$sum: 1}}},
							{$sort: { ccount: -1}},
							{$limit: 10}
						], this.parallel());
					},
					function (err, pday, pweek, pall, pcday, pcweek) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						pviewday = pday;
						pviewweek = pweek;
						pviewall = pall;

						var i,
							pcdayarr = [],
							pcweekarr = [];

						i = pcday.length;
						while (i--) {
							pcommdayHash[pcday[i]._id] = pcday[i].ccount;
							pcdayarr.push(pcday[i]._id);
						}
						i = pcweek.length;
						while (i--) {
							pcommweekHash[pcweek[i]._id] = pcweek[i].ccount;
							pcweekarr.push(pcweek[i]._id);
						}
						Photo.collection.find({_id: {$in: pcdayarr}, fresh: {$exists: false}, del: {$exists: false}}, {_id: 1, cid: 1, file: 1, title: 1, ccount: 1}, this.parallel());
						Photo.collection.find({_id: {$in: pcweekarr}, fresh: {$exists: false}, del: {$exists: false}}, {_id: 1, cid: 1, file: 1, title: 1, ccount: 1}, this.parallel());
						Photo.collection.find({fresh: {$exists: false}, del: {$exists: false}}, {_id: 0, cid: 1, file: 1, title: 1, ccount: 1}, {limit: 10, sort: [
							['ccount', 'desc']
						]}, this.parallel());
					},
					function cursors(err) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}

						for (var i = 1; i < arguments.length; i++) {
							arguments[i].toArray(this.parallel());
						}
					},
					function (err, pcday, pcweek, pcall) {
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

						console.log(Date.now() - st);
						result({pday: pviewday || [], pweek: pviewweek || [], pall: pviewall || [], pcday: pcday, pcweek: pcweek, pcall: pcall});
					}
				);

			});
		}());
	});


};