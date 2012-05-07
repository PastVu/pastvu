var mongoose = require('mongoose'),
	User = mongoose.model('User'),
	UserConfirm = mongoose.model('UserConfirm'),
	Mail = require('./mail.js'),
	Step = require('step'),
	Utils = require('../commons/Utils.js'),
	errS = require('../controllers/errors.js').err,
	app, io, mongo_store;

function login(session, data, callback){
	var error = null;
	console.log('---- '+session.id);
	data.login = data.login.toLowerCase();
    Step(
      function findUser() {
		User.findOne({'login': data.login}, this);
      },
      function checkEnter(err, user) {
		if (user){
			if (User.checkPass(user, data.pass)){
			} else {
				error = 'Password incorrect';
			}
		} else {
			error = 'User does not exists';
		}

		if (error){
			callback.call(null, error, null);
			return;
		}else{
			console.log('enter '+session.id);
			session.login = user.login;
			session.remember = data.remember;
			if (data.remember) session.cookie.expires = new Date(Date.now()+14*24*60*60*1000);
			else session.cookie.expires = false;
			console.log('----');
			session.save();
			
			//Удаляем предыдущие сохранившиеся сессии этого пользователя
			mongo_store.getCollection().remove({'session': { $regex : user.login, $options: 'i' }, _id: { $ne : session.id }});
			
			/*delete user.pass; delete user.salt;
			session.user = user;			
			*/
			console.log("login success for %s", data.login);
			callback.call(null, null, user);
		}
      }
    );
}
module.exports.login = login;

function register(session, data, callback){
	var error = '',
		success = 'The data is successfully sent. To confirm registration, follow the instructions sent to Your e-mail',
		confirmKey = '';
	data.login = data.login.toLowerCase();
    Step(
      function checkUserExists() {
		console.log('st');
		User.findOne({'login': data.login}, this.parallel());
		User.findOne({'email': data.email}, this.parallel());
      },
	  function createUser(err, user, email){
		console.log('createUser '+err);
		if (user) error += 'User with such login already exists. ';
		if (email) error += 'User with such email already exists';
		if (error){
			if (callback) callback.call(null, error);
			return;
		}
		
		confirmKey = Utils.randomString(80);
		
		var user = new User();
		user.login = data.login; user.email = data.email;
		user.pass = data.pass; user.hashPassword();
		user.save(this.parallel());

		new UserConfirm({key: confirmKey, login: data.login}).save(this.parallel());
		
	  },
	  function sendMail(err){
		console.log('sendMail '+err);
		if (err){
			if (callback) callback.call(null, err);
			return;
		}
		Mail.send({
			// sender info
			from: 'Oldmos2 <confirm@oldmos2.ru>',

			// Comma separated list of recipients
			to: data.login+' <'+data.email+'>',

			// Subject of the message
			subject: 'Registration confirm', //

			headers: {
				'X-Laziness-level': 1000
			},

			// plaintext body
			text: 'Привет, '+data.login+'!'+
				'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.'+
				'При регистрации вы указали логин и пароль:'+
				'Логин: '+data.login+
				'Пароль: '+data.pass+
				'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.'+
				'Для активации Вашего аккаунта, пройдите по следующей ссылке:'+
				'http://oldmos2.ru/confirm/'+confirmKey+' '+
				'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо зарегистрироваться повторно',

			// HTML body
			html:'Привет, <b>'+data.login+'</b>!<br/><br/>'+
				'Спасибо за регистрацию на проекте oldmos2.ru! Вы получили это письмо, так как этот e-mail адрес был использован при регистрации. Если Вы не регистрировались на нашем сайте, то просто проигнорируйте письмо и удалите его.<br/><br/>'+
				'При регистрации вы указали логин и пароль:<br/>'+
				'Логин: <b>'+data.login+'</b><br/>'+
				'Пароль: <b>'+data.pass+'</b><br/><br/>'+
				'Мы требуем от всех пользователей подтверждения регистрации, для проверки того, что введённый e-mail адрес реальный. Это требуется для защиты от спамеров и многократной регистрации.<br/><br/>'+
				'Для активации Вашего аккаунта, пройдите по следующей ссылке:<br/>'+
				'<a href="http://oldmos2.ru/confirm/'+confirmKey+'" target="_blank">http://oldmos2.ru/confirm/'+confirmKey+'</a><br/>'+
				'Ссылка действительна 3 дня, по истечении которых Вам будет необходимо зарегистрироваться повторно'
		}, this);
	  },
	  
	  function finish(err){
		console.log('finish '+err);
		if (callback) callback.call(null, err, (!err && success));
	  }
	)
}

function clearUnconfirmedUsers(){
	console.log('clearUnconfirmedUsers');
	var today = new Date(),
		todayminus2days = new Date(today);
		todayminus2days.setDate(today.getDate()-3);
	UserConfirm.find({'created': { "$lte" : todayminus2days}}, {login:1, _id:0}, function(err, docs){
		if (err) console.log('Err '+err);
		if (docs.length<1) return;
		
		var users = [];
		for (var i=0, dlen=docs.length; i<dlen; i++){
			users.push(docs[i]['login']);
			console.dir(docs[i]);
		}
		console.dir(users);
		User.remove({'login': { $in : users }}, function(err){console.log(err)});
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
				
		socket.on('authRequest', function (data) {
			login(socket.handshake.session, data, function(err, user){
				socket.emit('authResult', {user: user, error: err});
			});
		});
		
		socket.on('logoutRequest', function (data) {
			session.destroy(function(err) {
				socket.emit('logoutResult', {err:err, logoutPath: '/'});
			});
		});
 
 		socket.on('registerRequest', function (data) {
			register(socket.handshake.session, data, function(err, success){
				socket.emit('registerResult', {success: success, error: err});
			});
		});
	});
	
	app.get('/confirm/:key', function(req, res) {
		var key = req.params.key;
		if (!key || key.length<80) throw new errS.e404();
		console.log(req.params.key);
		UserConfirm.findOne({'key': req.params.key}, {login:1, _id:1}, function(err, doc){
			if (err) throw new errS.e404();
			if (doc) {
				Step(
					function(){
						User.update({ login: doc.login }, {$set: {active : true}},  { multi: false }, this.parallel());
						UserConfirm.remove({'_id': doc['_id']}, this.parallel());
					},
					function(err){
						if (err) throw new errS.e404();
						req.session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
						res.redirect('/');
					}
				)
			}
		});
	});
	
	//Раз в день чистим пользователей, которые не подтвердили регистрацию
	setInterval(clearUnconfirmedUsers, 24*60*60*1000);
	//clearUnconfirmedUsers();
};