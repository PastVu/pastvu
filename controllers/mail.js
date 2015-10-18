import _ from 'lodash';
import log4js from 'log4js';
import config from '../config';
import nodemailer from 'nodemailer';

const { env, mail: mailConf } = config;

const logger = log4js.getLogger('mail.js');
const logoBuf = new Buffer('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', 'base64');
const emailValidator = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
export const sender = {
    noreply: 'PastVu ★<noreply@pastvu.com>'
};
let transport;

export async function send(options) {
    if (env !== 'production' && options.receiver.email.indexOf('klimashkin') !== 0) {
        return;
    }
    if (!emailValidator.test(options.receiver.email)) {
        return logger.warn(`Email ${options.receiver.email} is not valid, skipping`);
    }

    const alias = String(options.receiver.alias) ? String(options.receiver.alias).replace(/:/g, '') + ' ' : '';
    const smtpobject = {
        from: sender[options.sender] || sender.noreply,
        to: [{ name: alias, address: options.receiver.email }],
        subject: options.subject,
        headers: {
            'X-Laziness-level': 1000
        },
        html: options.body,
        text: options.text || 'Зайдите, чтобы посмотреть'
    };

    if (Array.isArray(options.attachments) && options.attachments.length) {
        smtpobject.attachments = options.attachments;
    }
    if (options.head) {
        if (!Array.isArray(smtpobject.attachments)) {
            smtpobject.attachments = [];
        }
        smtpobject.attachments.push({
            filename: 'logo.png',
            content: logoBuf,
            cid: 'pastvulogo' // should be as unique as possible
        });
    }

    return await new Promise((resolve, reject) => {
        transport.sendMail(smtpobject, function (err, info = {}) {
            if (err) {
                logger.error(err, info);
                reject(err);
            } else {
                const { accepted, rejected } = info;

                if (accepted) {
                    logger.info('Message sent to: ' + _.get(accepted, '[0]'));
                } else {
                    logger.info('Message rejected from: ' + _.get(rejected, '[0]'));
                }
                resolve();
            }

            // if you don't want to use this transport object anymore, uncomment following line
            // transport.close(); // close the connection pool
        });
    });
};

export const ready = new Promise((resolve, reject) => {
    const options = {};

    if (mailConf.type === 'SMTP') {
        options.rateLimit = 10;

        if (mailConf.service) {
            options.service = mailConf.service;
        } else if (mailConf.host && mailConf.port) {
            options.host = mailConf.host;
            options.port = mailConf.port;
        }
        if (mailConf.secure) {
            options.secure = true;
        }
        if (mailConf.auth) {
            options.auth = mailConf.auth;
        }

        // With simple option uses 'nodemailer-smtp-transport'
        transport = nodemailer.createTransport(require('nodemailer-smtp-pool')(options));
    } else if (mailConf.type === 'SES') {
        options.accessKeyId = mailConf.AWSAccessKeyID;
        options.secretAccessKey = mailConf.AWSSecretKey;
        options.region = 'us-east-1';
        transport = nodemailer.createTransport(require('nodemailer-ses-transport')(options));
    } else {
        logger.error('Mail not configured. Unknow transport type', mailConf.type);
        return reject({ message: 'Mail not configured. Unknow transport type' });
    }

    logger.info('Mail configured with %s transport', mailConf.type);
    resolve();
});