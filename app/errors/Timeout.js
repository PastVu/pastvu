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
        const { timeout, ...details } = data;

        _.defaults(details, {
            code: constants.TIMEOUT,
            message: `${errorMsgs[constants.TIMEOUT]} (${ms(timeout, { long: true })})`
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