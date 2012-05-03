var auth = require('./auth.js'),
	Settings = require('mongoose').model('Settings'),
	User = require('mongoose').model('User'),
	Step = require('step');

module.exports.loadController = function (app, io) {
	
	var iterator = 0;
	app.get('/p', function(req, res){
		res.render('photo.jade', {prettyprint:true, pageTitle: 'Photo', appVersion: app.version, verBuild: ++iterator });
	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session;
	});
	 
};