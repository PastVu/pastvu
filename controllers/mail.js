var nodemailer = require('nodemailer'),
    log4js = require('log4js'),
    transport, app;

var logger = log4js.getLogger("mail.js");

module.exports.send = function send(mess, callback) {
    logger.info('Sending Mail');
    transport.sendMail(mess, function (error) {
        if (callback) callback.call(null, error);
        // if you don't want to use this transport object anymore, uncomment following line
        //transport.close(); // close the connection pool
    });
};

module.exports.loadController = function (a) {
    app = a;

    // Create a SMTP transport object
    transport = nodemailer.createTransport("SMTP", {
        service: 'Gmail', // use well known service
        auth: {
            user: "oldmos2@gmail.com",
            pass: "zaq1xsw21"
        }
    });
    logger.info('SMTP Configured');
};
