var mongoose = require('mongoose'),
	User = mongoose.model('User'),
	Role = mongoose.model('Role'),
	Step = require('step'),
	errS = require('./errors.js').err,
	Utils = require('../commons/Utils.js'),
	app, io, mongo_store, mc;
	
function cashedSession(id, neoStore, callback){
	if (neoStore){
		mc.set('sess'+id, JSON.stringify(neoStore), {flags: 0, exptime: Utils.time.hour/1000}, function(err, status) {
		  if (!err) {
			console.log(status);
			if (callback) callback(null);
		  }
		});
	} else {
		console.dir('cashedSession '+id);
		mc.get('sess'+id, function(err, response) {
			if (!err) {
				console.log('From MC');
				if (callback) callback(null, JSON.parse(response['sess'+id]));
			}else{
				console.dir(err);
				if (callback) callback(err);
			}
		});
	}
}
module.exports.cashedSession = cashedSession;

function cashedSessionDel(id, callback){
	mc.del('sess'+id, callback || function(){});
}
module.exports.cashedSessionDel = cashedSessionDel;


module.exports.loadController = function(a, io, ms, memcashed) {
	app = a;
	mongo_store = ms;
	mc = memcashed;
		
	app.get('*', function(req, res, next){
		
		var sessId = req.cookies['oldmos.sid'];
		console.log(sessId);
		if (sessId){
			cashedSession(sessId, null, function (err, neoStore){
				if (!neoStore) neoStore = {};
				req.session.neoStore = neoStore;
				
				if (req.session.login){
					if (!neoStore.user){
						Step(
							function () {
								User.getUserPublic(req.session.login, this);
							},
							function (err, user) {
								neoStore.user = user.toObject();
								Role.find({name: {$in: ['admin', 'registered']}}, {_id:0}, this);
							},
							function (err, roles) {
								console.dir(roles);
								neoStore.roles = roles;
								console.log('To MC');
								cashedSession(sessId, neoStore);
								next();
							}
						);
					} else {
						next();
					}
					
				} else {
					next();
				}

			});
		} else {
			req.session.neoStore = {};
			next();
		}

	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session;
			
		var sessId = hs.sessionID;
		console.log('io '+sessId);
		if (sessId){
			cashedSession(sessId, null, function (err, neoStore){
				if (!neoStore) neoStore = {};
				session.neoStore = neoStore;
				
				if (session.login){
					if (!neoStore.user){
						User.getUserPublic(session.login, function(err, user){
							console.log('To MC');
							neoStore.user = user.toObject();
							cashedSession(sessId, neoStore);
							//next();
						});
						
					} else {
						//next();
					}
					
				} else {
					console.log('XXXX '+ session.neoStore);
					//next();
				}

			});
		} else {
			session.neoStore = {};
			//next();
		}
			
		//hs.lll = 'lll';
		//hs.session.lll = 'lll';
		//console.log(hs.session.user);
	});
	
};