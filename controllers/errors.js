'use strict';

var ms404 = {
        body: 'The page you requested was not found'
    },
    ms500 = {
        body: 'Sorry, server failed to fulfill an apparently request'
    };

var neoError = {
    e404: function e404(msgs) {
        this.msgs = msgs;
        Error.call(this);
        Error.captureStackTrace(this, e404);
    },
    e404Virgin: function e404Virgin(req, res, msgss) {
        var msgs = ms404;
        if (msgss) {
            msgs = {}.extend(ms404).extend(msgss);
        }
        res.statusCode = 404;
        res.render('status/404.jade', {mess404: msgs.body});
    },
    e500: function e500(msgs) {
        this.msgs = msgs;
        Error.call(this);
        Error.captureStackTrace(this, e500);
    },
    e500Virgin: function e500Virgin(req, res, msgss) {
        var msgs = ms500;
        if (msgss) {
            msgs = {}.extend(ms500).extend(msgss);
        }
        res.statusCode = 500;
        res.render('status/500.jade', {mess500: msgs.body});
    }
};
neoError.e404.prototype = Object.create(Error.prototype);
neoError.e500.prototype = Object.create(Error.prototype);
module.exports.err = neoError;

module.exports.loadController = function (app) {

    app.get('/404', function (req, res) {
        throw new neoError.e404();
    });
    app.get('/500', function (req, res) {
        throw new neoError.e500();
    });

    app.use(function (err, req, res, next) {
        if (err instanceof neoError.e404 || err.code === 'ENOTDIR') {
            neoError.e404Virgin(req, res, err.msgs);
        } else if (err instanceof neoError.e500) {
            neoError.e500Virgin(req, res, err.msgs);
        } else {
            neoError.e500Virgin(req, res, err.msgs);
        }
    });

};