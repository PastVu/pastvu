/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import _ from 'lodash';
import log4js from 'log4js';
import config from '../config';
import nodemailer from 'nodemailer';
import constantsError from '../app/errors/constants';
import { ApplicationError } from '../app/errors';
import Utils from '../commons/Utils';

const { mail: mailConf } = config;

const logger = log4js.getLogger('mail.js');
export const sender = {
    noreply: 'PastVu ★<noreply@pastvu.com>',
};
let transport;

export async function send(options) {
    if (!Utils.validateEmail(options.receiver.email)) {
        logger.warn(`Email ${options.receiver.email} is not valid, skipping`);

        return;
    }

    const alias = String(options.receiver.alias) ? String(options.receiver.alias).replace(/:/g, '') + ' ' : '';
    const smtpobject = {
        from: sender[options.sender] || sender.noreply,
        to: [{ name: alias, address: options.receiver.email }],
        bcc: options.bcc || '',
        subject: options.subject,
        headers: {
            'X-Laziness-level': 1000,
        },
        html: options.body,
        text: options.text || 'Open the site to see',
    };

    if (Array.isArray(options.attachments) && options.attachments.length) {
        smtpobject.attachments = options.attachments;
    }

    try {
        const { accepted, rejected } = await transport.sendMail(smtpobject);

        if (accepted) {
            logger.info('Message sent to: ' + _.get(accepted, '[0]'));
        } else {
            logger.info('Message rejected from: ' + _.get(rejected, '[0]'));
        }
    } catch (err) {
        logger.error(err);
        throw new ApplicationError(constantsError.MAIL_SEND);
    }
}

export const ready = new Promise((resolve, reject) => {
    const options = {};

    if (mailConf.type === 'SMTP') {
        options.rateLimit = 100;
        options.rateDelta = 100;
        options.pool = true;
        options.maxConnections = 10;
        options.maxMessages = 100;

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

        transport = nodemailer.createTransport(options);
    } else {
        logger.error('Mail not configured. Unknown transport type', mailConf.type);

        /* eslint-disable-next-line prefer-promise-reject-errors */
        return reject({ message: 'Mail not configured. Unknown transport type' });
    }

    logger.info('Mail configured with %s transport', mailConf.type);
    resolve();
});
