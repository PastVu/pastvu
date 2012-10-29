var auth = require('./auth.js'),
    Settings,
    User,
    Step = require('step'),
    log4js = require('log4js');

module.exports.loadController = function (app, db, io) {
    var logger = log4js.getLogger("index.js");

    Settings = db.model('Settings');
    User = db.model('User');

    app.get('/', function (req, res) {
        res.statusCode = 200;
        res.render('index.jade', {pageTitle: 'OldMos2'});
    });

    app.get('/updateCookie', function (req, res) {
        res.send('updateCookie', 200);
    });

    io.sockets.on('connection', function (socket) {
        var hs = socket.handshake,
            session = hs.session;
        //session.message = 'Thank you! Your registration is confirmed. Now you can enter using your username and password';
        if (session.message) {
            socket.emit('initMessage', {init_message: session.message});
            session.message = null;
        }

        socket.on('giveGlobeParams', function (data) {
            var params = {
                LoggedIn: !!session.login,
                ip: hs.address
            };
            Step(
                function () {
                    Settings.find({}, this.parallel());
                    if (params.LoggedIn) User.findOne({'login': session.login}).select({ 'pass': 0, 'salt': 0, 'roles': 0}).exec(this.parallel());
                },
                function (err, settings, user) {
                    var x = settings.length - 1;
                    do {
                        params[settings[x]['key']] = settings[x]['val']
                    } while (x--);
                    params.user = user;
                    this();
                },
                function () {
                    socket.emit('takeGlobeParams', params.extend({appHash: app.hash}));
                }
            );
        });
    });


};