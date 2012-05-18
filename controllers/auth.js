var mongoose = require('mongoose'),
	_session = require('./_session.js'),
	User = mongoose.model('User'),
	UserConfirm = mongoose.model('UserConfirm'),
	Step = require('step'),
	Mail = require('./mail.js'),
	errS = require('./errors.js').err,
	Utils = require('../commons/Utils.js'),
	app, io, mongo_store;

function login(session, data, callback){
	var error = '';

	if (!data.login) error += 'Fill in the login field. ';
	if (!data.pass) error += 'Fill in the password field.';
	if (error){
		callback.call(null, error, null); return;
	}
	
    Step(
		function findUser() {
			User.getUserAllLoginMail(data.login, this);
		},
		function checkEnter(err, user) {
			if (user){
				if (!User.checkPass(user, data.pass)) error = 'Password incorrect';
			} else {
				error = 'User does not exists';
			}

			if (error){
				callback.call(null, error, null);
				return;
			}else{
				session.login = user.login;
				session.remember = data.remember;
				if (data.remember) session.cookie.expires = new Date(Date.now()+14*24*60*60*1000);
				else session.cookie.expires = false;
				session.save();

				//Удаляем предыдущие сохранившиеся сессии этого пользователя
				mongo_store.getCollection().remove({'session': new RegExp(user.login, 'i'), _id: { $ne : session.id }});
				
				var u = user.toObject(); delete u.salt; delete u.pass; delete u['_id'];
				session.neoStore.user = u;
				
				//Сохраняем временные данные сессии в memcashed
				_session.cashedSession(session.id, session.neoStore);				
			
				console.log("Login success for %s", data.login);
				callback.call(null, null, u);
			}
		}
    );
}

function register(session, data, callback){
	var error = '',
		success = 'The data is successfully sent. To confirm registration, follow the instructions sent to Your e-mail',
		confirmKey = '';
	data.email = data.email.toLowerCase();
	
	if (!data.login) error += 'Fill in the login field. ';
	if (!data.email) error += 'Fill in the e-mail field. ';
	if (!data.pass) error += 'Fill in the password field. ';
	if (data.pass!=data.pass2) error += 'Passwords do not match.';
	if (error){
		callback.call(null, error, null); return;
	}
	
    Step(
      function checkUserExists() {
		User.findOne({ $or : [ { login : new RegExp(data.login, 'i') } , { email : data.email } ] } , this);
      },
	  function createUser(err, user){
		if (user) {
			if (user.login.toLowerCase() == data.login.toLowerCase()) error += 'User with such login already exists. ';
			if (user.email == data.email) error += 'User with such email already exists.';
			
			if (callback) callback.call(null, error);
			return;
		}
		
		confirmKey = Utils.randomString(80);
		
		var user = new User();
		user.login = data.login; user.email = data.email;
		user.pass = data.pass; user.hashPassword();
		user.save(this.parallel());
		
		UserConfirm.remove({login: new RegExp(data.login, 'i')}, this.parallel());
	  },
	  function sendMail(err){
		if (err){
			if (callback) callback.call(null, err);
			return;
		}
		Mail.send({
			from: 'Oldmos2 <confirm@oldmos2.ru>',
			to: data.login+' <'+data.email+'>',
			subject: 'Registration confirm', //
			headers: {
				'X-Laziness-level': 1000
			},

			text: 'Привет, '+data.login+'!'+
				'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.'+
				'При регистрации вы указали логин и пароль:'+
				'Логин: '+data.login+
				'Пароль: '+data.pass+
				'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.'+
				'Для активации Вашего аккаунта, пройдите по следующей ссылке:'+
				'http://oldmos2.ru:3000/confirm/'+confirmKey+' '+
				'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо зарегистрироваться повторно',
			html:'Привет, <b>'+data.login+'</b>!<br/><br/>'+
				'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.<br/><br/>'+
				'При регистрации вы указали логин и пароль:<br/>'+
				'Логин: <b>'+data.login+'</b><br/>'+
				'Пароль: <b>'+data.pass+'</b><br/><br/>'+
				'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.<br/><br/>'+
				'Для активации Вашего аккаунта, пройдите по следующей ссылке:<br/>'+
				'<a href="http://oldmos2.ru:3000/confirm/'+confirmKey+'" target="_blank">http://oldmos2.ru/confirm/'+confirmKey+'</a><br/>'+
				'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо зарегистрироваться повторно'
		}, this.parallel());
		
		new UserConfirm({key: confirmKey, login: data.login}).save(this.parallel());
	  },
	  
	  function finish(err){
		if (callback) callback.call(null, err, (!err && success));
	  }
	)
}

function recall(session, data, callback){
	var error = '',
		success = 'The data is successfully sent. To restore password, follow the instructions sent to Your e-mail',
		confirmKey = '';

	if (!data.login) error += 'Fill in login or e-mail.';
	if (error){
		callback.call(null, error, null); return;
	}
	
    Step(
      function checkUserExists() {
		User.findOne({ $and: [ { $or : [ { login : new RegExp(data.login, 'i') } , { email : data.login.toLowerCase() } ] }, { active: true } ] } , this);
      },
	  function (err, user){
		if (err || !user){
			error += 'User with such login or e-mail does not exist';
			if (callback) callback.call(null, error);
			return;
		}else{
			data.login = user.login; data.email = user.email;
			confirmKey = Utils.randomString(79);
			UserConfirm.remove({login: new RegExp(data.login, 'i')}, this);
		}
	  },
	  function (err){
		new UserConfirm({key: confirmKey, login: data.login}).save(this);
	  },
	  function sendMail(err){
		if (err){
			if (callback) callback.call(null, err);
			return;
		}
		Mail.send({
			from: 'Oldmos2 <confirm@oldmos2.ru>',
			to: data.login+' <'+data.email+'>',
			subject: 'Request for password recovery',
			headers: {
				'X-Laziness-level': 1000
			},

			text: 'Привет, '+data.login+'!'+
				'Вы получили это письмо, так как для Вашей учетной записи был создан запрос на восстановление пароля на проекте oldmos2.ru. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.'+
				'Для получения нового пароля перейдите по следующей ссылке:'+
				'http://oldmos2.ru:3000/confirm/'+confirmKey+' '+
				'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо запрашивать смену пароля повторно',
			html:'Привет, <b>'+data.login+'</b>!<br/><br/>'+
				'Вы получили это письмо, так как для Вашей учетной записи был создан запрос на восстановление пароля на проекте oldmos2.ru. Если Вы не производили таких действий на нашем сайте, то просто проигнорируйте и удалите письмо.<br/><br/>'+
				'Для получения нового пароля перейдите по следующей ссылке:<br/>'+
				'<a href="http://oldmos2.ru:3000/confirm/'+confirmKey+'" target="_blank">http://oldmos2.ru/confirm/'+confirmKey+'</a><br/>'+
				'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо запрашивать смену пароля повторно'
		}, this);
	  },
	  
	  function finish(err){
		if (callback) callback.call(null, err, (!err && success));
	  }
	)
}

function clearUnconfirmedUsers(){
	console.log('clearUnconfirmedUsers');
	var today = new Date(),
		todayminus2days = new Date(today);
		todayminus2days.setDate(today.getDate()-3);
	UserConfirm.find({'created': { "$lte" : todayminus2days}}, {key: 1, login:1, _id:0}, function(err, docs){
		if (err) console.log('Err '+err);
		if (docs.length<1) return;
		
		var users = [];
		for (var i=0, dlen=docs.length; i<dlen; i++){
			if(docs[i]['key'].length == 80) users.push(docs[i]['login']);
		}
		console.dir(users);
		if(users.length > 0) User.remove({'login': { $in : users }}, function(err){console.log(err)});
		UserConfirm.remove({'created': { "$lte" : todayminus2days }}, function(err){console.log(err)});
	})
}

/**
 * redirect to /login if user has insufficient rights
 * @param role
 */
function restrictToRole(role) {
    return function(req, res, next) {
        var user = req.session.user,
            param = '';
        if (User.checkRole(user, role)) {
            next();
        } else {
            var url = '/login';
            if (user) {
                url += '/' + role;
                req.flash('error', i18n("For current operation you need to login as %s", i18n(User.getRole(role).name, req), req));
            }

            if (req.xhr) {
                url = {redirect: url};
                res.send(url, 403);
            } else {
                req.sessionStore.cameFrom = req.url;
                res.redirect(url);
            }
        }
    }
}
module.exports.restrictToRole = restrictToRole;

function renderLoginPage(req, res, opts) {
	if (!opts) opts = {};
	opts.title = i18n('Login to StatServer', req);
	opts.layout = true;

	req.flash('info', i18n("Enter login and password", req));
	res.render('login', opts);
}

module.exports.loadController = function(a, io, ms) {
	app = a;
	mongo_store = ms;
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session;
				
		socket.on('loginRequest', function (data) {
			login(socket.handshake.session, data, function(err, user){
				socket.emit('loginResult', {user: user, error: err});
			});
		});
		
		socket.on('logoutRequest', function (data) {
			_session.cashedSessionDel(session.id);
			
			session.destroy(function(err) {
				socket.emit('logoutResult', {err:err, logoutPath: '/'});
			});
		});
 
 		socket.on('registerRequest', function (data) {
			register(session, data, function(err, success){
				socket.emit('registerResult', {success: success, error: err});
			});
		});

		socket.on('recallRequest', function (data) {
			recall(session, data, function(err, success){
				socket.emit('recallResult', {success: success, error: err});
			});
		});
		
		socket.on('whoAmI', function (data) {
			console.log('whoAmI ='+socket.handshake.session.neoStore);
			console.dir(session.neoStore.user);
			socket.emit('youAre', session.neoStore.user);
		});
	});
	
	app.get('/confirm/:key', function(req, res) {
		var key = req.params.key;
		if (!key || key.length<79 || key.length>80) throw new errS.e404();
		
		UserConfirm.findOne({'key': key}, {login:1, _id:1}, function(err, doc){
			if (err || !doc) {
				errS.e404Virgin(req, res);
			}else {
				if (key.length == 80) { //Confirm registration
					Step(
						function(){
							User.update({ login: doc.login }, {$set: {active : true}}, { multi: false }, this.parallel());
							UserConfirm.remove({'_id': doc['_id']}, this.parallel());
						},
						function(err){
							if (err) errS.e500Virgin(req, res);
							else{
								req.session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
								res.redirect('/');
							}
						}
					);
				} else if (key.length == 79) { //Confirm pass change
					var newPass = Utils.randomString(8),
						email;
						
					Step(
						function findUser(){
							User.findOne({ login: doc.login }, this);
						},
						function (err, user){
							if (user){
								email = user.email;
								user.pass = newPass; user.hashPassword();
								user.save(this);
							} else {
								errS.e404Virgin(req, res);
							}
						},
						function sendMail(err){
							if (err){
								errS.e500Virgin(req, res);
							}
							Mail.send({
								// sender info
								from: 'Oldmos2 <confirm@oldmos2.ru>',

								// Comma separated list of recipients
								to: doc.login+' <'+email+'>',

								// Subject of the message
								subject: 'Your new password', //

								headers: {
									'X-Laziness-level': 1000
								},

								text: 'Привет, '+doc.login+'!'+
									'Ваш пароль успешно заменен на новый.'+
									'Логин: '+doc.login+
									'Пароль: '+newPass+
									'Теперь Вы можете зайти на проект oldmos2.ru, используя новые реквизиты',
								
								html:'Привет, <b>'+doc.login+'</b>!<br/><br/>'+
									'Ваш пароль успешно заменен на новый.<br/>'+
									'Логин: <b>'+doc.login+'</b><br/>'+
									'Пароль: <b>'+newPass+'</b><br/><br/>'+
									'Теперь Вы можете зайти на проект oldmos2.ru, используя новые реквизиты'
							}, this);
						},
						function finish(err){
							if (err) errS.e500Virgin(req, res);
							else{
								req.session.message = 'Thank you! Information with new password sent to your e-mail. You can use it right now!';
								res.redirect('/');
							}
						}
					);
				}
			}
		});
	});
	
	//Раз в день чистим пользователей, которые не подтвердили регистрацию или не сменили пароль
	setInterval(clearUnconfirmedUsers, 24*60*60*1000);
	//clearUnconfirmedUsers();
};