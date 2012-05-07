var auth = require('./auth.js'),
	Settings = require('mongoose').model('Settings'),
	Mail = require('./mail.js'),
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
	
	function regenSession(req, res, next){
		if (req.session.login){
			console.log('!!!!+++++');
			var login = req.session.login,
				remember = req.session.remember,
				message = req.session.message;
			console.log('qqqq1=' + req.sessionID+' '+req.session.login);
			req.session.regenerate(function(err){
				if (err) console.log('Regenerate session error: '+err);
				req.session.login = login;
				req.session.remember = remember;
				req.session.message = message;
				if (remember) req.session.cookie.expires = new Date(Date.now()+14*24*60*60*1000);
				else req.session.cookie.expires = false;
				req.session.save();
				console.log('qqqq2=' + req.sessionID+' '+req.session.login);
				next();
			});
		}else{
			next();
		}
	}
	
	var iterator = 0;
	app.get('/', regenSession, function(req, res){
		res.render('index.jade', {prettyprint:true, pageTitle: 'OldMos2', appVersion: app.version, verBuild: ++iterator});
	});
	
	app.get('/updateCookie', function(req, res) {
		res.send();
	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session;
		//session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
		if (session.message) { socket.emit('initMessage', {init_message: session.message}); session.message = null;}
		
		socket.on('giveGlobeParams', function (data) {
			var params = {
				LoggedIn: !!session.login
			}
			Step(
				function (){
					Settings.find({}, this.parallel());
					if (params.LoggedIn) User.findOne({'login': session.login}, { 'pass': 0, 'salt': 0, 'roles': 0}, this.parallel());
				},
				function (err, settings, user){
					var x = settings.length-1;
					do {params[settings[x]['key']] = settings[x]['val'] } while( x-- );
					params.user = user;
					this();
				},
				function (){
					socket.emit('takeGlobeParams', params.extend({appVersion: app.version, verBuild: ++iterator}));
				}
			);
		});	
	});
	 

};