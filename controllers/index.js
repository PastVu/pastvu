var auth = require('./auth.js');
var User = require('mongoose').model('User');

module.exports.loadController = function (app) {

	app.dynamicHelpers({
		checkAccess: function(req, res){
			return function (role) {
				var user = req.session.user;
				return User.checkRole(user, role);
			}
		}
	});

	app.get('/', /*auth.restrictToRole('user'),*/ function(req, res){
		res.render('index.jade', {prettyprint:true, pageTitle: 'OldMos', youAreUsingJade: true });
	});
  
	app.get('/checkAlive', auth.restrictToRole('user'), function(req, res, next) {
		res.send({sessionExpires: req.session.cookie.expires});
	});

};