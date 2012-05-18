var auth = require('./auth.js'),
	_session = require('./_session.js'),
	Settings = require('mongoose').model('Settings'),
	User = require('mongoose').model('User'),
	Step = require('step'),
	Utils = require('../commons/Utils.js');

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
		
		socket.on('saveUser', function (data) {
			console.dir(data);
			var toDel = {};
			Object.keys(data).forEach(function(key) {
				if (data[key].length==0){
					toDel[key] = 1;
					delete data[key];
					delete session.neoStore.user[key];
				}
			});
			//var updateData = {}.extend(data).extend({'$unset': toDel});

			User.update({login: data.login}, {}.extend(data).extend({'$unset': toDel}), {upsert: true}, function(err){
				console.dir(arguments);
				if (err) {console.dir(err)}
				else{
					//Сохраняем временные данные сессии в memcashed
					session.neoStore.user.extend(data);
					_session.cashedSession(session.id, session.neoStore);
					console.log('saved story line');
				}
			});
			socket.emit('saveUserResult', {ok:1});
		});
		
		//socket.on('disconnect', function() {});	
	});

};