/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import ms from 'ms';
import _ from 'lodash';
import errorMsgs from './intl';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Timeout error
 * Params: timeout number(ms) or object with timeout number property and additional data (can override code, message)
 *
 * @example
 * throw new TimeoutError(5000)
 *
 * @example
 * throw new TimeoutError({timeout: 5000, message: 'Custom message', somedata: {}, somestring: ''})
 */
export default class TimeoutError extends ApplicationError {
    constructor(data = {}, rid) {
        if (typeof data === 'number') {
            data = { timeout: data };
        }

        const { timeout = 0, ...details } = data;

        _.defaults(details, {
            code: constants.TIMEOUT,
            statusCode: 408,
            message: `${errorMsgs[constants.TIMEOUT]}` + (timeout ? ` (${ms(timeout, { long: true })})` : ''),
        });

        super(details, rid);

        this.timeout = timeout;
    }

    toJSON() {
        const { timeout } = this;

        return Object.assign(super.toJSON(), { timeout });
    }
}

TimeoutError.prototype.name = 'TimeoutError';
