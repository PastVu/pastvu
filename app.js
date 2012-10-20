#!/usr/bin/env node
var fs = require('fs'),
    port = 3000,
    express = require('express'),
    connect = require('express/node_modules/connect'),
    gzippo = require('gzippo'),
    Utils = require('./commons/Utils.js'),
    File = require("file-utils").File,
    log4js = require('log4js'),
    argv = require('optimist').argv,

    mongodb = require('connect-mongodb/node_modules/mongodb'),
    mongoStore = require('connect-mongodb'),
    server_config = new mongodb.Server('localhost', 27017, {auto_reconnect: true, native_parser: true}),
    mongo_store = new mongoStore({db: new mongodb.Db('oldmos', server_config, {}), reapInterval: 3000}),

    parseCookie = connect.utils.parseCookie,

    lessMiddleware = require('less-middleware'),
    mongoose = require('mongoose'),
    mc = require('mc'), // memcashed
    ms =  require('ms'), // Tiny milisecond conversion utility
    errS = require('./controllers/errors.js').err,
    app, io;

/**
 * log the cheese logger messages to a file, and the console ones as well.
 */
console.log('\n');
log4js.configure('./log4js.json', {cwd: './logs'});
var logger = log4js.getLogger("app.js");

/**
 * Включаем "наши" модули
 */
require('./commons/JExtensions.js');
require('./commons/Utils.js');

/**
 * Окружение (dev, test, prod)
 */
var env = argv.env || 'dev',
    pub = (env === 'prod' ? '/public-build' : '/public');

logger.info('Starting Node(' + process.versions.node + ') with v8(' + process.versions.v8 + '), Express(' + express.version + ') and Mongoose(' + mongoose.version + ') on process pid:' + process.pid);


app = module.exports = express.createServer();
app.version = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8')).version;
app.hash = (env === 'dev' ? app.version : Utils.randomString(10));
logger.info('Application Hash: ' + app.hash);

io = require('socket.io').listen(app);

new File("publicContent/avatars").createDirectory();
new File("publicContent/photos/micro").createDirectory();
new File("publicContent/photos/thumb").createDirectory();
new File("publicContent/photos/standard").createDirectory();
new File("publicContent/photos/origin").createDirectory();
new File("publicContent/incoming").createDirectory();

app.configure(function () {

    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.set('view options', {layout: false, pretty: true});
    app.set('db-uri', 'mongodb://localhost:27017/oldmos');

    //app.use(express.logger({ immediate: false, format: 'dev' }));

    app.use(express.errorHandler({ dumpExceptions: (env !== 'prod'), showStack: (env !== 'prod') }));
    app.use(express.favicon(__dirname + pub + '/favicon.ico', { maxAge: ms('1d') }));
    if (env === 'dev') {
        app.use('/style', lessMiddleware({src: __dirname + pub + '/style', force: true, once: false, compress: false, debug: false}));
    } else {
        app.use('/style', lessMiddleware({src: __dirname + pub + '/style', force: false, once: true, compress: true, yuicompress: true, optimization: 2, debug: false}));
    }
    app.use(gzippo.staticGzip(__dirname + pub, {maxAge: ms('1d')})); //app.use(express.static(__dirname + pub, {maxAge: ms('1d')}));
    app.use(gzippo.staticGzip(__dirname + '/views', {maxAge: ms('1d')})); //app.use(express.static(__dirname + pub, {maxAge: ms('1d')}));

    app.use('/_avatar', express.static(__dirname + '/publicContent/avatars', {maxAge: ms('1d')}));
    app.use('/_photo', express.static(__dirname + '/publicContent/photos', {maxAge: ms('7d')}));

    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.session({ cookie: {maxAge: ms('12h')}, store: mongo_store, secret: 'OldMosSess', key: 'oldmos.sid' }));
    app.use(express.methodOverride());

    app.use(gzippo.compress());
    app.use(app.router);
    var Session = connect.middleware.session.Session;
    io.set('transports', ['websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
    io.set('authorization', function (data, accept) {
        if (!data.headers.cookie) {
            return accept('No cookie transmitted.', false);
        }
        data.cookie = parseCookie(data.headers.cookie);
        data.sessionID = data.cookie['oldmos.sid'];

        mongo_store.load(data.sessionID, function (err, session) {
            if (err || !session) {
                return accept('Error: ' + err, false);
            }
            if (session.login) {
                console.info("%s entered", session.login);
            }
            data.session = session;
            return accept(null, true);
        });
    });

    if (env === 'dev') {
        //io.enable('browser client minification');  // send minified client
        //io.enable('browser client etag');          // apply etag caching logic based on version number
        //io.enable('browser client gzip');          // gzip the file
        io.set('log level', 1);
        require('reloader')({
            watchModules: false,
            onStart: function () {
            },
            onReload: function () {
                app.listen(port);
            }
        });
    } else {
        io.enable('browser client minification');  // send minified client
        io.enable('browser client etag');          // apply etag caching logic based on version number
        io.enable('browser client gzip');          // gzip the file
        io.set('log level', 1);                    // reduce logging
    }
});

// connecting to db with mongoose
var db = mongoose.createConnection(app.set('db-uri'))
    .once('open', function () {
        logger.info("Connected to mongo: " + app.set('db-uri'));
    })
    .on('error', function () {
        logger.fatal("Connection error to mongo: " + app.set('db-uri'));
    });

// connecting to memcached
var memcached = new mc.Client();
memcached.connect(function () {
    logger.info("Connected to the localhost memcache on port 11211");
});

mongoose.Model.saveUpsert = function (findQuery, properties, cb) {
    this.findOne(findQuery, function (err, doc) {
        if (err && cb) {
            cb(err);
        }
        if (!doc) {
            doc = new this(findQuery);
        }
        for (var p in properties) {
            if (properties.hasOwnProperty(p)){
                doc[p] = properties[p];
            }
        }
        doc.save(!cb ? undefined : function (err, doc) {
            if (err)  {
                cb(err);
                return;
            }
            cb(null, doc);
        });
    }.bind(this));
};
// creating models
require(__dirname + '/models/Counter.js').makeModel(db);
require(__dirname + '/models/Settings.js').makeModel(db);
require(__dirname + '/models/Role.js').makeModel(db);
require(__dirname + '/models/User.js').makeModel(db);
require(__dirname + '/models/Photo.js').makeModel(db);


// loading controllers
require('./controllers/_session.js').loadController(app, db, io, mongo_store, memcached);
require('./controllers/errors.js').loadController(app);
require('./controllers/mail.js').loadController(app);
require('./controllers/auth.js').loadController(app, db, io, mongo_store);
require('./controllers/index.js').loadController(app, db, io);
require('./controllers/photo.js').loadController(app, db, io);
require('./controllers/profile.js').loadController(app, db, io);
require('./controllers/admin.js').loadController(app, db, io);
require('./controllers/tpl.js').loadController(app);
app.get('*', function (req, res) {
    errS.e404Virgin(req, res);
});

/**
 * Handling uncaught exceptions
 */
process.on('uncaughtException', function (err) {
    // Add here storage for saving and resuming
    logger.fatal("PROCESS uncaughtException: " + err.message);
    logger.fatal(err.stack);
});

if (env !== 'dev') {
    app.listen(port);
}

logger.info('Express server listening on port %d in %s-mode \n', port, env.toUpperCase());