var mongoose = require('mongoose'),
	User = mongoose.model('User'),
	Step = require('step'),
	app, mongo_store;

function login(session, data, callback){
	var error = null;
	console.log('---- '+session.id);
    Step(
      function findUser() {
		User.findOne({'login': data.user}, this);
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
			console.log("login success for %s", data.user);
			callback.call(null, null, user);
		}
      }
    );
}
module.exports.login = login;


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

function renderLoginPage(req, res, opts) {
	if (!opts) opts = {};
	opts.title = i18n('Login to StatServer', req);
	opts.layout = true;

	req.flash('info', i18n("Enter login and password", req));
	res.render('login', opts);
}

// export methods
module.exports.restrictToRole = restrictToRole;

module.exports.loadController = function(a, ms) {
	app = a;
	mongo_store = ms;
};