var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings,
	User,
	Counter,
	News,
	step = require('step'),
	Utils = require('../commons/Utils.js');


function createNews(session, data, cb) {
	if (!Utils.isType('object', data)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	step(
		function () {
			Counter.increment('news', this);
		},
		function (err, count) {
			if (err || !count) {
				cb({message: (err && err.message) || 'Increment comment counter error', error: true});
				return;
			}

			var novel = new News({
				cid: count.next,
				user: session.user,
				pdate: data.pdate,
				tdate: data.tdate,
				title: data.title,
				notice: data.notice,
				txt: data.txt
			});
			novel.save(this);
		},
		function (err, novel) {
			if (err || !novel) {
				cb({message: err && err.message || 'Save error', error: true});
				return;
			}
			cb({news: novel});
		}
	);
}
function saveNews(data, cb) {
	if (!Utils.isType('object', data)) {
		cb({message: 'Bad params', error: true});
		return;
	}
	step(
		function () {
			News.findOne({cid: data.cid}, this);
		},
		function (err, novel) {
			if (err || !novel) {
				cb({message: err && err.message || 'No such news', error: true});
				return;
			}
			novel.pdate = data.pdate;
			novel.tdate = data.tdate;
			novel.title = data.title;
			novel.notice = data.notice;
			novel.txt = data.txt;
			novel.save(this);
		},
		function (err, novel) {
			if (err || !novel) {
				cb({message: err && err.message || 'Save error', error: true});
				return;
			}
			cb({news: novel});
		}
	);
}


module.exports.loadController = function (app, db, io) {

	Settings = db.model('Settings');
	Counter = db.model('Counter');
	User = db.model('User');
	News = db.model('News');

	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake;

		socket.on('giveUsers', function () {
			User.getAllPublicUsers(function (err, users) {
				socket.emit('takeUsers', users);
			});
		});

		socket.on('saveNews', function (data) {
			if (data.cid) {
				saveNews(data, function (resultData) {
					socket.emit('saveNewsResult', resultData);
				});
			} else {
				createNews(hs.session, data, function (resultData) {
					socket.emit('saveNewsResult', resultData);
				});
			}
		});
	});

};