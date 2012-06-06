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
			if (callback) callback(null);
		  }
		});
	} else {
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
								Role.find({name: {$in: neoStore.user.roles}}, {_id:0}).desc('level').exec(this);
							},
							function (err, roles) {
								neoStore.roles = roles;
								console.log('To MC by Request');
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
		if (sessId){
			cashedSession(sessId, null, function (err, neoStore){
				if (!neoStore) neoStore = {};
				session.neoStore = neoStore;
				if (session.login){
					if (!neoStore.user){
						Step(
							function () {
								User.getUserPublic(session.login, this);
							},
							function (err, user) {
								neoStore.user = user.toObject();
								Role.find({name: {$in: neoStore.user.roles}}, {_id:0}).desc('level').exec(this);
							},
							function (err, roles) {
								neoStore.roles = roles;
								console.log('To MC by Socket');
								cashedSession(sessId, neoStore);
								next();
							}
						);
					} else {
						//next();
					}
					
				} else {
					//next();
				}

			});
		} else {
			session.neoStore = {};
			//next();
		}
	});
	
};