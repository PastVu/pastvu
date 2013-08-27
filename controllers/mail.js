'use strict';

var nodemailer = require('nodemailer'),
    log4js = require('log4js'),
    transport, app,
	Utils = require('../commons/Utils.js'),
	mailConf = global.appVar.mail;

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
	var options = {};

	if (mailConf.type === 'smtp') {
		options.auth = mailConf.auth;

		if (options.secureConnection) {
			options.secureConnection = true;
		}

		if (mailConf.host && mailConf.port) {
			options.host = mailConf.host;
			options.port = mailConf.port;
		} else if (mailConf.service) {
			options.servise = mailConf.service;
		}
	} else if (mailConf.type === 'SES') {
		options.ServiceUrl = mailConf.ServiceUrl;
		options.AWSAccessKeyID = mailConf.AWSAccessKeyID;
		options.AWSSecretKey = mailConf.AWSSecretKey;
	}

    // Create a SMTP transport object
	if (!Utils.isObjectEmpty(options)) {
        transport = nodemailer.createTransport("SMTP", options);
        logger.info('SMTP Configured');
	} else {
		logger.warn('SMTP not configured. Options is empty');
	}
};
