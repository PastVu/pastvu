var auth = require('./auth.js'),
	Settings = require('mongoose').model('Settings'),
	User = require('mongoose').model('User'),
	Step = require('step');

module.exports.loadController = function (app, io) {
	
	app.get('/u/:login', function(req, res){
		var login = req.params.login,
			userObject;
		if (!login) throw new errS.e404();
		
		console.dir('III');
		
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
		);	
				
	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session; 
			
		//socket.emit('initMessage', {init_message: '000'});

		socket.on('giveUser', function (data) {
			//console.dir(data);
			User.getUserPublic(data.login, function(err, user){
				socket.emit('takeUser', user.toObject());
			});
		});
		
		//socket.on('disconnect', function() {});	
	});

};