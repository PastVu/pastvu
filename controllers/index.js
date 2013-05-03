var auth = require('./auth.js'),
	Settings,
	User,
	Photo,
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
				if (!Utils.isType('object', data)) {
					result({message: 'Bad params', error: true});
					return;
				}

				step(
					function () {
						var pcriteria = {fresh: {$exists: false}, del: {$exists: false}};

						Photo.collection.find(pcriteria, {_id: 0, cid: 1, file: 1, title: 1, stats_day: 1}, {limit: 10, sort: [
							['stats_day', 'desc']
						]}, this.parallel());
						Photo.collection.find(pcriteria, {_id: 0, cid: 1, file: 1, title: 1, stats_week: 1}, {limit: 10, sort: [
							['stats_week', 'desc']
						]}, this.parallel());
						Photo.collection.find(pcriteria, {_id: 0, cid: 1, file: 1, title: 1, stats_all: 1}, {limit: 10, sort: [
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
					},
					function (err, pday, pweek, pall) {
						if (err) {
							result({message: err && err.message, error: true});
							return;
						}
						result({pday: pday || [], pweek: pweek || [], pall: pall || []});
					}
				);

			});
		}());
	});


};