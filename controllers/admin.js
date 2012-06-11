var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings = require('mongoose').model('Settings'),
	User = require('mongoose').model('User'),
	Step = require('step'),
	Utils = require('../commons/Utils.js');

module.exports.loadController = function (app, io) {
	
	app.get('/admin', auth.restrictToRoleLevel(50), function(req, res){
		
		res.render('adminUser.jade', {prettyprint:true, pageTitle: 'Admin Panel', appVersion: app.version});
		/*var login = req.params.login,
			userObject;
		if (!login) throw new errS.e404();
		
		Step(
			function () {
				User.getUserPublic(login, this);
			},
			function (err, user) {
				userObject = user.toObject();
				if (err || !user) {
					throw new errS.e404();
				} else {
					res.render('profile.jade', {prettyprint:true, pageTitle: user.login, appVersion: app.version, login: user.login, fff: JSON.stringify({a:0})});
				}
			}
		);*/

	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session; 
			
	});

};