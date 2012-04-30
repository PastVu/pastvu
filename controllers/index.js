var auth = require('./auth.js'),
	User = require('mongoose').model('User'),
	Step = require('step');

module.exports.loadController = function (app, io) {

	app.dynamicHelpers({
		checkAccess: function(req, res){
			return function (role) {
				var user = req.session.user;
				return User.checkRole(user, role);
			}
		}
	});
	var iterator = 0;
	app.get('/', /*auth.restrictToRole('user'),*/ function(req, res){
		res.render('index.jade', {prettyprint:true, pageTitle: 'OldMos2', appVersion: app.version, verBuild: ++iterator });
	});
	
	io.sockets.on('connection', function (socket) {
		var sess = socket.handshake.session;
		//socket.log.info('a socket with sessionID', socket.handshake.sessionID, 'connected');
		//socket.log.info(sess);
	
		socket.on('giveGlobeParams', function (data) {
			socket.emit('takeGlobeParams', { USE_YANDEX_API: false, appVersion: app.version, verBuild: ++iterator, RegistrationAllowed: true });
		});
		
		socket.on('authRequest', function (data) {
			auth.login(sess, data, function(err, user){
				socket.emit('authResult', {user: user, error: err});
			});
		});
	});
	 
	app.get('/checkAlive', auth.restrictToRole('user'), function(req, res, next) {
		res.send({sessionExpires: req.session.cookie.expires});
	});

};