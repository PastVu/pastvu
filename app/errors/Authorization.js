import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Authorization error, raise when user has no access rights to resources
 * Params: timeout number(ms) or object with timeout number property and additional data (can override code, message)
 */
export default class AuthorizationError extends ApplicationError {

    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.DENY
        });

        super(data, rid);
    }

}

AuthorizationError.prototype.name = 'AuthorizationError';