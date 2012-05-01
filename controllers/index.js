var auth = require('./auth.js'),
	Settings = require('mongoose').model('Settings'),
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
	
	app.get('/updateCookie', function(req, res, next) {
		res.send({});
	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session;
		//socket.log.info('a socket with sessionID', socket.handshake.sessionID, 'connected');
	
		socket.on('giveGlobeParams', function (data) {
			var params = {
				LoggedIn: !!session.user_id
			}
			Step(
				function (){
					Settings.find({}, this.parallel())
					if (params.LoggedIn) User.findOne({'_id': session.user_id}, { 'pass': 0, 'salt': 0, 'roles': 0}, this.parallel());
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
		
		socket.on('authRequest', function (data) {
			auth.login(session, data, function(err, user){
				console.log(socket.handshake.session.user);
				socket.emit('authResult', {user: user, error: err});
			});
		});
		
 
		// setup an inteval that will keep our session fresh
		/*var intervalID = setInterval(function () {
			// reload the session (just in case something changed,
			// we don't want to override anything, but the age)
			// reloading will also ensure we keep an up2date copy
			// of the session with our connection.
			session.reload( function () { 
				// "touch" it (resetting maxAge and lastAccess)
				// and save it back again.
				session.touch().save();
			//});
		}, 60 * 1000);
		socket.on('disconnect', function () {
			console.log('A socket with sessionID ' + hs.sessionID + ' disconnected!');
			// clear the socket interval to stop refreshing the session
			clearInterval(intervalID);
		});*/
		
	});
	 

};