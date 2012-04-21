var mongoose = require('mongoose'),
    crypto = require('crypto');

var Step = require('step');
var User = mongoose.model('User');

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

module.exports.loadController = function(app) {

	app.get('/logout', function(req, res){
		// destroy the user's session to log them out
		// will be re-created next request
		req.session.destroy(function(){
			res.redirect('/login');
		});
	});

	app.get('/login/:role?', function(req, res) {
		var role = req.params.role,
			user = req.session.user;
		if (User.checkRole(user, role)) {
			res.redirect('/');
		} else {
			renderLoginPage(req, res, {role: role});
		}
	});

  app.post('/login/:role?', function(req, res, next) {
    var role  = req.params.role,
        login = req.body.user.login,
        pass = req.body.user.pass; 

    Step(
      function find() {
        User.findOne({login: login}, this);
      },
      function check(err, user) {
        if (err || !user) {
          req.flash('error', i18n("There is no such user", req));
          return renderLoginPage(req, res);
        }
        user = user.toObject();
        if (!User.checkPass(user, pass)) {
          req.flash('error', i18n("Wrong password", req));
          return renderLoginPage(req, res);
        }
        if (!User.checkRole(user, role)) {
          req.flash('error', i18n("Wrong login/pass for role %s", role, req));
          return renderLoginPage(req, res);
        }
        this.parallel()(null, user);
        req.session.regenerate(this.parallel());
      },
      function enter(err, user) {
        if (err) {
          console.log("Error regeniration session. " + err);
          return next(err);
        }
        // Store the user's primary key in the session store to be retrieved,
        // or in this case the entire user object
        req.session.user = user;
        res.redirect(req.sessionStore.cameFrom || 'home');
        delete req.sessionStore.cameFrom;
        console.log("login success for %s", login);
      }
    );
  });
};