var nodemailer = require('nodemailer'),
    log4js = require('log4js'),
    transport, app,
	smtpConf = global.appVar.smtp,
	auth = global.appVar.smtp.auth;

var logger = log4js.getLogger("mail.js");

module.exports.send = function send(mess, callback) {
    logger.info('Sending Mail');
    transport.sendMail(mess, function (error) {
        if (callback) {
            callback.call(null, error);
        }
        // if you don't want to use this transport object anymore, uncomment following line
        //transport.close(); // close the connection pool
    });
};

module.exports.loadController = function (a) {
    app = a;
	var smtp_options = {auth: auth};
	if (smtpConf.host && smtpConf.port) {
		smtp_options.host = smtpConf.host;
		smtp_options.port = smtpConf.port;
	} else {
		smtp_options.servise = smtpConf.service;
	}

    // Create a SMTP transport object
    transport = nodemailer.createTransport("SMTP", smtp_options);
    logger.info('SMTP Configured');
};
