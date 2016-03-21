import _ from 'lodash';
import constants from './constants';
import ApplicationError from './Application';

/**
 * Authentication error
 * Responsible for login, registration, password forms
 * By default stack will not be printed (trace: false)
 */
export default class AuthenticationError extends ApplicationError {

    constructor(data = {}, rid) {
        if (typeof data === 'string') {
            data = { code: data };
        }

        _.defaults(data, {
            code: constants.AUTHENTICATION,
            trace: false
        });

        super(data, rid);
    }

}

AuthenticationError.prototype.name = 'AuthenticationError';