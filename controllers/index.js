var auth = require('./auth.js');
var User = require('mongoose').model('User');

module.exports.loadController = function (app, io) {

	app.dynamicHelpers({
		checkAccess: function(req, res){
			return function (role) {
				var user = req.session.user;
				return User.checkRole(user, role);
			}
		}
	});

	app.get('/', /*auth.restrictToRole('user'),*/ function(req, res){
		res.render('index.jade', {prettyprint:true, pageTitle: 'OldMos', appVersion: app.version });
	});
	
	io.sockets.on('connection', function (socket) {
		socket.on('giveGlobeParams', function (data) {
			socket.emit('takeGlobeParams', { USE_YANDEX_API: false, appVersion: app.version });
		});
	});
	 
	app.get('/checkAlive', auth.restrictToRole('user'), function(req, res, next) {
		res.send({sessionExpires: req.session.cookie.expires});
	});

};