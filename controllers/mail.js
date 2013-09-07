'use strict';

var nodemailer = require('nodemailer'),
	log4js = require('log4js'),
	transport, app,
	Utils = require('../commons/Utils.js'),
	mailConf = global.appVar.mail,

	sender = {
		noreply: 'PastVu ★<noreply@pastvu.com>'
	};

var logger = log4js.getLogger("mail.js");

module.exports.send = function send(mess, callback) {
	logger.info('Sending Mail');
	transport.sendMail(mess, function (err) {
		if (callback) {
			callback(err);
		}

		// if you don't want to use this transport object anymore, uncomment following line
		//transport.close(); // close the connection pool
	});
};
module.exports.send2 = function send(options, callback) {
	logger.info('Sending Mail');
	transport.sendMail(
		{
			from: sender[options.sender] || sender.noreply,
			to: (options.receiver.alias ? options.receiver.alias + ' ' : '') + '<' + options.receiver.email + '>',
			subject: options.subject,
			headers: {
				'X-Laziness-level': 1000
			},
			generateTextFromHTML: true,
			html: options.body
		},
		function (err) {
			if (callback) {
				callback(err);
			}

			// if you don't want to use this transport object anymore, uncomment following line
			//transport.close(); // close the connection pool
		}
	);
};
module.exports.sender = sender;


module.exports.loadController = function (a) {
	app = a;
	var options = {};

	if (mailConf.type === 'SMTP') {
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
		transport = nodemailer.createTransport(mailConf.type, options);
		logger.info('SMTP Configured');
	} else {
		logger.warn('SMTP not configured. Options is empty');
	}
};
